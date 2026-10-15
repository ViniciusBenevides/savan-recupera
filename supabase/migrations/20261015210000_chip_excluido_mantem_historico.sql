-- Chip excluído mantém o histórico (15/10/2026)
--
-- `mensagens.chip_id` e `escalacoes.equipe_chip_id` eram as duas únicas FKs para `chips` sem
-- `on delete`. Por causa delas, nenhum chip que já tivesse mandado mensagem podia ser excluído, e a
-- rota do painel falhava depois de já ter apagado o inbox do Chatwoot (§49). Com `set null` elas
-- ficam como `conversas`, `fila_envios` e `escalacoes.chip_id`: a mensagem fica, sem o chip.

alter table public.mensagens
  drop constraint mensagens_chip_id_fkey,
  add constraint mensagens_chip_id_fkey
    foreign key (chip_id) references public.chips (id) on delete set null;

alter table public.escalacoes
  drop constraint escalacoes_equipe_chip_id_fkey,
  add constraint escalacoes_equipe_chip_id_fkey
    foreign key (equipe_chip_id) references public.chips (id) on delete set null;
