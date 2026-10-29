-- Run once in the Supabase SQL editor. Each user owns exactly one document.
create table if not exists public.finance_documents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.finance_documents enable row level security;
drop policy if exists "Read own finance document" on public.finance_documents;
create policy "Read own finance document" on public.finance_documents
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.finance_documents from anon, authenticated;
grant select on public.finance_documents to authenticated;

-- Writes are atomic and refuse an outdated revision from another device.
create or replace function public.save_finance_document(document jsonb, expected_revision bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare next_revision bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(document) <> 'object' or not (document ? 'settings') or not (document ? 'financialPeriods') then
    raise exception 'Invalid finance document';
  end if;
  if expected_revision = 0 then
    insert into public.finance_documents(user_id, data, revision)
      values(auth.uid(), document, 1) on conflict do nothing returning revision into next_revision;
  else
    update public.finance_documents set data = document, revision = revision + 1, updated_at = now()
      where user_id = auth.uid() and revision = expected_revision returning revision into next_revision;
  end if;
  if next_revision is null then raise exception 'SYNC_CONFLICT'; end if;
  return next_revision;
end;
$$;
revoke all on function public.save_finance_document(jsonb, bigint) from public, anon;
grant execute on function public.save_finance_document(jsonb, bigint) to authenticated;
