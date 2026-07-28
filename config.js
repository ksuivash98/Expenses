/**
 * config.js — конфигурация Supabase и таблицы
 */
export const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

export function isSupabaseConfigured() {
  return Boolean(
    SUPABASE_URL
    && SUPABASE_ANON_KEY
    && !SUPABASE_URL.includes('YOUR_PROJECT_ID')
    && !SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY')
  );
}

export const CACHE_VERSION = 3;

export const PERIOD_STATUSES = {
  current: 'current',
  future: 'future',
  closed: 'closed',
  archive: 'archive'
};

export const PERIOD_STATUS_LABELS = {
  current: 'Текущий',
  future: 'Будущий',
  closed: 'Закрытый',
  archive: 'Архивный'
};

export const CARRY_RULES = {
  always: 'always',
  balance: 'balance',
  zero: 'zero',
  max: 'max',
  never: 'never'
};

export const CARRY_RULE_LABELS = {
  always: 'Всегда переносить остаток',
  balance: 'Переносить остаток',
  zero: 'Обнулять',
  max: 'Переносить максимум',
  never: 'Не переносить'
};

/** Таблицы, привязанные к периоду. */
export const PERIOD_SCOPED_TABLES = [
  'income',
  'budget_categories',
  'budget_transactions',
  'expenses',
  'credits',
  'credit_payments',
  'utilities',
  'goals',
  'history',
  'notifications',
  'regular_payments',
  'period_plans'
];

export const TABLES = {
  profiles: 'profiles',
  settings: 'settings',
  financialPeriods: 'financial_periods',
  periodPlans: 'period_plans',
  periodReports: 'period_reports',
  regularPayments: 'regular_payments',
  income: 'income',
  budgetCategories: 'budget_categories',
  budgetTransactions: 'budget_transactions',
  expenses: 'expenses',
  credits: 'credits',
  creditPayments: 'credit_payments',
  utilities: 'utilities',
  goals: 'goals',
  history: 'history',
  notifications: 'notifications'
};
