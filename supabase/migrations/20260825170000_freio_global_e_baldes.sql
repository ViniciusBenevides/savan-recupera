-- Fatias 5 e 6 — freio global da operação e os três baldes da base existente.
-- Idempotente: pode rodar duas vezes seguidas.

-- ---------------------------------------------------------------- 1) freio global (Fatia 5)
-- O ritmo continua sendo POR CHIP (Q6) — o WhatsApp julga cada linha isoladamente e travar o total
-- só desperdiça linha saudável. Isto é o botão de pânico: desacelerar dez números de uma vez sem
-- editar dez cadastros. Nasce DESLIGADO de propósito: freio que vem ligado vira ruído, alguém o
-- desliga sem entender, e aí ele não está lá quando precisa.
insert into configuracoes (chave, valor, descricao)
select 'freio_global',
       '{"ativo": false, "msgs_hora": null}'::jsonb,
       'Teto de abordagens por hora somando TODOS os chips. Desligado por padrão; é o freio de emergência.'
where not exists (select 1 from configuracoes where chave = 'freio_global' and cobrador_id is null);

-- ---------------------------------------------------------------- 2) balde do devedor (Fatia 6)
alter table devedores add column if not exists balde text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'devedores_balde_check') then
    alter table devedores add constraint devedores_balde_check
      check (balde is null or balde in ('recontato_continuidade', 'primeira_vez', 'nunca_mais'));
  end if;
end
$$;

comment on column devedores.balde is
  'Como tratar quem já foi contatado pela conta banida (§38): recontato_continuidade (respondeu → '
  'anuncia a troca de número), primeira_vez (nunca respondeu → opt-in do zero, sem citar o contato '
  'anterior) ou nunca_mais (recusou → trava). Nulo = ainda não classificado.';

-- ---------------------------------------------------------------- 3) backfill a partir do real
-- A ordem importa e é a mesma de `classificarBalde`: bloqueio vence tudo. Quem respondeu e DEPOIS
-- pediu para parar é nunca_mais — o "não" é mais recente e mais forte que o engajamento anterior.

-- 3.1 primeira_vez: o padrão de quem não tem nenhum sinal contrário
update devedores set balde = 'primeira_vez' where balde is null;

-- 3.2 recontato_continuidade: chegou a mandar qualquer mensagem de entrada, por qualquer chip
update devedores d set balde = 'recontato_continuidade'
where exists (
  select 1 from conversas c
  join mensagens m on m.conversa_id = c.id
  where c.devedor_id = d.id and m.direcao = 'entrada'
    and m.conteudo is not null and btrim(m.conteudo) <> ''
);

-- 3.3 nunca_mais: por último, para sobrescrever qualquer um dos anteriores
update devedores d set balde = 'nunca_mais'
where exists (select 1 from bloqueios_contato b where b.devedor_id = d.id);

create index if not exists idx_devedores_balde on devedores (balde) where balde is not null;
