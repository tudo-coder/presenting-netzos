-- NetzOS external agent / meeting ingestion layer.
-- Applied to Supabase project cuhqzqpyhzciqxxcjgtg on 2026-10-01.
-- The operational source of truth remains operational_items and related tables.

create table if not exists public.agent_channel_bindings (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('mock','api','whatsapp','telegram')),
  external_channel_id text not null check (char_length(trim(external_channel_id)) between 1 and 300),
  channel_type text not null default 'group' check (channel_type in ('group','direct','system')),
  label text not null default '' check (char_length(label) <= 150),
  organization_id text not null references public.organizations(id) on delete restrict,
  workspace_id text,
  default_visibility text not null default 'context' check (default_visibility in ('context','private')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_channel_bindings_workspace_context_fkey
    foreign key (workspace_id, organization_id)
    references public.workspaces(id, organization_id)
    on delete restrict,
  unique (owner_id, provider, external_channel_id)
);

create table if not exists public.agent_api_credentials (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  binding_id text not null references public.agent_channel_bindings(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 150),
  token_hash text not null unique check (char_length(token_hash) = 64),
  token_prefix text not null check (char_length(token_prefix) between 6 and 32),
  active boolean not null default true,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.external_ingestion_events (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  binding_id text references public.agent_channel_bindings(id) on delete set null,
  source text not null check (char_length(trim(source)) between 1 and 80),
  external_event_id text not null check (char_length(trim(external_event_id)) between 1 and 500),
  event_type text not null check (char_length(trim(event_type)) between 1 and 120),
  payload_hash text not null check (char_length(payload_hash) = 64),
  status text not null default 'received'
    check (status in ('received','processing','processed','duplicate','failed')),
  operation_id text references public.operational_items(id) on delete set null,
  file_id text references public.operational_files(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (owner_id, source, external_event_id)
);

create table if not exists public.external_operation_refs (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  binding_id text references public.agent_channel_bindings(id) on delete set null,
  source text not null check (char_length(trim(source)) between 1 and 80),
  external_type text not null check (char_length(trim(external_type)) between 1 and 80),
  external_id text not null check (char_length(trim(external_id)) between 1 and 500),
  operation_id text not null references public.operational_items(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, source, external_type, external_id)
);

create table if not exists public.external_media_uploads (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  binding_id text references public.agent_channel_bindings(id) on delete set null,
  operation_id text not null references public.operational_items(id) on delete cascade,
  external_id text not null check (char_length(trim(external_id)) between 1 and 500),
  object_key text not null unique,
  name text not null check (char_length(trim(name)) between 1 and 300),
  mime text not null check (char_length(trim(mime)) between 1 and 150),
  size bigint not null check (size between 0 and 104857600),
  purpose text not null default 'recording' check (purpose in ('recording','attachment')),
  status text not null default 'pending' check (status in ('pending','completed','failed','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  completed_at timestamptz,
  unique (owner_id, operation_id, external_id)
);

create index if not exists agent_channel_bindings_owner_active_idx
  on public.agent_channel_bindings(owner_id, active, updated_at desc);
create index if not exists agent_channel_bindings_external_idx
  on public.agent_channel_bindings(provider, external_channel_id)
  where active;
create index if not exists agent_api_credentials_binding_active_idx
  on public.agent_api_credentials(binding_id, active);
create index if not exists external_ingestion_events_owner_received_idx
  on public.external_ingestion_events(owner_id, received_at desc);
create index if not exists external_ingestion_events_binding_idx
  on public.external_ingestion_events(binding_id, received_at desc);
create index if not exists external_operation_refs_operation_idx
  on public.external_operation_refs(operation_id);
create index if not exists external_media_uploads_operation_idx
  on public.external_media_uploads(operation_id, created_at desc);
create index if not exists external_media_uploads_pending_idx
  on public.external_media_uploads(expires_at)
  where status='pending';

alter table public.agent_channel_bindings enable row level security;
alter table public.agent_api_credentials enable row level security;
alter table public.external_ingestion_events enable row level security;
alter table public.external_operation_refs enable row level security;
alter table public.external_media_uploads enable row level security;

revoke all on public.agent_channel_bindings from anon;
revoke all on public.agent_api_credentials from anon, authenticated;
revoke all on public.external_ingestion_events from anon;
revoke all on public.external_operation_refs from anon;
revoke all on public.external_media_uploads from anon;

grant select on public.agent_channel_bindings to authenticated;
grant select on public.external_ingestion_events to authenticated;
grant select on public.external_operation_refs to authenticated;
grant select on public.external_media_uploads to authenticated;

revoke insert, update, delete on public.agent_channel_bindings from authenticated;
revoke insert, update, delete on public.external_ingestion_events from authenticated;
revoke insert, update, delete on public.external_operation_refs from authenticated;
revoke insert, update, delete on public.external_media_uploads from authenticated;

drop policy if exists agent_channel_bindings_select_own on public.agent_channel_bindings;
create policy agent_channel_bindings_select_own
on public.agent_channel_bindings for select
to authenticated
using (owner_id=(select auth.uid()));

drop policy if exists external_ingestion_events_select_own on public.external_ingestion_events;
create policy external_ingestion_events_select_own
on public.external_ingestion_events for select
to authenticated
using (owner_id=(select auth.uid()));

drop policy if exists external_operation_refs_select_own on public.external_operation_refs;
create policy external_operation_refs_select_own
on public.external_operation_refs for select
to authenticated
using (owner_id=(select auth.uid()));

drop policy if exists external_media_uploads_select_own on public.external_media_uploads;
create policy external_media_uploads_select_own
on public.external_media_uploads for select
to authenticated
using (owner_id=(select auth.uid()));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='operational_items'
  ) then
    alter publication supabase_realtime add table public.operational_items;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='operational_people'
  ) then
    alter publication supabase_realtime add table public.operational_people;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='operational_comments'
  ) then
    alter publication supabase_realtime add table public.operational_comments;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='operational_files'
  ) then
    alter publication supabase_realtime add table public.operational_files;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='operational_transcripts'
  ) then
    alter publication supabase_realtime add table public.operational_transcripts;
  end if;
end $$;
