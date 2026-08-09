/**
 * settings.js — настройки и резервное копирование
 */
import { storage } from './storage.js';
import { downloadText, readFileAsText, todayISO } from './utils.js';

export class SettingsService {
  get() {
    return storage.getSettings();
  }

  update(patch) {
    return storage.updateSettings(patch);
  }

  setTheme(theme) {
    const value = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', value);
    document.documentElement.style.colorScheme = value;
    document.body.classList.toggle('theme-light', value === 'light');
    document.body.classList.toggle('theme-dark', value !== 'light');
    return this.update({ theme: value });
  }

  applyTheme() {
    const theme = this.get().theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
    document.body.classList.toggle('theme-light', theme === 'light');
    document.body.classList.toggle('theme-dark', theme !== 'light');
  }

  exportJSON() {
    const json = storage.exportJSON();
    downloadText(`financeApp-backup-${todayISO()}.json`, json);
    return { success: true, message: 'Экспорт выполнен' };
  }

  downloadBackup() {
    return this.exportJSON();
  }

  async importJSON(file) {
    if (!file) return { success: false, message: 'Файл не выбран' };
    try {
      const text = await readFileAsText(file);
      return storage.importJSON(text);
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async restoreBackup(file) {
    return this.importJSON(file);
  }

  clearAll(confirmed) {
    if (!confirmed) {
      return { success: false, message: 'Требуется подтверждение' };
    }
    return storage.clearAll();
  }
}

export const settingsService = new SettingsService();
export default settingsService;
