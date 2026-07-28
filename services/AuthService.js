/**
 * services/AuthService.js
 * Авторизация через Supabase Auth.
 */

import {
  getSupabaseClient,
  hasSupabaseClient,
  checkAuthConnection,
  diagnoseSupabase
} from './supabaseClient.js';

/**
 * Сервис аутентификации.
 */
export class AuthService {
  constructor() {
    this.listeners = new Set();
    this.session = null;
    this._unsubscribe = null;

    if (hasSupabaseClient()) {
      try {
        const client = getSupabaseClient();
        const { data } = client.auth.onAuthStateChange((event, session) => {
          this.session = session;
          this.listeners.forEach((fn) => {
            try { fn(event, session); } catch (e) { console.error(e); }
          });
        });
        this._unsubscribe = data?.subscription?.unsubscribe?.bind(data.subscription);
      } catch (error) {
        console.error('AuthService init error:', error);
      }
    }
  }

  /**
   * @returns {boolean}
   */
  isConfigured() {
    return hasSupabaseClient();
  }

  /**
   * Клиент Supabase.
   * @returns {import('@supabase/supabase-js').SupabaseClient}
   */
  getClient() {
    return getSupabaseClient();
  }

  /**
   * Диагностика Auth + DB.
   * @returns {Promise<object>}
   */
  diagnose() {
    return diagnoseSupabase();
  }

  /**
   * Быстрая проверка Auth API.
   * @returns {Promise<object>}
   */
  checkConnection() {
    return checkAuthConnection();
  }

  /**
   * @param {Function} listener
   * @returns {Function}
   */
  onAuthChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * @returns {Promise<object|null>}
   */
  async getSession() {
    if (!this.isConfigured()) return null;
    const { data, error } = await this.getClient().auth.getSession();
    if (error) throw error;
    this.session = data.session;
    return data.session;
  }

  /**
   * @returns {Promise<object|null>}
   */
  async getUser() {
    const session = await this.getSession();
    return session?.user || null;
  }

  /**
   * @param {{ name: string, email: string, password: string }} payload
   */
  async signUp({ name, email, password }) {
    if (!this.isConfigured()) {
      return { success: false, message: 'Supabase не настроен (config.js / config.local.js)' };
    }

    const { data, error } = await this.getClient().auth.signUp({
      email: String(email).trim(),
      password,
      options: { data: { name: String(name).trim() } }
    });

    if (error) return { success: false, message: this._mapError(error) };

    return {
      success: true,
      data,
      message: data.session
        ? 'Аккаунт создан'
        : 'Проверьте почту для подтверждения регистрации'
    };
  }

  /**
   * @param {{ email: string, password: string }} payload
   */
  async signIn({ email, password }) {
    if (!this.isConfigured()) {
      return { success: false, message: 'Supabase не настроен (config.js / config.local.js)' };
    }

    const { data, error } = await this.getClient().auth.signInWithPassword({
      email: String(email).trim(),
      password
    });

    if (error) return { success: false, message: this._mapError(error) };
    this.session = data.session;
    return { success: true, data, message: 'Вход выполнен' };
  }

  async signOut() {
    if (!this.isConfigured()) return { success: true };
    const { error } = await this.getClient().auth.signOut();
    if (error) return { success: false, message: this._mapError(error) };
    this.session = null;
    return { success: true };
  }

  /**
   * @param {string} email
   */
  async resetPassword(email) {
    if (!this.isConfigured()) {
      return { success: false, message: 'Supabase не настроен' };
    }

    const redirectTo = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}login.html`;
    const { error } = await this.getClient().auth.resetPasswordForEmail(String(email).trim(), {
      redirectTo
    });

    if (error) return { success: false, message: this._mapError(error) };
    return { success: true, message: 'Письмо для восстановления пароля отправлено' };
  }

  /**
   * @param {string} newPassword
   */
  async updatePassword(newPassword) {
    if (!this.isConfigured()) {
      return { success: false, message: 'Supabase не настроен' };
    }
    const { error } = await this.getClient().auth.updateUser({ password: newPassword });
    if (error) return { success: false, message: this._mapError(error) };
    return { success: true, message: 'Пароль обновлён' };
  }

  /**
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
