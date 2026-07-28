-- ============================================================
-- Миграция: финансовые периоды
-- Выполните после schema.sql в SQL Editor Supabase
-- ============================================================

-- Периоды
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
create index if not exists financial_periods_status_idx on public.financial_periods(user_id, status);

-- План/факт периода
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

-- Отчёты закрытых периодов
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

-- Регулярные платежи (шаблоны периода)
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

-- Добавляем period_id / year / month / timestamps к существующим таблицам
do $$
declare
  t text;
begin
  foreach t in array array[
    'income','budget_categories','budget_transactions','expenses',
    'credits','credit_payments','utilities','goals','history','notifications'
  ]
  loop
    execute format('alter table public.%I add column if not exists period_id uuid references public.financial_periods(id) on delete cascade', t);
    execute format('alter table public.%I add column if not exists year integer', t);
    execute format('alter table public.%I add column if not exists month integer', t);
    execute format('alter table public.%I add column if not exists updated_at timestamptz default now()', t);
    execute format('create index if not exists %I on public.%I(period_id)', t||'_period_idx', t);
  end loop;
end $$;

-- Правила переноса для категорий
alter table public.budget_categories
  add column if not exists carry_rule text default 'balance'
    check (carry_rule in ('always', 'balance', 'zero', 'max', 'never'));
alter table public.budget_categories
  add column if not exists carry_max numeric(14,2) default null;

-- RLS для новых таблиц
alter table public.financial_periods enable row level security;
alter table public.period_plans enable row level security;
alter table public.period_reports enable row level security;
alter table public.regular_payments enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['financial_periods','period_plans','period_reports','regular_payments']
  loop
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

-- Обновляем bootstrap: создаём текущий период + конверты с period_id
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
