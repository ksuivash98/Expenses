-- ============================================================
-- Личный финансовый кабинет — схема Supabase (PostgreSQL)
-- Выполните в SQL Editor проекта Supabase
-- ============================================================

-- Расширения
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default '',
  avatar text default null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz default null
);

-- ------------------------------------------------------------
-- settings
-- ------------------------------------------------------------
create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  theme text not null default 'dark',
  currency text not null default 'RUB',
  animations boolean not null default true,
  locale text not null default 'ru-RU',
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- income
-- ------------------------------------------------------------
create table if not exists public.income (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  source text not null default 'Другое',
  amount numeric(14,2) not null check (amount >= 0),
  date date not null default current_date,
  comment text default '',
  created_at timestamptz not null default now()
);

create index if not exists income_user_id_idx on public.income(user_id);
create index if not exists income_date_idx on public.income(user_id, date desc);

-- ------------------------------------------------------------
-- budget_categories
-- ------------------------------------------------------------
create table if not exists public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null default '📦',
  color text not null default '#5B8DEF',
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists budget_categories_user_id_idx on public.budget_categories(user_id);

-- ------------------------------------------------------------
-- budget_transactions
-- ------------------------------------------------------------
create table if not exists public.budget_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.budget_categories(id) on delete cascade,
  amount numeric(14,2) not null,
  type text not null,
  date date not null default current_date,
  comment text default '',
  income_id uuid references public.income(id) on delete set null,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists budget_transactions_user_id_idx on public.budget_transactions(user_id);
create index if not exists budget_transactions_category_idx on public.budget_transactions(category_id);

-- ------------------------------------------------------------
-- expenses
-- ------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  budget_category uuid references public.budget_categories(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  date date not null default current_date,
  store text default '',
  comment text default '',
  name text default '',
  created_at timestamptz not null default now()
);

create index if not exists expenses_user_id_idx on public.expenses(user_id);

-- ------------------------------------------------------------
-- credits
-- ------------------------------------------------------------
create table if not exists public.credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
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
  created_at timestamptz not null default now()
);

create index if not exists credits_user_id_idx on public.credits(user_id);

-- ------------------------------------------------------------
-- credit_payments
-- ------------------------------------------------------------
create table if not exists public.credit_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credit_id uuid not null references public.credits(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null default current_date,
  comment text default '',
  created_at timestamptz not null default now()
);

create index if not exists credit_payments_user_id_idx on public.credit_payments(user_id);
create index if not exists credit_payments_credit_id_idx on public.credit_payments(credit_id);

-- ------------------------------------------------------------
-- utilities
-- ------------------------------------------------------------
create table if not exists public.utilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service text not null,
  amount numeric(14,2) not null default 0,
  month text not null,
  status text not null default 'pending',
  receipt text default '',
  due_date date,
  paid_at date,
  comment text default '',
  budget_category uuid references public.budget_categories(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists utilities_user_id_idx on public.utilities(user_id);

-- ------------------------------------------------------------
-- goals
-- ------------------------------------------------------------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  target numeric(14,2) not null check (target > 0),
  saved numeric(14,2) not null default 0,
  deadline date,
  icon text default '🎯',
  status text not null default 'active',
  comment text default '',
  contributions jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists goals_user_id_idx on public.goals(user_id);

-- ------------------------------------------------------------
-- history
-- ------------------------------------------------------------
create table if not exists public.history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  amount numeric(14,2),
  date timestamptz not null default now(),
  description text default '',
  icon text default '📌',
  meta jsonb default '{}'::jsonb
);

create index if not exists history_user_id_idx on public.history(user_id);
create index if not exists history_date_idx on public.history(user_id, date desc);

-- ------------------------------------------------------------
-- notifications
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  text text default '',
  is_read boolean not null default false,
  type text default 'info',
  link text,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on public.notifications(user_id);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.income enable row level security;
alter table public.budget_categories enable row level security;
alter table public.budget_transactions enable row level security;
alter table public.expenses enable row level security;
alter table public.credits enable row level security;
alter table public.credit_payments enable row level security;
alter table public.utilities enable row level security;
alter table public.goals enable row level security;
alter table public.history enable row level security;
alter table public.notifications enable row level security;

-- Универсальные политики: только свои строки
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','settings','income','budget_categories','budget_transactions',
    'expenses','credits','credit_payments','utilities','goals','history','notifications'
  ]
  loop
    execute format('drop policy if exists %I_select on public.%I', t||'_own', t);
    execute format('drop policy if exists %I_insert on public.%I', t||'_own', t);
    execute format('drop policy if exists %I_update on public.%I', t||'_own', t);
    execute format('drop policy if exists %I_delete on public.%I', t||'_own', t);

    execute format(
      'create policy %I on public.%I for select using (auth.uid() = user_id)',
      t||'_select_own', t
    );
    execute format(
      'create policy %I on public.%I for insert with check (auth.uid() = user_id)',
      t||'_insert_own', t
    );
    execute format(
      'create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t||'_update_own', t
    );
    execute format(
      'create policy %I on public.%I for delete using (auth.uid() = user_id)',
      t||'_delete_own', t
    );
  end loop;
end $$;

-- ============================================================
-- Storage bucket для аватаров
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
begin
  uname := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'Пользователь');

  insert into public.profiles (user_id, name, created_at, last_login_at)
  values (new.id, uname, now(), now())
  on conflict (user_id) do nothing;

  insert into public.settings (user_id, theme, currency)
  values (new.id, 'dark', 'RUB')
  on conflict (user_id) do nothing;

  insert into public.budget_categories (user_id, name, icon, color, sort) values
    (new.id, 'Долги', '💳', '#F31260', 1),
    (new.id, 'Ребёнок', '👶', '#5B8DEF', 2),
    (new.id, 'Жизнь', '🛒', '#36C6A0', 3),
    (new.id, 'Квартира', '🏠', '#F5A524', 4),
    (new.id, 'Одежда', '👕', '#9353D3', 5),
    (new.id, 'Бьюти', '💄', '#FF6B6B', 6),
    (new.id, 'Накопления', '💰', '#7CFFB2', 7)
  on conflict do nothing;

  insert into public.history (user_id, type, title, description, icon)
  values (new.id, 'system', 'Добро пожаловать!', 'Личный кабинет создан', '👋');

  insert into public.notifications (user_id, title, text, type)
  values (new.id, 'Кабинет готов', 'Добавьте первый доход и распределите его по конвертам', 'success');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Обновление last_login можно вызывать из клиента через ProfileService
