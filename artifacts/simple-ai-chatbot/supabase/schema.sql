-- Run this script once in the Supabase SQL Editor for this project.
-- It stores chat content only for authenticated users and enforces ownership
-- at the database layer. Never use a service-role key in the browser.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(content) > 0),
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at asc);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

revoke all on public.conversations from anon;
revoke all on public.messages from anon;
grant select, insert on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;

drop policy if exists "Users manage their own conversations" on public.conversations;
drop policy if exists "Users read their own conversations" on public.conversations;
create policy "Users read their own conversations"
  on public.conversations
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users create their own conversations" on public.conversations;
create policy "Users create their own conversations"
  on public.conversations
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users read their own messages" on public.messages;
create policy "Users read their own messages"
  on public.messages
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.conversations c
      where c.id = public.messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users add messages to their own conversations" on public.messages;
create policy "Users add messages to their own conversations"
  on public.messages
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.conversations c
      where c.id = public.messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );

create or replace function public.bump_conversation_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id
    and user_id = new.user_id;
  return new;
end;
$$;

revoke all on function public.bump_conversation_updated_at() from public, anon, authenticated;

drop trigger if exists bump_conversation_updated_at on public.messages;
create trigger bump_conversation_updated_at
  after insert on public.messages
  for each row
  execute function public.bump_conversation_updated_at();
