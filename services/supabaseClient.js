/**
 * services/supabaseClient.js
 * Единая точка создания Supabase Client.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  isSupabaseConfigured,
  APP_TABLES
} from '../config.js';

/** @type {import('@supabase/supabase-js').SupabaseClient|null} */
let client = null;

/**
 * Возвращает (или создаёт) singleton Supabase client.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase не настроен. Укажите SUPABASE_URL и SUPABASE_ANON_KEY в config.js или config.local.js'
    );
  }

  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined
      },
      global: {
        headers: {
          'X-Client-Info': 'personal-finance-cabinet'
        }
      }
    });
  }

  return client;
}

/**
 * Есть ли готовый клиент / ключи.
 * @returns {boolean}
 */
export function hasSupabaseClient() {
  return isSupabaseConfigured();
}

/**
 * Проверяет доступность Auth API.
 * @returns {Promise<{ ok: boolean, message: string, session: object|null }>}
 */
export async function checkAuthConnection() {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      message: 'Ключи SUPABASE_URL / SUPABASE_ANON_KEY не заданы',
      session: null
    };
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      return { ok: false, message: `Auth ошибка: ${error.message}`, session: null };
    }
    return {
      ok: true,
      message: data.session
        ? `Сессия активна (${data.session.user?.email || data.session.user?.id})`
        : 'Auth API доступен, пользователь не вошёл',
      session: data.session
    };
  } catch (error) {
    return { ok: false, message: error.message || String(error), session: null };
  }
}

/**
 * Проверяет доступ к таблицам БД (через anon key + RLS).
 * Без сессии ожидаем пустой результат / отсутствие ошибки структуры.
 * @returns {Promise<{ ok: boolean, message: string, tables: Array<object> }>}
 */
export async function checkDatabaseConnection() {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      message: 'Ключи не заданы',
      tables: APP_TABLES.map((name) => ({ name, status: 'skipped' }))
    };
  }

  const supabase = getSupabaseClient();
  const results = [];

  for (const table of APP_TABLES) {
    try {
      const { error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        // PGRST205 / 42P01 — таблицы нет
        const missing = /does not exist|Could not find the table|PGRST205|42P01/i.test(error.message);
        results.push({
          name: table,
          status: missing ? 'missing' : 'error',
          message: error.message
        });
      } else {
        results.push({
          name: table,
          status: 'ok',
          count: count ?? 0
        });
      }
    } catch (error) {
      results.push({
        name: table,
        status: 'error',
        message: error.message || String(error)
      });
    }
  }

  const missing = results.filter((r) => r.status === 'missing');
  const errors = results.filter((r) => r.status === 'error');
  const okCount = results.filter((r) => r.status === 'ok').length;

  let message;
  if (missing.length) {
    message = `БД доступна, но не хватает таблиц (${missing.length}). Выполните supabase/schema.sql`;
  } else if (errors.length && !okCount) {
    message = `Ошибка подключения к БД: ${errors[0].message}`;
  } else if (errors.length) {
    message = `Подключение есть, проблемных таблиц: ${errors.length}`;
  } else {
    message = `БД доступна, все ${okCount} таблиц найдены`;
  }

  return {
    ok: missing.length === 0 && errors.length === 0,
    message,
    tables: results
  };
}

/**
 * Полная диагностика Supabase.
 * @returns {Promise<object>}
 */
export async function diagnoseSupabase() {
  const configured = isSupabaseConfigured();
  const auth = await checkAuthConnection();
  const database = await checkDatabaseConnection();

  return {
    configured,
    url: configured ? SUPABASE_URL : null,
    auth,
    database,
    ready: configured && auth.ok && database.ok
  };
}

export { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured, APP_TABLES };
