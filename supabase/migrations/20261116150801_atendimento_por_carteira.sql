-- Quem atende depois da primeira mensagem, por carteira (16/11/2026).
--
-- equipe: o robô só manda a primeira mensagem. Quem responde vai direto para a equipe (a conversa
--         fica "humano" e aparece no Trabalho de hoje e em Mensagens WhatsApp), e não há reenvio.
-- robo:   o robô conversa seguindo o fluxo da carteira e faz o reenvio, como antes.
--
-- Decisão do dono: todas as carteiras seguem "só a primeira mensagem é automática; o resto fica com
-- a equipe do Maurelio". O padrão de carteira nova é o mesmo. É por carteira para uma não arrastar
-- as outras: mudar uma não muda nenhuma outra.
alter table carteiras
  add column if not exists atendimento text not null default 'equipe'
    check (atendimento in ('equipe', 'robo'));

comment on column carteiras.atendimento is
  'equipe = o robô só manda a primeira mensagem; a resposta vai para a equipe, sem reenvio. robo = o robô conversa pelo fluxo e faz o reenvio.';
