-- Distingue o motivo real do encerramento sem sobrecarregar `estado`.
-- O campo e opcional enquanto a conversa esta ativa e obrigatoriamente assume
-- um dos desfechos conhecidos quando um fluxo o preencher.

alter table public.conversas
  add column if not exists motivo_encerramento text;

alter table public.conversas
  drop constraint if exists conversas_motivo_encerramento_check;

alter table public.conversas
  add constraint conversas_motivo_encerramento_check
  check (motivo_encerramento is null or motivo_encerramento in (
    'pagamento_confirmado',
    'pessoa_errada',
    'nao_perturbe',
    'sem_resposta',
    'outro'
  ));

comment on column public.conversas.motivo_encerramento is
  'Desfecho da conversa: pagamento_confirmado, pessoa_errada, nao_perturbe, sem_resposta ou outro.';

create index if not exists idx_conversas_motivo_encerramento
  on public.conversas (motivo_encerramento)
  where motivo_encerramento is not null;

-- Recupera desfechos antigos somente quando ha evidencia no historico.
-- Pagamento tem precedencia sobre qualquer outro fechamento.
update public.conversas c
set estado = 'pago', motivo_encerramento = 'pagamento_confirmado'
where c.estado in ('pago', 'encerrada')
  and exists (
    select 1 from public.pagamentos p
    where p.devedor_id = c.devedor_id
      and p.status in ('recebido', 'confirmado')
  );

update public.conversas c
set estado = 'encerrada', motivo_encerramento = 'pessoa_errada'
where c.estado = 'encerrada'
  and c.motivo_encerramento is distinct from 'pagamento_confirmado'
  and exists (
    select 1 from public.eventos_campanha e
    where e.devedor_id = c.devedor_id
      and e.tipo = 'pessoa_errada'
  );

update public.conversas
set motivo_encerramento = 'nao_perturbe'
where estado = 'optout';

-- O unico encerramento automatico do follow-up acontece depois de esgotar
-- as tentativas; portanto followups > 0 e um sinal rastreavel de sem resposta.
update public.conversas
set motivo_encerramento = 'sem_resposta'
where estado = 'encerrada'
  and motivo_encerramento is null
  and followups_enviados > 0;

update public.conversas
set motivo_encerramento = 'outro'
where estado = 'encerrada'
  and motivo_encerramento is null;

-- Garante que pagamentos e opt-outs feitos por qualquer integracao futura
-- tambem recebam o desfecho correspondente.
create or replace function public.fn_classificar_motivo_encerramento()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado = 'pago' then
    new.motivo_encerramento := 'pagamento_confirmado';
  elsif new.estado = 'optout' then
    new.motivo_encerramento := 'nao_perturbe';
  elsif new.estado = 'encerrada' and new.motivo_encerramento is null then
    new.motivo_encerramento := 'outro';
  elsif new.estado not in ('pago', 'optout', 'encerrada') then
    new.motivo_encerramento := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_classificar_motivo_encerramento()
  from public, anon, authenticated;

drop trigger if exists trg_classificar_motivo_encerramento on public.conversas;
create trigger trg_classificar_motivo_encerramento
before insert or update of estado, motivo_encerramento on public.conversas
for each row execute function public.fn_classificar_motivo_encerramento();
