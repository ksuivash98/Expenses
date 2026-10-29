import { cloudConfig } from './cloud-config.js';
import { storage } from './storage.js';

const SESSION = 'finance_cloud_session_v1';
const configured = Boolean(cloudConfig.url && cloudConfig.publicKey);
const message = error => String(error?.message || 'Не удалось подключиться к облаку');

class Cloud {
  constructor() {
    this.session = null;
    this.busy = false;
    this.conflict = false;
    this.applying = false;
    this.status = configured ? 'Войти' : 'Локальный режим';
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'account-dialog';
    this.dialog.setAttribute('aria-label', 'Аккаунт и синхронизация');
    document.body.append(this.dialog);
    storage.subscribe(() => {
      if (!this.session || this.applying) return;
      this.meta.dirty = true;
      this.persistMeta();
      this.setStatus('Есть изменения');
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.sync(), 1000);
    });
    window.addEventListener('online', () => this.sync());
    window.addEventListener('focus', () => this.sync());
  }

  setStatus(value) {
    this.status = value;
    if (this.button) this.button.textContent = `Аккаунт · ${value}`;
  }
  persistMeta() { localStorage.setItem(this.metaKey, JSON.stringify(this.meta)); }
  async request(path, options = {}) {
    const response = await fetch(`${cloudConfig.url.replace(/\/$/, '')}${path}`, {
      ...options,
      signal: AbortSignal.timeout(12000),
      headers: { apikey: cloudConfig.publicKey, 'Content-Type': 'application/json',
        ...(this.session ? { Authorization: `Bearer ${this.session.access_token}` } : {}), ...options.headers }
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      if (String(result?.message || '').includes('SYNC_CONFLICT')) {
        this.conflict = true;
        throw new Error('На другом устройстве есть изменения. Откройте аккаунт и выберите версию.');
      }
      throw new Error(result?.msg || result?.message || result?.error_description || `Ошибка сервера: ${response.status}`);
    }
    return result;
  }
  saveSession(session) {
    this.session = session;
    localStorage.setItem(SESSION, JSON.stringify(session));
  }
  async token() {
    if (!this.session) throw new Error('Войдите в аккаунт');
    if ((this.session.expires_at || 0) * 1000 > Date.now() + 60000) return;
    const result = await this.request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: JSON.stringify({ refresh_token: this.session.refresh_token })
    });
    this.saveSession(result);
  }
  selectAccount() {
    storage.useAccount(this.session.user.id);
    this.metaKey = `finance_cloud_meta:${this.session.user.id}`;
    try { this.meta = JSON.parse(localStorage.getItem(this.metaKey)) || { revision: 0, dirty: false }; }
    catch { this.meta = { revision: 0, dirty: false }; }
  }
  async start() {
    if (!configured) return;
    try { this.session = JSON.parse(localStorage.getItem(SESSION)); } catch { /* no session */ }
    if (!this.session?.user?.id) {
      this.session = null;
      // Keep the existing local cabinet available until the user chooses to sign in.
      return;
    }
    this.selectAccount();
    await this.sync();
  }
  attach() {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'btn btn-ghost btn-sm';
    this.button.id = 'account-button';
    this.button.addEventListener('click', () => this.open());
    document.querySelector('.topbar-actions')?.prepend(this.button);
    this.setStatus(this.status);
  }
  async remote() {
    const rows = await this.request('/rest/v1/finance_documents?select=data,revision');
    return rows?.[0] || null;
  }
  apply(data) {
    this.applying = true;
    try {
      const result = storage.importJSON(JSON.stringify(data));
      if (!result.success) throw new Error(result.message);
    } finally { this.applying = false; }
  }
  async sync() {
    if (!this.session || this.busy || this.conflict) return;
    this.busy = true;
    try {
      this.lastError = '';
      this.setStatus('Синхронизация…');
      await this.token();
      if (this.meta.dirty) {
        const snapshot = storage.exportJSON();
        this.meta.revision = await this.request('/rest/v1/rpc/save_finance_document', {
          method: 'POST', body: JSON.stringify({ document: JSON.parse(snapshot), expected_revision: this.meta.revision })
        });
        // Edits made during the request must remain pending.
        this.meta.dirty = snapshot !== storage.exportJSON();
        this.persistMeta();
      } else {
        const row = await this.remote();
        // A local edit may have happened while waiting for the server.
        if (!this.meta.dirty && row && row.revision !== this.meta.revision) {
          this.apply(row.data);
          this.meta.revision = row.revision;
          this.persistMeta();
          window.dispatchEvent(new Event('finance-cloud-updated'));
        }
      }
      this.setStatus(this.meta.dirty ? 'Есть изменения' : 'Синхронизировано');
    } catch (error) {
      this.setStatus(this.conflict ? 'Конфликт версий' : 'Нет синхронизации');
      this.lastError = message(error);
    } finally {
      this.busy = false;
      if (this.meta?.dirty && !this.lastError && !this.conflict) {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.sync(), 1000);
      }
    }
  }
  download() {
    const url = URL.createObjectURL(new Blob([storage.exportJSON()], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'finance-local-backup.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  open() {
    this.dialog.replaceChildren();
    const title = document.createElement('h2'); title.textContent = 'Ваш аккаунт'; this.dialog.append(title);
    const info = document.createElement('p'); info.className = 'muted'; this.dialog.append(info);
    const feedback = document.createElement('p'); feedback.setAttribute('role', 'status');
    const action = (label, fn) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-ghost'; button.textContent = label;
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await fn(); } catch (error) { feedback.textContent = message(error); }
        finally { button.disabled = false; }
      }); this.dialog.append(button); return button;
    };
    if (!configured) {
      info.textContent = 'Облачный вход ещё не подключён. Данные продолжают храниться в этом браузере. Для включения нужны публичные параметры проекта Supabase в cloud-config.js и таблица из supabase/schema.sql.';
    } else if (this.session) {
      info.textContent = `${this.session.user.email || 'Личный кабинет'} · ${this.status}`;
      feedback.textContent = this.lastError || '';
      action('Повторить синхронизацию', async () => { await this.sync(); feedback.textContent = this.lastError || this.status; });
      action('Скачать локальную копию', () => this.download());
      if (this.conflict) {
        action('Загрузить облачную версию', async () => {
          if (!confirm('Локальные изменения будут заменены. Сначала скачайте локальную копию. Продолжить?')) return;
          await this.token(); const row = await this.remote(); if (!row) throw new Error('Облачной версии нет');
          this.apply(row.data); this.meta = { revision: row.revision, dirty: false }; this.persistMeta(); location.reload();
        });
      }
      if (!this.conflict && !this.meta.revision && localStorage.getItem('financeApp_v1')) {
        action('Перенести данные из локального режима', async () => {
          if (!confirm('Перенести локальные записи в этот аккаунт? Они заменят его текущие данные.')) return;
          this.apply(JSON.parse(localStorage.getItem('financeApp_v1'))); this.meta.dirty = true; this.persistMeta(); await this.sync();
          if (this.lastError) feedback.textContent = this.lastError; else location.reload();
        });
      }
      action('Выйти на этом устройстве', async () => {
        if (this.meta.dirty && !confirm('Есть несинхронизированные изменения. Они останутся в этом браузере до следующего входа. Выйти?')) return;
        // Revoke if reachable; local sign-out always succeeds offline.
        try { await this.request('/auth/v1/logout', { method: 'POST' }); } catch { /* offline */ }
        localStorage.removeItem(SESSION); location.reload();
      });
    } else {
      info.textContent = 'Вход по email и паролю. Локальные данные не переносятся без вашего согласия.';
      const form = document.createElement('form');
      form.innerHTML = '<label>Email<input name="email" type="email" autocomplete="email" required></label><label>Пароль<input name="password" type="password" autocomplete="current-password" minlength="8" required></label><button class="btn btn-primary" type="submit">Войти</button><button class="btn btn-ghost" type="submit" name="signup" value="yes">Создать аккаунт</button>';
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const buttons = form.querySelectorAll('button'); buttons.forEach(button => button.disabled = true);
        try {
          const data = Object.fromEntries(new FormData(form)); const signup = event.submitter?.name === 'signup';
          const result = await this.request(signup ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify(data) });
          if (result.access_token && result.user) { this.saveSession(result); location.reload(); }
          else feedback.textContent = 'Проверьте почту и подтвердите регистрацию, затем войдите.';
        } catch (error) { feedback.textContent = message(error); }
        finally { buttons.forEach(button => button.disabled = false); }
      }); this.dialog.append(form);
    }
    this.dialog.append(feedback);
    action('Закрыть', () => this.dialog.close());
    if (!this.dialog.open) this.dialog.showModal();
  }
}
export const cloud = new Cloud();
