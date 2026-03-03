create table if not exists public.app_documents (
  id bigserial primary key,
  collection text not null,
  doc jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_documents_collection on public.app_documents (collection);
create index if not exists idx_app_documents_doc_gin on public.app_documents using gin (doc);

create table if not exists public.app_files (
  storage_key text primary key,
  user_id text not null,
  content_type text not null default 'application/pdf',
  content bytea not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_files_user_id on public.app_files (user_id);
