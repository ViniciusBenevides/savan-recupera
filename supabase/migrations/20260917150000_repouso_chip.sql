-- Repouso do chip: período escolhido pelo operador sem abordagem nenhuma (17/09/2026)
--
-- Depois de o Chip 2 levar quatro bloqueios de alcance do WhatsApp em uma semana (§43), o dono
-- decidiu deixá-lo 14 dias parado, com um contador visível no painel. O bloqueio do WhatsApp
-- (`whatsapp_bloqueio_ate`) não serve para isso: ele espelha o que o WhatsApp informa, e o
-- `chips-monitor` o apaga assim que o WhatsApp diz que liberou.
--
-- É decisão do operador, não regra nossa sobre chip novo — por isso não contradiz o ADR-0004: o
-- painel deixa encerrar o repouso a qualquer momento. Enquanto ele vale, a garantia é a mesma do
-- bloqueio: o chip não vai para `ativo`/`aquecendo`, venha a escrita de onde vier.

alter table chips add column if not exists repouso_desde timestamptz;
alter table chips add column if not exists repouso_ate timestamptz;
alter table chips add column if not exists repouso_motivo text;

comment on column chips.repouso_desde is
  'Início do repouso escolhido pelo operador (base do contador do painel).';
comment on column chips.repouso_ate is
  'Fim do repouso escolhido pelo operador. Enquanto estiver no futuro o chip não aborda ninguém e '
  'não pode ir para ativo/aquecendo (trg_chips_barrar_ativacao_bloqueada). Nulo = sem repouso.';
comment on column chips.repouso_motivo is
  'Por que o chip foi posto em repouso — texto livre mostrado no painel.';

create or replace function fn_chips_barrar_ativacao_bloqueada()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Só a TRANSIÇÃO para um status que aborda é barrada. Um chip que já estava em `aquecendo`
  -- quando o bloqueio chegou pode receber a data sem erro — o monitor o pausa na mesma escrita.
  if new.status in ('ativo', 'aquecendo')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if new.whatsapp_bloqueio_ate is not null and new.whatsapp_bloqueio_ate > now() then
      raise exception using
        errcode = 'P0001',
        message = 'chip_bloqueado_whatsapp',
        detail = format(
          'O WhatsApp bloqueou este número de iniciar conversas novas até %s (horário de Brasília).',
          to_char(new.whatsapp_bloqueio_ate at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
        ),
        hint = 'O chip só pode ser ativado depois que o bloqueio terminar.';
    end if;
    if new.repouso_ate is not null and new.repouso_ate > now() then
      raise exception using
        errcode = 'P0001',
        message = 'chip_em_repouso',
        detail = format(
          'Este chip está em repouso até %s (horário de Brasília).',
          to_char(new.repouso_ate at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
        ),
        hint = 'Encerre o repouso no painel antes de ativar.';
    end if;
  end if;
  return new;
end;
$$;

comment on function fn_chips_barrar_ativacao_bloqueada() is
  'Recusa levar um chip para ativo/aquecendo enquanto chips.whatsapp_bloqueio_ate ou '
  'chips.repouso_ate estiverem no futuro.';
