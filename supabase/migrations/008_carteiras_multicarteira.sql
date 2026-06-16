-- SAVAN Recupera — 008: multi-carteira (produto vendável)
-- Carteiras (uma por planilha subida), registro de importações à prova de duplicata,
-- escopo por carteira nas tabelas operacionais, dedup por (carteira_id, cpf_cnpj),
-- prompt/guardrails do robô editáveis (padrão global) e funções cientes da carteira.

-- ===== ENUM =====
create type status_carteira as enum ('importando','ativa','pausada','arquivada');

-- ===== TABELA: carteiras =====
create table carteiras (
  id bigint generated always as identity primary key,
  nome text not null unique,                 -- nome amigável da carteira (ex.: "Carteira Maio 2026")
  credor text,                               -- nome do credor exibido ao devedor
  descricao text,
  status status_carteira not null default 'importando',
  num_devedores int not null default 0,
  soma_saldo numeric(14,2) not null default 0,
  -- Overrides do robô/regras (NULL = herda o padrão global de `configuracoes`)
  prompt_persona text,                       -- personalidade/objetivo do robô
  contexto_negocio text,                     -- contexto do credor que o robô menciona
  guardrails jsonb,                          -- regras inegociáveis (ver seeds bot_guardrails)
  config_override jsonb,                     -- {faixas_desconto, janela_envio, intervalo_min_segundos, aquecimento, asaas, validade_proposta_dias}
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create trigger trg_touch_carteiras before update on carteiras
  for each row execute function fn_touch_atualizado_em();

-- ===== TABELA: importacoes (1 linha por upload de planilha) =====
create table importacoes (
  id bigint generated always as identity primary key,
  carteira_id bigint references carteiras (id) on delete cascade,
  arquivo_nome text not null unique,         -- impede subir 2 planilhas com o mesmo nome
  linhas_total int not null default 0,
  linhas_importadas int not null default 0,
  linhas_ignoradas int not null default 0,
  erros jsonb,                               -- relatório por linha (motivo da rejeição)
  status text not null default 'processando' check (status in ('processando','concluida','falhou')),
  criado_por uuid,
  criado_em timestamptz not null default now()
);
create index idx_importacoes_carteira on importacoes (carteira_id);

-- ===== ESCOPO POR CARTEIRA nas tabelas operacionais =====
alter table devedores        add column carteira_id bigint references carteiras (id) on delete cascade;
alter table fila_envios      add column carteira_id bigint references carteiras (id) on delete cascade;
alter table conversas        add column carteira_id bigint references carteiras (id) on delete cascade;
alter table eventos_campanha add column carteira_id bigint;   -- loose (igual devedor_id nesta tabela)

create index idx_devedores_carteira on devedores (carteira_id);
create index idx_fila_carteira on fila_envios (carteira_id);
create index idx_conversas_carteira on conversas (carteira_id);
create index idx_eventos_carteira on eventos_campanha (carteira_id);

-- ===== DEDUP POR CARTEIRA =====
-- `processo` era único global e obrigatório; passa a opcional. A identidade do devedor
-- dentro de uma carteira é (carteira_id, cpf_cnpj). NULLs são distintos no índice único,
-- então a base atual (carteira_id NULL) não conflita até o wipe.
alter table devedores drop constraint if exists devedores_processo_key;
alter table devedores alter column processo drop not null;
create unique index uq_devedores_carteira_cpf on devedores (carteira_id, cpf_cnpj);

-- ===== RLS =====
alter table carteiras enable row level security;
alter table importacoes enable row level security;

create policy sel_carteiras on carteiras for select to authenticated using (true);
create policy ins_carteiras on carteiras for insert to authenticated
  with check (fn_role() in ('admin','operador'));
create policy upd_carteiras on carteiras for update to authenticated
  using (fn_role() in ('admin','operador')) with check (fn_role() in ('admin','operador'));
create policy del_carteiras on carteiras for delete to authenticated
  using (fn_role() = 'admin');

create policy sel_importacoes on importacoes for select to authenticated using (true);
create policy ins_importacoes on importacoes for insert to authenticated
  with check (fn_role() in ('admin','operador'));

-- ===== REALTIME (status/totais da carteira ao vivo no painel) =====
alter publication supabase_realtime add table carteiras;

-- ===== SEEDS: padrão global do robô (antes hard-coded em bot-turno) =====
insert into configuracoes (chave, valor, descricao) values
('bot_persona',
 '"Você é {{nome_bot}}, uma assistente de negociação simpática e objetiva. Seu objetivo é oferecer a QUITAÇÃO VOLUNTÁRIA de uma pendência antiga com desconto, de forma humana e respeitosa."',
 'Personalidade e objetivo do robô (texto base do prompt). Variáveis: {{nome_bot}}, {{primeiro_nome}}.'),
('bot_contexto',
 '"Você atende em nome do credor responsável pela cobrança. Trate a dívida como uma pendência a ser regularizada com uma condição especial."',
 'Contexto do negócio/credor que o robô usa ao falar com o devedor.'),
('bot_guardrails',
 '{"nunca_citar":["Serasa","SPC","nome sujo","negativação","score de crédito","processo judicial","justiça","juros futuros"],"confirmar_identidade":true,"responder_prescricao_honestamente":true,"max_rodadas_desconto":1,"tom":"humano, caloroso, brasileiro, frases curtas, no máximo 2 perguntas por vez e 1 emoji por mensagem","regras_extras":""}',
 'Regras inegociáveis do robô: termos proibidos, confirmação de identidade, honestidade sobre prescrição, limite de desconto extra, tom e regras livres adicionais.');

-- ===== FUNÇÕES CIENTES DA CARTEIRA =====

-- fn_proposta: usa o override de descontos/validade da carteira, com fallback global
create or replace function fn_proposta(p_devedor_id bigint)
returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  v_dev devedores%rowtype;
  v_override jsonb;
  v_cfg jsonb;
  v_idade numeric;
  v_pct numeric := 0;
  v_faixa text := null;
  v_min numeric := 30;
  v_validade_dias int := 7;
  v_valor_final numeric;
  f jsonb;
begin
  select * into v_dev from devedores where id = p_devedor_id;
  if not found then
    return jsonb_build_object('erro', 'devedor_nao_encontrado');
  end if;

  -- override por carteira (se houver)
  select config_override into v_override from carteiras where id = v_dev.carteira_id;

  v_cfg := coalesce(
    v_override->'faixas_desconto',
    (select valor from configuracoes where chave = 'faixas_desconto')
  );
  v_min := coalesce((v_cfg->>'valor_minimo_pix')::numeric, 30);
  v_validade_dias := coalesce(
    (v_override->>'validade_proposta_dias')::int,
    (select (valor)::text::int from configuracoes where chave = 'validade_proposta_dias'),
    7);

  v_idade := coalesce(extract(year from age(current_date, v_dev.vencimento)), 99);

  for f in select * from jsonb_array_elements(coalesce(v_cfg->'faixas', '[]'::jsonb)) loop
    if v_idade >= (f->>'idade_min')::numeric and (f->>'pct')::numeric > v_pct then
      v_pct := (f->>'pct')::numeric;
      v_faixa := format('%s+ anos: %s%%', f->>'idade_min', f->>'pct');
    end if;
  end loop;

  v_valor_final := round(v_dev.saldo * (1 - v_pct / 100.0), 2);
  if v_valor_final < v_min then
    v_valor_final := least(v_dev.saldo, v_min);
  end if;

  return jsonb_build_object(
    'devedor_id', v_dev.id,
    'nome', v_dev.nome,
    'primeiro_nome', initcap(split_part(v_dev.nome, ' ', 1)),
    'ano_divida', extract(year from v_dev.vencimento),
    'idade_anos', v_idade,
    'valor_original', v_dev.saldo,
    'desconto_pct', v_pct,
    'faixa_aplicada', v_faixa,
    'valor_final', v_valor_final,
    'valido_ate', to_char(current_date + v_validade_dias, 'DD/MM/YYYY'),
    'margem_extra_pp', coalesce((v_cfg->>'margem_extra_pp')::numeric, 0)
  );
end;
$$;

-- fn_selecionar_lote: só seleciona devedores de carteiras ATIVAS
create or replace function fn_selecionar_lote(p_chip_id integer, p_n integer)
returns setof fila_envios
language sql
set search_path = public
as $$
  update fila_envios
  set status = 'processando', chip_id = p_chip_id
  where id in (
    select fe.id from fila_envios fe
    where fe.status = 'aguardando'
      and (fe.agendado_para is null or fe.agendado_para <= now())
      and exists (
        select 1 from devedores d
        join carteiras c on c.id = d.carteira_id
        where d.id = fe.devedor_id and c.status = 'ativa'
      )
    order by fe.prioridade desc, fe.id
    limit p_n
    for update skip locked
  )
  returning *;
$$;
