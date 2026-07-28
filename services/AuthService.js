/**
 * services/AuthService.js
 * Авторизация через Supabase Auth.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from '../config.js';

/**
 * Сервис аутентификации.
 */
export class AuthService {
  constructor() {
    /** @type {import('@supabase/supabase-js').SupabaseClient|null} */
    this.client = null;
    this.configured = isSupabaseConfigured();
    this.listeners = new Set();
    this.session = null;

    if (this.configured) {
      this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });

      this.client.auth.onAuthStateChange((event, session) => {
        this.session = session;
        this.listeners.forEach((fn) => {
          try { fn(event, session); } catch (e) { console.error(e); }
        });
      });
    }
  }

  /**
   * @returns {boolean}
   */
  isConfigured() {
    return this.configured && Boolean(this.client);
  }

  /**
   * Возвращает клиент Supabase.
   * @returns {import('@supabase/supabase-js').SupabaseClient}
   */
  getClient() {
    if (!this.client) {
      throw new Error('Supabase не настроен. Укажите URL и anon key в config.js');
    }
    return this.client;
  }

  /**
   * Подписка на смену сессии.
   * @param {Function} listener
   * @returns {Function}
   */
  onAuthChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Текущая сессия.
   * @returns {Promise<object|null>}
   */
  async getSession() {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    this.session = data.session;
    return data.session;
  }

  /**
   * Текущий пользователь.
   * @returns {Promise<object|null>}
   */
  async getUser() {
    const session = await this.getSession();
    return session?.user || null;
  }

  /**
   * Регистрация.
   * @param {{ name: string, email: string, password: string }} payload
   * @returns {Promise<{ success: boolean, message?: string, data?: object }>}
   */
  async signUp({ name, email, password }) {
    if (!this.isConfigured()) {
      return { success: false, message: 'Supabase не настроен (config.js)' };
    }

    const { data, error } = await this.client.auth.signUp({
      email: String(email).trim(),
      password,
      options: {
        data: { name: String(name).trim() }
      }
    });

    if (error) {
      return { success: false, message: this._mapError(error) };
    }

    return {
      success: true,
      data,
      message: data.session
        ? 'Аккаунт создан'
        : 'Проверьте почту для подтверждения регистрации'
    };
  }

  /**
   * Вход.
   * @param {{ email: string, password: string }} payload
   */
  async signIn({ email, password }) {
    if (!this.isConfigured()) {
      return { success: false, message: 'Supabase не настроен (config.js)' };
    }

    const { data, error } = await this.client.auth.signInWithPassword({
      email: String(email).trim(),
      password
    });

    if (error) {
      return { success: false, message: this._mapError(error) };
    }

    return { success: true, data, message: 'Вход выполнен' };
  }

  /**
   * Выход.
   */
  async signOut() {
    if (!this.isConfigured()) return { success: true };
    const { error } = await this.client.auth.signOut();
    if (error) return { success: false, message: this._mapError(error) };
    this.session = null;
    return { success: true };
  }

  /**
   * Восстановление пароля (письмо от Supabase).
   * @param {string} email
   */
  async resetPassword(email) {
    if (!this.isConfigured()) {
      return { success: false, message: 'Supabase не настроен (config.js)' };
    }

    const redirectTo = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}login.html`;
    const { error } = await this.client.auth.resetPasswordForEmail(String(email).trim(), {
      redirectTo
    });

    if (error) return { success: false, message: this._mapError(error) };
    return {
      success: true,
      message: 'Письмо для восстановления пароля отправлено'
    };
  }

  /**
   * Смена пароля (для авторизованного пользователя / recovery session).
   * @param {string} newPassword
   */
  async updatePassword(newPassword) {
    if (!this.isConfigured()) {
      return { success: false, message: 'Supabase не настроен' };
    }
    const { error } = await this.client.auth.updateUser({ password: newPassword });
    if (error) return { success: false, message: this._mapError(error) };
    return { success: true, message: 'Пароль обновлён' };
  }

  /**
   * Человекочитаемые ошибки Auth.
   * @private
   */
  _mapError(error) {
    const msg = error?.message || 'Ошибка авторизации';
    const map = {
      'Invalid login credentials': 'Неверный email или пароль',
      'Email not confirmed': 'Подтвердите email перед входом',
      'User already registered': 'Пользователь уже зарегистрирован',
      'Password should be at least 6 characters': 'Пароль должен быть не короче 6 символов',
      'Signup requires a valid password': 'Укажите корректный пароль'
    };
    return map[msg] || msg;
  }
}

export const authService = new AuthService();
export default authService;
