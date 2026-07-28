/**
 * services/SettingsService.js
 */
import { TABLES } from '../config.js';
import { databaseService } from './DatabaseService.js';
import { exportHelper } from '../helpers/export.js';
import { readFileAsText } from '../helpers/utils.js';
import { CURRENCY_SYMBOLS } from '../helpers/format.js';
import { authService } from './AuthService.js';

export class SettingsService {
  get() {
    return databaseService.cache?.getSettings() || {
      theme: 'dark',
      currency: 'RUB',
      animations: true,
      locale: 'ru-RU'
    };
  }

  getCurrencies() {
    return Object.entries(CURRENCY_SYMBOLS).map(([code, symbol]) => ({
      code, symbol, label: code
    }));
  }

  applyTheme(theme) {
    const value = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', value);
    document.body?.classList.toggle('theme-light', value === 'light');
    document.body?.classList.toggle('theme-dark', value === 'dark');
  }

  async setTheme(theme) {
    const current = this.get();
    const value = theme === 'light' ? 'light' : 'dark';
    this.applyTheme(value);
    const row = await databaseService.upsertSingleton(TABLES.settings, {
      ...current,
      id: current.id,
      theme: value,
      updated_at: new Date().toISOString()
    });
    return row;
  }

  async setCurrency(currency) {
    if (!CURRENCY_SYMBOLS[currency]) return { success: false, message: 'Неподдерживаемая валюта' };
    const current = this.get();
    const row = await databaseService.upsertSingleton(TABLES.settings, {
      ...current,
      id: current.id,
      currency,
      updated_at: new Date().toISOString()
    });
    return { success: true, data: row };
  }

  exportJSON() {
    exportHelper.exportJSON(databaseService.getSnapshot());
  }

  exportCSV() {
    exportHelper.exportCSV(databaseService.getSnapshot(), this.get().currency);
  }

  async exportPDF() {
    const user = await authService.getUser();
    const profile = databaseService.cache?.getProfile() || {};
    exportHelper.exportPDF(
      databaseService.getSnapshot(),
      { ...profile, email: user?.email },
      this.get().currency
    );
  }

  async importJSON(file) {
    const text = await readFileAsText(file);
    const parsed = exportHelper.parseImportJSON(text);
    if (!parsed.success) return parsed;
    await databaseService.importSnapshot(parsed.data);
    return { success: true, message: 'Данные импортированы' };
  }

  init() {
    this.applyTheme(this.get().theme || 'dark');
  }
}

export const settingsService = new SettingsService();
export default settingsService;
