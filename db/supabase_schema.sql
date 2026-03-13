create table if not exists public.app_documents (
  id bigserial primary key,
  collection text not null,
  doc jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_documents_collection on public.app_documents (collection);
create index if not exists idx_app_documents_doc_gin on public.app_documents using gin (doc);

-- users
create index if not exists idx_app_docs_users_email_lower
  on public.app_documents ((lower(doc->>'email')))
  where collection = 'users';
create index if not exists idx_app_docs_users_user_id
  on public.app_documents ((doc->>'user_id'))
  where collection = 'users';
create index if not exists idx_app_docs_users_role
  on public.app_documents ((doc->>'role'))
  where collection = 'users';
create index if not exists idx_app_docs_users_email_verified
  on public.app_documents ((doc->>'email_verified'))
  where collection = 'users';
create index if not exists idx_app_docs_users_stripe_customer_id
  on public.app_documents ((doc->>'stripe_customer_id'))
  where collection = 'users';
create index if not exists idx_app_docs_users_stripe_subscription_id
  on public.app_documents ((doc->>'stripe_subscription_id'))
  where collection = 'users';
create index if not exists idx_app_docs_users_subscription_period_end
  on public.app_documents ((doc->>'subscription_current_period_end'))
  where collection = 'users';

-- user sessions
create index if not exists idx_app_docs_user_sessions_token
  on public.app_documents ((doc->>'session_token'))
  where collection = 'user_sessions';
create index if not exists idx_app_docs_user_sessions_user_id
  on public.app_documents ((doc->>'user_id'))
  where collection = 'user_sessions';

-- password resets
create index if not exists idx_app_docs_password_resets_token_hash
  on public.app_documents ((doc->>'token_hash'))
  where collection = 'password_resets';
create index if not exists idx_app_docs_password_resets_user_id
  on public.app_documents ((doc->>'user_id'))
  where collection = 'password_resets';

-- email verifications
create index if not exists idx_app_docs_email_verifications_token_hash
  on public.app_documents ((doc->>'token_hash'))
  where collection = 'email_verifications';
create index if not exists idx_app_docs_email_verifications_user_id
  on public.app_documents ((doc->>'user_id'))
  where collection = 'email_verifications';

-- pdfs
create index if not exists idx_app_docs_pdfs_pdf_id
  on public.app_documents ((doc->>'pdf_id'))
  where collection = 'pdfs';
create index if not exists idx_app_docs_pdfs_user_id
  on public.app_documents ((doc->>'user_id'))
  where collection = 'pdfs';
create index if not exists idx_app_docs_pdfs_folder
  on public.app_documents ((doc->>'folder'))
  where collection = 'pdfs';
create index if not exists idx_app_docs_pdfs_storage_provider
  on public.app_documents ((doc->>'storage_provider'))
  where collection = 'pdfs';
create index if not exists idx_app_docs_pdfs_direct_access_token
  on public.app_documents ((doc->>'direct_access_token'))
  where collection = 'pdfs';
create index if not exists idx_app_docs_pdfs_direct_access_enabled
  on public.app_documents ((doc->>'direct_access_enabled'))
  where collection = 'pdfs';
create index if not exists idx_app_docs_pdfs_direct_access_public
  on public.app_documents ((doc->>'direct_access_public'))
  where collection = 'pdfs';
create index if not exists idx_app_docs_folders_folder_id
  on public.app_documents ((doc->>'folder_id'))
  where collection = 'folders';
create index if not exists idx_app_docs_folders_user_id
  on public.app_documents ((doc->>'user_id'))
  where collection = 'folders';

-- links
create index if not exists idx_app_docs_links_token
  on public.app_documents ((doc->>'token'))
  where collection = 'links';
create index if not exists idx_app_docs_links_link_id
  on public.app_documents ((doc->>'link_id'))
  where collection = 'links';
create index if not exists idx_app_docs_links_user_id
  on public.app_documents ((doc->>'user_id'))
  where collection = 'links';
create index if not exists idx_app_docs_links_pdf_id
  on public.app_documents ((doc->>'pdf_id'))
  where collection = 'links';
create index if not exists idx_app_docs_links_status
  on public.app_documents ((doc->>'status'))
  where collection = 'links';
create index if not exists idx_app_docs_links_created_at
  on public.app_documents ((doc->>'created_at'))
  where collection = 'links';

-- domains
create index if not exists idx_app_docs_domains_domain
  on public.app_documents ((lower(doc->>'domain')))
  where collection = 'domains';
create index if not exists idx_app_docs_domains_domain_id
  on public.app_documents ((doc->>'domain_id'))
  where collection = 'domains';
create index if not exists idx_app_docs_domains_user_id
  on public.app_documents ((doc->>'user_id'))
  where collection = 'domains';

-- payments
create index if not exists idx_app_docs_payment_transactions_session_id
  on public.app_documents ((doc->>'session_id'))
  where collection = 'payment_transactions';
create index if not exists idx_app_docs_payment_transactions_transaction_id
  on public.app_documents ((doc->>'transaction_id'))
  where collection = 'payment_transactions';
create index if not exists idx_app_docs_payment_transactions_user_id
  on public.app_documents ((doc->>'user_id'))
  where collection = 'payment_transactions';
create index if not exists idx_app_docs_payment_transactions_status
  on public.app_documents ((doc->>'payment_status'))
  where collection = 'payment_transactions';
create index if not exists idx_app_docs_payment_transactions_created_at
  on public.app_documents ((doc->>'created_at'))
  where collection = 'payment_transactions';
create index if not exists idx_app_docs_payment_transactions_customer_id
  on public.app_documents ((doc->>'stripe_customer_id'))
  where collection = 'payment_transactions';
create index if not exists idx_app_docs_payment_transactions_subscription_id
  on public.app_documents ((doc->>'stripe_subscription_id'))
  where collection = 'payment_transactions';
create index if not exists idx_app_docs_payment_transactions_invoice_id
  on public.app_documents ((doc->>'stripe_invoice_id'))
  where collection = 'payment_transactions';
create index if not exists idx_app_docs_platform_settings_key
  on public.app_documents ((doc->>'key'))
  where collection = 'platform_settings';

-- audit events
create index if not exists idx_app_docs_audit_event_type
  on public.app_documents ((doc->>'event_type'))
  where collection = 'audit_events';
create index if not exists idx_app_docs_audit_actor_user_id
  on public.app_documents ((doc->>'actor_user_id'))
  where collection = 'audit_events';
create index if not exists idx_app_docs_audit_target_user_id
  on public.app_documents ((doc->>'target_user_id'))
  where collection = 'audit_events';
create index if not exists idx_app_docs_audit_resource_type
  on public.app_documents ((doc->>'resource_type'))
  where collection = 'audit_events';
create index if not exists idx_app_docs_audit_created_at
  on public.app_documents ((doc->>'created_at'))
  where collection = 'audit_events';

create table if not exists public.app_files (
  storage_key text primary key,
  user_id text not null,
  content_type text not null default 'application/pdf',
  content bytea not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_files_user_id on public.app_files (user_id);
