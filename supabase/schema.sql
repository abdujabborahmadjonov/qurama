-- Qurama — database schema
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- Two tables, deliberately separated:
--   submissions  everything a contributor sent, including contact details.
--                PRIVATE. No anonymous access whatsoever.
--   entries      what has been approved for publication. Public read only.
--
-- The split means a public page never queries a table that contains an email
-- address, so a mistake in a policy cannot leak contributor identity.

-- ---------------------------------------------------------------- submissions

create table if not exists public.submissions (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  status             text not null default 'pending'
                       check (status in ('pending', 'held', 'published')),

  -- what the contributor told us. Private, always.
  name               text,
  email              text,
  country            text,
  language           text,
  note               text,

  -- the original upload, in the private storage bucket
  file_path          text,
  file_original_name text,
  file_size          integer,

  -- the converted, sanitised text
  html               text,
  words              integer default 0,
  warnings           jsonb not null default '[]'::jsonb
);

comment on table public.submissions is
  'Contributor submissions. Contains personal data. Service role only.';

-- -------------------------------------------------------------------- entries

create table if not exists public.entries (
  id           uuid primary key
                 references public.submissions(id) on delete cascade,
  slug         text not null unique,
  country      text not null,
  theme        text not null,
  format       text not null default 'text',
  byline       text default '',
  noindex      boolean not null default false,
  published_at timestamptz not null default now(),

  title_en     text not null,
  teaser_en    text default '',
  title_uz     text default '',
  teaser_uz    text default '',

  -- the essay body lives here too, so serving a published story never reads
  -- from the submissions table
  html         text not null
);

create index if not exists entries_published_at_idx on public.entries (published_at desc);
create index if not exists entries_country_idx      on public.entries (country);
create index if not exists entries_theme_idx        on public.entries (theme);

comment on table public.entries is
  'Published stories. Public read. Written only by the moderation queue.';

-- ------------------------------------------------------------ row level security

alter table public.submissions enable row level security;
alter table public.entries     enable row level security;

-- submissions: no policy is created on purpose. With RLS on and no policy,
-- anon and authenticated roles can do nothing at all. The server reaches this
-- table with the service role key, which bypasses RLS and never leaves the
-- server.

-- entries: anyone may read a published story.
drop policy if exists "entries are publicly readable" on public.entries;
create policy "entries are publicly readable"
  on public.entries for select
  to anon, authenticated
  using (true);

-- No insert/update/delete policy: publishing goes through the server.

-- ------------------------------------------------------------------- storage

-- Private bucket for the original .docx files. Nothing is publicly readable;
-- the moderator downloads through a short-lived signed URL the server creates.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'essays', 'essays', false, 10485760,
  array['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No storage policies either: service role only.
