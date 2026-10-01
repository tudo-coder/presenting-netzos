-- NetzOS operational core adapted from the reference package.
-- Organization is the root context; workspaces belong to organizations.
-- Tasks, meetings and commitments share one operational_items table.
-- Agenda is a projection of operational_items, not a separate source of truth.

create table if not exists public.organizations (
  id text primary key,
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 150),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id text primary key,
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  organization_id text not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 150),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table if not exists public.operational_items (
  id text primary key,
  kind text not null check (kind in ('task','meeting','event')),
  organization_id text not null references public.organizations(id) on delete restrict,
  workspace_id text,
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text not null default '',
  status text not null,
  priority text not null default 'normal' check (priority in ('normal','important','urgent')),
  visibility text not null default 'context' check (visibility in ('context','private')),
  date date,
  time time,
  end_date date,
  end_time time,
  timezone text not null default 'America/Belem',
  duration integer not null default 60 check (duration between 1 and 10080),
  location text not null default '',
  responsible_id uuid references public.profiles(id) on delete set null,
  meeting_id text references public.operational_items(id) on delete set null,
  origin text not null default 'manual',
  creator_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  details jsonb not null default '{}'::jsonb,
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint operational_item_status_check check (
    (kind = 'task' and status in ('todo','doing','done','cancelled'))
    or (kind in ('meeting','event') and status in ('scheduled','held','cancelled'))
  ),
  constraint operational_item_end_check check (
    end_date is null
    or date is null
    or end_date > date
    or (end_date = date and (time is null or end_time is null or end_time >= time))
  ),
  constraint operational_workspace_context_fkey
    foreign key (workspace_id, organization_id)
    references public.workspaces(id, organization_id)
    on delete restrict
);

create table if not exists public.operational_people (
  item_id text not null references public.operational_items(id) on delete cascade,
  person_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'participant',
  primary key (item_id, person_id)
);

create table if not exists public.operational_comments (
  id text primary key,
  item_id text not null references public.operational_items(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now()
);

create table if not exists public.operational_files (
  id text primary key,
  item_id text not null references public.operational_items(id) on delete cascade,
  object_key text not null,
  name text not null,
  mime text not null,
  size bigint not null check (size >= 0),
  purpose text not null default 'attachment',
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.operational_transcripts (
  item_id text primary key references public.operational_items(id) on delete cascade,
  text text not null default '',
  segments jsonb not null default '[]'::jsonb,
  source text not null default 'manual',
  generated_at timestamptz,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now(),
  version integer not null default 0 check (version >= 0)
);

alter table public.organizations enable row level security;
alter table public.workspaces enable row level security;
alter table public.operational_items enable row level security;
alter table public.operational_people enable row level security;
alter table public.operational_comments enable row level security;
alter table public.operational_files enable row level security;
alter table public.operational_transcripts enable row level security;

grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.operational_items to authenticated;
grant select, insert, update, delete on public.operational_people to authenticated;
grant select, insert, update, delete on public.operational_comments to authenticated;
grant select, insert, update, delete on public.operational_files to authenticated;
grant select, insert, update, delete on public.operational_transcripts to authenticated;

create index if not exists organizations_owner_id_idx
  on public.organizations(owner_id, created_at desc);
create index if not exists workspaces_owner_org_idx
  on public.workspaces(owner_id, organization_id, created_at desc);
create index if not exists workspaces_organization_id_idx
  on public.workspaces(organization_id);
create index if not exists operational_items_org_date_idx
  on public.operational_items(creator_id, organization_id, date);
create index if not exists operational_items_workspace_kind_idx
  on public.operational_items(creator_id, workspace_id, kind);
create index if not exists operational_items_responsible_status_idx
  on public.operational_items(responsible_id, status);
create index if not exists operational_items_organization_id_idx
  on public.operational_items(organization_id);
create index if not exists operational_items_workspace_context_idx
  on public.operational_items(workspace_id, organization_id);
create index if not exists operational_people_person_idx
  on public.operational_people(person_id, item_id);
create index if not exists operational_comments_item_idx
  on public.operational_comments(item_id, created_at);
create index if not exists operational_comments_author_id_idx
  on public.operational_comments(author_id);
create index if not exists operational_files_item_idx
  on public.operational_files(item_id, created_at);
create index if not exists operational_files_author_id_idx
  on public.operational_files(author_id);
create index if not exists operational_transcripts_author_id_idx
  on public.operational_transcripts(author_id);

-- Policies are intentionally ownership-first for the current NetzOS account model.
-- Team sharing can extend these policies later without changing the core data model.
