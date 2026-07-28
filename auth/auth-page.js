/**
 * auth/auth-page.js — логика страницы входа/регистрации
 */
import { authService } from '../services/AuthService.js';
import { isSupabaseConfigured } from '../config.js';

/**
 * Контроллер страницы авторизации.
 */
class AuthPage {
  constructor() {
    this.mode = 'login';
  }

  async init() {
    this.cacheDom();
    this.bindEvents();
    this.showConfigWarning();

    if (isSupabaseConfigured()) {
      const session = await authService.getSession();
      if (session) {
        window.location.href = 'app.html';
        return;
      }
    }

    this.renderMode('login');
  }

  cacheDom() {
    this.formLogin = document.getElementById('form-login');
    this.formRegister = document.getElementById('form-register');
    this.formForgot = document.getElementById('form-forgot');
    this.alert = document.getElementById('auth-alert');
    this.title = document.getElementById('auth-title');
    this.subtitle = document.getElementById('auth-subtitle');
  }

  bindEvents() {
    document.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => this.renderMode(btn.dataset.mode));
    });

    this.formLogin?.addEventListener('submit', (e) => this.onLogin(e));
    this.formRegister?.addEventListener('submit', (e) => this.onRegister(e));
    this.formForgot?.addEventListener('submit', (e) => this.onForgot(e));
  }

  showConfigWarning() {
    if (!isSupabaseConfigured()) {
      this.setAlert('Укажите SUPABASE_URL и SUPABASE_ANON_KEY в config.js, затем выполните supabase/schema.sql', 'warning');
    }
  }

  renderMode(mode) {
    this.mode = mode;
    document.querySelectorAll('.auth-form').forEach((form) => form.classList.add('hidden'));
    document.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    if (mode === 'login') {
      this.title.textContent = 'Вход';
      this.subtitle.textContent = 'Личный финансовый кабинет';
      this.formLogin?.classList.remove('hidden');
    } else if (mode === 'register') {
      this.title.textContent = 'Создать аккаунт';
      this.subtitle.textContent = 'Профиль и конверты создадутся автоматически';
      this.formRegister?.classList.remove('hidden');
    } else {
      this.title.textContent = 'Забыли пароль';
      this.subtitle.textContent = 'Отправим письмо для сброса через Supabase Auth';
      this.formForgot?.classList.remove('hidden');
    }
  }

  setAlert(message, type = 'info') {
    if (!this.alert) return;
    this.alert.textContent = message;
    this.alert.className = `auth-alert show ${type}`;
  }

  clearAlert() {
    if (!this.alert) return;
    this.alert.className = 'auth-alert';
    this.alert.textContent = '';
  }

  async onLogin(event) {
    event.preventDefault();
    this.clearAlert();
    const form = new FormData(event.target);
    const result = await authService.signIn({
      email: form.get('email'),
      password: form.get('password')
    });
    if (!result.success) {
      this.setAlert(result.message, 'error');
      return;
    }
    window.location.href = 'app.html';
  }

  async onRegister(event) {
    event.preventDefault();
    this.clearAlert();
    const form = new FormData(event.target);
    const password = String(form.get('password') || '');
    const confirm = String(form.get('password2') || '');

    if (password !== confirm) {
      this.setAlert('Пароли не совпадают', 'error');
      return;
    }
    if (password.length < 6) {
      this.setAlert('Пароль не короче 6 символов', 'error');
      return;
    }

    const result = await authService.signUp({
      name: form.get('name'),
      email: form.get('email'),
      password
    });

    if (!result.success) {
      this.setAlert(result.message, 'error');
      return;
    }

    if (result.data?.session) {
      window.location.href = 'app.html';
      return;
    }

    this.setAlert(result.message, 'success');
    this.renderMode('login');
  }

  async onForgot(event) {
    event.preventDefault();
    this.clearAlert();
    const form = new FormData(event.target);
    const result = await authService.resetPassword(form.get('email'));
    this.setAlert(result.message, result.success ? 'success' : 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new AuthPage().init();
});
