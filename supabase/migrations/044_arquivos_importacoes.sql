-- Mantém o arquivo-fonte de cada importação para auditoria, pré-visualização e download.
alter table public.importacoes
  add column if not exists arquivo_path text,
  add column if not exists arquivo_tamanho bigint,
  add column if not exists arquivo_mime text;

-- Bucket privado: o acesso acontece somente pelas rotas autenticadas do dashboard.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'importacoes-carteiras',
  'importacoes-carteiras',
  false,
  20971520,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on column public.importacoes.arquivo_path is
  'Caminho privado do arquivo original no bucket importacoes-carteiras.';
