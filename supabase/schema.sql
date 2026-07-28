-- ============================================================
-- Личный финансовый кабинет — ПОЛНАЯ схема Supabase
-- Выполните ОДИН РАЗ в SQL Editor проекта Supabase
-- Включает: таблицы, периоды, RLS, storage, bootstrap
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- profiles / settings
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default '',
  avatar text default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz default null
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  theme text not null default 'dark',
  currency text not null default 'RUB',
  animations boolean not null default true,
  locale text not null default 'ru-RU',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- financial_periods
-- ------------------------------------------------------------
create table if not exists public.financial_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  status text not null default 'current'
    check (status in ('current', 'future', 'closed', 'archive')),
  carry_over_mode text not null default 'ask'
    check (carry_over_mode in ('ask', 'auto', 'none')),
  unlock_edit boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (user_id, year, month)
);

create index if not exists financial_periods_user_idx on public.financial_periods(user_id);

-- ------------------------------------------------------------
-- period_plans / period_reports / regular_payments
-- ------------------------------------------------------------
create table if not exists public.period_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_id uuid not null references public.financial_periods(id) on delete cascade,
  year integer not null,
  month integer not null,
  planned_income numeric(14,2) not null default 0,
  actual_income numeric(14,2) not null default 0,
  planned_expense numeric(14,2) not null default 0,
  actual_expense numeric(14,2) not null default 0,
  planned_savings numeric(14,2) not null default 0,
  actual_savings numeric(14,2) not null default 0,
  planned_credits numeric(14,2) not null default 0,
  actual_credits numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period_id)
);

create table if not exists public.period_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_id uuid not null references public.financial_periods(id) on delete cascade,
  year integer not null,
  month integer not null,
  title text not null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period_id)
);

create table if not exists public.regular_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_id uuid not null references public.financial_periods(id) on delete cascade,
  year integer not null,
  month integer not null,
  title text not null,
  amount numeric(14,2) not null default 0,
  day_of_month integer not null default 1 check (day_of_month between 1 and 31),
  category text default 'other',
  budget_category uuid,
  comment text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- income
-- ------------------------------------------------------------
create table if not exists public.income (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_id uuid references public.financial_periods(id) on delete cascade,
  year integer,
  month integer,
  title text not null,
  source text not null default 'Другое',
  amount numeric(14,2) not null check (amount >= 0),
  date date not null default current_date,
  comment text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists income_user_id_idx on public.income(user_id);
create index if not exists income_period_idx on public.income(period_id);

-- ------------------------------------------------------------
-- budget_categories
-- ------------------------------------------------------------
create table if not exists public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_id uuid references public.financial_periods(id) on delete cascade,
  year integer,
  month integer,
  name text not null,
  icon text not null default '📦',
  color text not null default '#5B8DEF',
  sort integer not null default 0,
  carry_rule text not null default 'balance'
    check (carry_rule in ('always', 'balance', 'zero', 'max', 'never')),
  carry_max numeric(14,2) default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists budget_categories_user_id_idx on public.budget_categories(user_id);
create index if not exists budget_categories_period_idx on public.budget_categories(period_id);
create unique index if not exists budget_categories_user_period_name_uidx
  on public.budget_categories(user_id, period_id, name);

-- ------------------------------------------------------------
-- budget_transactions
-- ------------------------------------------------------------
create table if not exists public.budget_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_id uuid references public.financial_periods(id) on delete cascade,
  year integer,
  month integer,
  category_id uuid not null references public.budget_categories(id) on delete cascade,
  amount numeric(14,2) not null,
  type text not null,
  date date not null default current_date,
  comment text default '',
  income_id uuid references public.income(id) on delete set null,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists budget_transactions_user_id_idx on public.budget_transactions(user_id);
create index if not exists budget_transactions_period_idx on public.budget_transactions(period_id);
create index if not exists budget_transactions_category_idx on public.budget_transactions(category_id);

-- ------------------------------------------------------------
-- expenses
-- ------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_id uuid references public.financial_periods(id) on delete cascade,
  year integer,
  month integer,
  category text not null,
  budget_category uuid references public.budget_categories(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  date date not null default current_date,
  store text default '',
  comment text default '',
  name text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_user_id_idx on public.expenses(user_id);
create index if not exists expenses_period_idx on public.expenses(period_id);

-- ------------------------------------------------------------
-- credits / credit_payments
-- ------------------------------------------------------------
create table if not exists public.credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_id uuid references public.financial_periods(id) on delete cascade,
  year integer,
  month integer,
  bank text default '',
  title text not null,
  initial_amount numeric(14,2) not null check (initial_amount >= 0),
  current_balance numeric(14,2) not null check (current_balance >= 0),
  monthly_payment numeric(14,2) not null default 0,
  interest_rate numeric(8,2) not null default 0,
  payment_day integer not null default 1 check (payment_day between 1 and 31),
  start_date date,
  end_date date,
  status text not null default 'active',
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists credits_user_id_idx on public.credits(user_id);
create index if not exists credits_period_idx on public.credits(period_id);

create table if not exists public.credit_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_id uuid references public.financial_periods(id) on delete cascade,
  year integer,
  month integer,
  credit_id uuid not null references public.credits(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null default current_date,
  comment text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists credit_payments_user_id_idx on public.credit_payments(user_id);
create index if not exists credit_payments_period_idx on public.credit_payments(period_id);
create index if not exists credit_payments_credit_id_idx on public.credit_payments(credit_id);

-- ------------------------------------------------------------
-- utilities / goals / history / notifications
-- ------------------------------------------------------------
create table if not exists public.utilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_id uuid references public.financial_periods(id) on delete cascade,
  year integer,
  month integer,
  service text not null,
  amount numeric(14,2) not null default 0,
  month_key text not null default '',
  status text not null default 'pending',
  receipt text default '',
  due_date date,
  paid_at date,
  comment text default '',
  budget_category uuid references public.budget_categories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists utilities_user_id_idx on public.utilities(user_id);
create index if not exists utilities_period_idx on public.utilities(period_id);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_id uuid references public.financial_periods(id) on delete cascade,
  year integer,
  month integer,
  title text not null,
  target numeric(14,2) not null check (target > 0),
  saved numeric(14,2) not null default 0,
  deadline date,
  icon text default '🎯',
  status text not null default 'active',
  comment text default '',
  contributions jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists goals_user_id_idx on public.goals(user_id);
create index if not exists goals_period_idx on public.goals(period_id);

create table if not exists public.history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_id uuid references public.financial_periods(id) on delete cascade,
  year integer,
  month integer,
  type text not null,
  title text not null,
  amount numeric(14,2),
  date timestamptz not null default now(),
  description text default '',
  icon text default '📌',
  meta jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists history_user_id_idx on public.history(user_id);
create index if not exists history_period_idx on public.history(period_id);
create index if not exists history_date_idx on public.history(user_id, date desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_id uuid references public.financial_periods(id) on delete cascade,
  year integer,
  month integer,
  title text not null,
  text text default '',
  is_read boolean not null default false,
  type text default 'info',
  link text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on public.notifications(user_id);
create index if not exists notifications_period_idx on public.notifications(period_id);

-- ============================================================
-- RLS
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','settings','financial_periods','period_plans','period_reports',
    'regular_payments','income','budget_categories','budget_transactions',
    'expenses','credits','credit_payments','utilities','goals','history','notifications'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t||'_select_own', t);
    execute format('drop policy if exists %I on public.%I', t||'_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t||'_update_own', t);
    execute format('drop policy if exists %I on public.%I', t||'_delete_own', t);

    execute format('create policy %I on public.%I for select using (auth.uid() = user_id)', t||'_select_own', t);
    execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id)', t||'_insert_own', t);
    execute format('create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t||'_update_own', t);
    execute format('create policy %I on public.%I for delete using (auth.uid() = user_id)', t||'_delete_own', t);
  end loop;
end $$;

-- ============================================================
-- Storage: avatars
-- ============================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists avatars_owner_upload on storage.objects;
create policy avatars_owner_upload on storage.objects
  for insert with check (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update on storage.objects
  for update using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete on storage.objects
  for delete using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- Bootstrap нового пользователя
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text;
  pid uuid;
  y integer := extract(year from now())::integer;
  m integer := extract(month from now())::integer;
begin
  uname := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'Пользователь');

  insert into public.profiles (user_id, name, created_at, last_login_at)
  values (new.id, uname, now(), now())
  on conflict (user_id) do nothing;

  insert into public.settings (user_id, theme, currency)
  values (new.id, 'dark', 'RUB')
  on conflict (user_id) do nothing;

  insert into public.financial_periods (user_id, year, month, status, carry_over_mode)
  values (new.id, y, m, 'current', 'ask')
  returning id into pid;

  insert into public.budget_categories (user_id, period_id, year, month, name, icon, color, sort, carry_rule, carry_max) values
    (new.id, pid, y, m, 'Долги', '💳', '#F31260', 1, 'balance', null),
    (new.id, pid, y, m, 'Ребёнок', '👶', '#5B8DEF', 2, 'balance', null),
    (new.id, pid, y, m, 'Жизнь', '🛒', '#36C6A0', 3, 'zero', null),
    (new.id, pid, y, m, 'Квартира', '🏠', '#F5A524', 4, 'balance', null),
    (new.id, pid, y, m, 'Одежда', '👕', '#9353D3', 5, 'max', 5000),
    (new.id, pid, y, m, 'Бьюти', '💄', '#FF6B6B', 6, 'never', null),
    (new.id, pid, y, m, 'Накопления', '💰', '#7CFFB2', 7, 'always', null);

  insert into public.period_plans (user_id, period_id, year, month)
  values (new.id, pid, y, m);

  insert into public.history (user_id, period_id, year, month, type, title, description, icon, date)
  values (new.id, pid, y, m, 'system', 'Добро пожаловать!', 'Личный кабинет и период созданы', '👋', now());

  insert into public.notifications (user_id, period_id, year, month, title, text, type)
  values (new.id, pid, y, m, 'Кабинет готов', 'Добавьте первый доход и распределите его по конвертам', 'success');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
