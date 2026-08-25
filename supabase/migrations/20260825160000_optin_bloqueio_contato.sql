-- Fatia 4 — o opt-in vira estado da conversa, e o "não" vira trava de banco.
--
-- ADR-0003. Hoje `nao_perturbe` existe só como estado (`status_devedor`, `motivo_encerramento`) e
-- como regra no prompt do robô. Isso bastava com um número; com vários números virtuais que caem e
-- são substituídos, não basta mais: nada impede o chip novo recontatar quem recusou pelo chip
-- antigo. E um "não" recontatado é a denúncia mais fácil de provocar que existe.
--
-- Regra que esta migration torna estrutural: quem recusou não recebe abordagem de NENHUM chip,
-- presente ou futuro. Não é regra que o modelo possa atropelar — é constraint.
--
-- Idempotente: pode rodar duas vezes seguidas.

-- ---------------------------------------------------------------- 1) opt-in na conversa
alter table conversas add column if not exists opt_in text not null default 'nao_perguntado';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'conversas_opt_in_check') then
    alter table conversas add constraint conversas_opt_in_check
      check (opt_in in ('nao_perguntado', 'aguardando', 'concedido', 'recusado'));
  end if;
end
$$;

comment on column conversas.opt_in is
  'Permissão do devedor para o robô falar do assunto. nao_perguntado → aguardando (perguntamos) → '
  'concedido | recusado. Antes de "concedido" o robô NÃO pode revelar CPF, valor, ano, processo nem '
  'a palavra dívida — ver ADR-0003.';

-- ---------------------------------------------------------------- 2) a trava permanente
create table if not exists bloqueios_contato (
  id           bigint generated always as identity primary key,
  devedor_id   bigint references devedores (id) on delete cascade,
  telefone_e164 text,
  motivo       text not null check (motivo in ('nao_perturbe', 'denuncia', 'pessoa_errada', 'falecimento', 'manual')),
  origem       text,
  criado_em    timestamptz not null default now(),
  -- Bloqueio sem alvo nenhum não bloqueia nada.
  constraint bloqueios_contato_alvo check (devedor_id is not null or telefone_e164 is not null)
);

comment on table bloqueios_contato is
  'Trava PERMANENTE de contato (ADR-0003). Vale para todos os chips, presentes e futuros. '
  'Escrita só por service_role; nunca apagada por rotina automática.';

-- Um bloqueio por alvo: reprocessar o mesmo opt-out não empilha linha.
create unique index if not exists bloqueios_contato_devedor_key
  on bloqueios_contato (devedor_id) where devedor_id is not null;
create unique index if not exists bloqueios_contato_telefone_key
  on bloqueios_contato (telefone_e164) where telefone_e164 is not null;

alter table bloqueios_contato enable row level security;

-- Leitura pelo dono do devedor (mesmo escopo por tenant do resto); escrita só service_role.
drop policy if exists sel_bloqueios_contato on bloqueios_contato;
create policy sel_bloqueios_contato on bloqueios_contato
  for select to authenticated
  using (
    fn_role() = 'admin'::papel_usuario
    or devedor_id in (
      select d.id from devedores d join carteiras c on c.id = d.carteira_id
      where c.cobrador_id = auth.uid()
    )
  );

revoke insert, update, delete on bloqueios_contato from authenticated, anon;

-- ---------------------------------------------------------------- 3) opt-out grava a trava
-- Trigger AFTER, separado do trg_classificar_motivo_encerramento (que é BEFORE e mexe em NEW):
-- misturar os dois faria a gravação do bloqueio depender da ordem de execução dos triggers.
create or replace function fn_gravar_bloqueio_optout()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.motivo_encerramento = 'nao_perturbe' then
    insert into bloqueios_contato (devedor_id, motivo, origem)
    values (new.devedor_id, 'nao_perturbe', 'conversa:' || new.id)
    on conflict (devedor_id) where devedor_id is not null do nothing;
  end if;
  return null;
end;
$$;

revoke execute on function fn_gravar_bloqueio_optout() from public, anon, authenticated;

drop trigger if exists trg_gravar_bloqueio_optout on conversas;
create trigger trg_gravar_bloqueio_optout
after insert or update of estado, motivo_encerramento on conversas
for each row execute function fn_gravar_bloqueio_optout();

-- ---------------------------------------------------------------- 4) o seletor respeita a trava
-- Mesma assinatura e mesmo corpo da 026, com UM gate novo: quem está bloqueado nunca entra em lote.
-- É aqui que a trava deixa de ser documentação e passa a ser impossível de furar.
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
      and (fe.chip_designado_id = p_chip_id or fe.chip_designado_id is null)
      -- chip com abordagem travada não INICIA conversa (continua respondendo pelo bot-turno)
      and not exists (
        select 1 from chips c3
        where c3.id = p_chip_id and c3.abordagem_travada_ate is not null
          and c3.abordagem_travada_ate > now()
      )
      -- ADR-0003: quem pediu para parar não recebe abordagem de nenhum chip, nunca mais
      and not exists (
        select 1 from bloqueios_contato b where b.devedor_id = fe.devedor_id
      )
      and exists (
        select 1 from devedores d
        join carteiras c on c.id = d.carteira_id
        where d.id = fe.devedor_id and c.status = 'ativa'
      )
    order by (fe.chip_designado_id = p_chip_id) desc nulls last, fe.prioridade desc, fe.id
    limit p_n
    for update skip locked
  )
  returning *;
$$;

-- ---------------------------------------------------------------- 5) backfill do histórico
-- Quem já pediu para parar antes desta migration também está protegido.
insert into bloqueios_contato (devedor_id, motivo, origem)
select distinct c.devedor_id, 'nao_perturbe', 'backfill:motivo_encerramento'
from conversas c
where c.motivo_encerramento = 'nao_perturbe' and c.devedor_id is not null
on conflict (devedor_id) where devedor_id is not null do nothing;

insert into bloqueios_contato (devedor_id, motivo, origem)
select d.id, 'nao_perturbe', 'backfill:status_devedor'
from devedores d
where d.status = 'nao_perturbe'
on conflict (devedor_id) where devedor_id is not null do nothing;
