-- Mantem o tipo/anexo original da mensagem e a transcricao usada pelo bot.

alter table public.mensagens
  add column if not exists tipo_conteudo text,
  add column if not exists anexos jsonb,
  add column if not exists transcricao text;

comment on column public.mensagens.transcricao is
  'Texto extraido de audio recebido; e o conteudo enviado ao bot para resposta textual.';

create index if not exists idx_mensagens_audio
  on public.mensagens (conversa_id, criado_em)
  where tipo_conteudo = 'audio';

