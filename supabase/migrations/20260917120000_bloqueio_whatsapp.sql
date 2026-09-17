-- Bloqueio de alcance do WhatsApp trava a ativação do chip (17/09/2026)
--
-- O problema: em 16/09/2026 o Chip 2 caiu quatro vezes, sempre minutos depois de uma abordagem. O
-- inbox dele no Chatwoot dizia `reachout_time_lock: { is_active: true, enforcement_type:
-- "RESTRICT_ALL_COMPANIONS" }` — o WhatsApp proibindo o número de iniciar conversa nova em todos
-- os aparelhos vinculados. Nada no sistema lia esse campo. A cada QR novo o chip voltava a
-- `aquecendo` e o `campanha-lote` mandava outra abordagem fria com o bloqueio de pé: as de 11:06 e
-- 12:20 falharam, e cada tentativa é mais um "alcance" contado contra o número.
--
-- A decisão do dono: avisar no sistema e NÃO deixar ativar até o bloqueio sair. O aviso e a leitura
-- ficam no `chips-monitor` e no painel; a garantia fica aqui, no banco, para valer em qualquer
-- caminho que mude o status (botão do painel, volta automática do monitor, promoção do
-- `metricas-sync`, SQL à mão).
--
-- Não contradiz o ADR-0004 ("aquecimento é conselho, não trava"): lá a trava seria uma regra NOSSA
-- sobre chip novo. Aqui quem trava é o próprio WhatsApp; o banco só se recusa a fingir que não.

alter table chips add column if not exists whatsapp_bloqueio_ate timestamptz;

comment on column chips.whatsapp_bloqueio_ate is
  'Até quando o WhatsApp bloqueia este número de iniciar conversa nova (reach-out time-lock, erro '
  '463). Gravado pelo chips-monitor e pelo painel a partir do baileys-api ou da cópia do Chatwoot; '
  'nulo = sem bloqueio conhecido. Enquanto estiver no futuro o chip não pode ir para ativo/aquecendo '
  '(trg_chips_barrar_ativacao_bloqueada). Diferente de abordagem_travada_ate, que é trava NOSSA.';

create or replace function fn_chips_barrar_ativacao_bloqueada()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Só a TRANSIÇÃO para um status que aborda é barrada. Um chip que já estava em `aquecendo`
  -- quando o bloqueio chegou pode receber a data sem erro — o monitor o pausa na mesma escrita.
  if new.status in ('ativo', 'aquecendo')
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and new.whatsapp_bloqueio_ate is not null
     and new.whatsapp_bloqueio_ate > now() then
    raise exception using
      errcode = 'P0001',
      message = 'chip_bloqueado_whatsapp',
      detail = format(
        'O WhatsApp bloqueou este número de iniciar conversas novas até %s (horário de Brasília).',
        to_char(new.whatsapp_bloqueio_ate at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
      ),
      hint = 'O chip só pode ser ativado depois que o bloqueio terminar.';
  end if;
  return new;
end;
$$;

comment on function fn_chips_barrar_ativacao_bloqueada() is
  'Recusa levar um chip para ativo/aquecendo enquanto chips.whatsapp_bloqueio_ate estiver no futuro.';

drop trigger if exists trg_chips_barrar_ativacao_bloqueada on chips;
create trigger trg_chips_barrar_ativacao_bloqueada
  before insert or update of status on chips
  for each row execute function fn_chips_barrar_ativacao_bloqueada();
