/**
 * config.js
 * Конфигурация Supabase.
 *
 * Заполните SUPABASE_URL и SUPABASE_ANON_KEY
 * (Project Settings → API в панели Supabase).
 *
 * Либо создайте config.local.js рядом с этим файлом:
 *   export const SUPABASE_URL = '...';
 *   export const SUPABASE_ANON_KEY = '...';
 */

/** @type {string} */
export let SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';

/** @type {string} */
export let SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

/**
 * Подхватывает локальный override, если файл существует.
 * Не коммитьте config.local.js с реальными ключами.
 */
try {
  const local = await import('./config.local.js');
  if (local.SUPABASE_URL) SUPABASE_URL = local.SUPABASE_URL;
  if (local.SUPABASE_ANON_KEY) SUPABASE_ANON_KEY = local.SUPABASE_ANON_KEY;
} catch {
  // config.local.js отсутствует — используем значения выше
}

/**
 * Проверяет, что ключи заданы и это не плейсхолдеры.
 * @returns {boolean}
 */
export function isSupabaseConfigured() {
  return Boolean(
    SUPABASE_URL
    && SUPABASE_ANON_KEY
    && !String(SUPABASE_URL).includes('YOUR_PROJECT_ID')
    && !String(SUPABASE_ANON_KEY).includes('YOUR_SUPABASE_ANON_KEY')
    && String(SUPABASE_URL).startsWith('https://')
    && String(SUPABASE_ANON_KEY).length > 20
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

/** Все пользовательские таблицы приложения (для диагностики). */
export const APP_TABLES = [
  'profiles',
  'settings',
  'financial_periods',
  'period_plans',
  'period_reports',
  'regular_payments',
  'income',
  'budget_categories',
  'budget_transactions',
  'expenses',
  'credits',
  'credit_payments',
  'utilities',
  'goals',
  'history',
  'notifications'
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
