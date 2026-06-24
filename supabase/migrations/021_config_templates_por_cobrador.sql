-- SAVAN Recupera — 021: Campanha/Mensagens/Descontos por conta (cobrador)
-- Escopa `configuracoes` e `templates_mensagem` por cobrador, no MESMO padrão de `segredos`
-- (linha global = cobrador_id NULL; linha do cobrador sobrescreve; o resto cai no global).
-- Cada cobrador edita os SEUS ajustes; o admin vê/edita os de todos (separados) + o global.
-- Também escopa fn_proposta (faixas) e fn_limite_chip (curva de aquecimento) ao cobrador da carteira/chip.

-- ============================================================
-- 1) COLUNA cobrador_id + (re)estruturação das chaves únicas
-- ============================================================

-- CONFIGURACOES: a PK era (chave). Passa a permitir 1 linha global + 1 por cobrador.
alter table configuracoes
  add column if not exists cobrador_id uuid references usuarios_app (id) on delete cascade;
comment on column configuracoes.cobrador_id is 'NULL = padrão global da plataforma (admin). Preenchido = ajuste do cobrador (sobrescreve o global p/ as chaves por conta).';
alter table configuracoes drop constraint if exists configuracoes_pkey;
create unique index if not exists uq_config_global   on configuracoes (chave) where cobrador_id is null;
create unique index if not exists uq_config_cobrador on configuracoes (chave, cobrador_id) where cobrador_id is not null;
create index if not exists idx_config_cobrador on configuracoes (cobrador_id);

-- TEMPLATES_MENSAGEM: id continua PK; ganha dono. NULL = modelo global/padrão (gerido pelo admin).
alter table templates_mensagem
  add column if not exists cobrador_id uuid references usuarios_app (id) on delete cascade;
comment on column templates_mensagem.cobrador_id is 'NULL = modelo padrão global. Preenchido = modelo do cobrador (usado no lugar do global quando existir p/ aquele tipo).';
create index if not exists idx_templates_cobrador on templates_mensagem (cobrador_id);

-- ============================================================
-- 2) RLS — leitura por escopo (global p/ todos + os seus); escrita admin(global)/cobrador(os seus)
--    As escritas do painel passam por API com service_role; estas policies blindam o acesso anônimo.
-- ============================================================

-- CONFIGURACOES: todo autenticado lê o global (defaults/edge badges); cobrador lê os seus; admin lê tudo.
drop policy if exists sel_configuracoes on configuracoes;
drop policy if exists ins_configuracoes on configuracoes;
drop policy if exists upd_configuracoes on configuracoes;
drop policy if exists del_configuracoes on configuracoes;
create policy sel_configuracoes on configuracoes for select to authenticated
  using (cobrador_id is null or fn_role() = 'admin' or cobrador_id = fn_meu_cobrador());
create policy ins_configuracoes on configuracoes for insert to authenticated
  with check (fn_role() = 'admin' or (fn_role() = 'cobrador' and cobrador_id = auth.uid()));
create policy upd_configuracoes on configuracoes for update to authenticated
  using (fn_role() = 'admin' or (fn_role() = 'cobrador' and cobrador_id = auth.uid()))
  with check (fn_role() = 'admin' or (fn_role() = 'cobrador' and cobrador_id = auth.uid()));
create policy del_configuracoes on configuracoes for delete to authenticated
  using (fn_role() = 'admin' or (fn_role() = 'cobrador' and cobrador_id = auth.uid()));

-- TEMPLATES: cobrador só vê/gere os SEUS (o global é fallback gerido pelo admin); admin vê tudo.
drop policy if exists sel_templates on templates_mensagem;
drop policy if exists ins_templates on templates_mensagem;
drop policy if exists upd_templates on templates_mensagem;
drop policy if exists del_templates on templates_mensagem;
create policy sel_templates on templates_mensagem for select to authenticated
  using (fn_role() = 'admin' or cobrador_id = fn_meu_cobrador());
create policy ins_templates on templates_mensagem for insert to authenticated
  with check (fn_role() = 'admin' or (fn_role() = 'cobrador' and cobrador_id = auth.uid()));
create policy upd_templates on templates_mensagem for update to authenticated
  using (fn_role() = 'admin' or (fn_role() = 'cobrador' and cobrador_id = auth.uid()))
  with check (fn_role() = 'admin' or (fn_role() = 'cobrador' and cobrador_id = auth.uid()));
create policy del_templates on templates_mensagem for delete to authenticated
  using (fn_role() = 'admin' or (fn_role() = 'cobrador' and cobrador_id = auth.uid()));

-- ============================================================
-- 3) fn_proposta — faixas/validade: carteira override -> cobrador da carteira -> global
--    (cada subquery retorna no máx. 1 linha por causa dos índices únicos parciais; sem ambiguidade)
-- ============================================================
create or replace function fn_proposta(p_devedor_id bigint)
returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  v_dev devedores%rowtype;
  v_override jsonb;
  v_cob uuid;
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

  -- override + cobrador dono da carteira
  select config_override, cobrador_id into v_override, v_cob from carteiras where id = v_dev.carteira_id;

  v_cfg := coalesce(
    v_override->'faixas_desconto',
    (select valor from configuracoes where chave = 'faixas_desconto' and cobrador_id = v_cob),
    (select valor from configuracoes where chave = 'faixas_desconto' and cobrador_id is null)
  );
  v_min := coalesce((v_cfg->>'valor_minimo_pix')::numeric, 30);
  v_validade_dias := coalesce(
    (v_override->>'validade_proposta_dias')::int,
    (select (valor)::text::int from configuracoes where chave = 'validade_proposta_dias' and cobrador_id is null),
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

-- ============================================================
-- 4) fn_limite_chip — curva de aquecimento: cobrador do chip -> global (por chave) -> 'aquecimento'
-- ============================================================
create or replace function fn_limite_chip(p_chip_id int)
returns int
language plpgsql stable
set search_path = public
as $$
declare
  v_chip chips%rowtype;
  v_cob uuid;
  v_aq jsonb;
  v_chave text;
  v_dia int;
  v_lim int := 0;
  f jsonb;
begin
  select * into v_chip from chips where id = p_chip_id;
  if not found then return 0; end if;

  if v_chip.limite_dia_override is not null then return v_chip.limite_dia_override; end if;
  if v_chip.data_ativacao is null then return 0; end if;
  v_dia := (current_date - v_chip.data_ativacao) + 1;
  v_cob := v_chip.cobrador_id;

  if v_chip.maturidade = 'aquecido' then
    v_chave := coalesce(v_chip.aquecimento_perfil, 'aquecimento_rapido');
  else
    v_chave := coalesce(v_chip.aquecimento_perfil, 'aquecimento');
  end if;

  -- curva do cobrador (se houver) -> curva global da chave -> curva global 'aquecimento'
  select valor into v_aq from configuracoes where chave = v_chave and cobrador_id = v_cob;
  if v_aq is null then select valor into v_aq from configuracoes where chave = v_chave and cobrador_id is null; end if;
  if v_aq is null then select valor into v_aq from configuracoes where chave = 'aquecimento' and cobrador_id = v_cob; end if;
  if v_aq is null then select valor into v_aq from configuracoes where chave = 'aquecimento' and cobrador_id is null; end if;
  if v_aq is null then return 0; end if;

  for f in select * from jsonb_array_elements(v_aq) loop
    if v_dia >= (f->>'de')::int and v_dia <= (f->>'ate')::int then
      v_lim := (f->>'limite')::int;
    end if;
  end loop;
  return v_lim;
end;
$$;

revoke execute on function fn_limite_chip(int) from public, anon;
revoke execute on function fn_proposta(bigint) from public, anon;
