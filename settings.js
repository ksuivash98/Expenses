/**
 * settings.js
 * Настройки приложения: тема, валюта, экспорт/импорт, очистка данных.
 */

import { storage } from './storage.js';
import { historyService } from './history.js';
import { downloadFile, readFileAsText, CURRENCY_SYMBOLS } from './utils.js';

/**
 * Сервис настроек.
 */
export class SettingsService {
  /**
   * @param {import('./storage.js').Storage} [store]
   */
  constructor(store = storage) {
    this.store = store;
  }

  /**
   * Текущие настройки.
   * @returns {object}
   */
  get() {
    return this.store.getSettings();
  }

  /**
   * Список доступных валют.
   * @returns {Array<{ code: string, symbol: string, label: string }>}
   */
  getCurrencies() {
    return [
      { code: 'RUB', symbol: CURRENCY_SYMBOLS.RUB, label: 'Российский рубль' },
      { code: 'USD', symbol: CURRENCY_SYMBOLS.USD, label: 'Доллар США' },
      { code: 'EUR', symbol: CURRENCY_SYMBOLS.EUR, label: 'Евро' },
      { code: 'KZT', symbol: CURRENCY_SYMBOLS.KZT, label: 'Тенге' },
      { code: 'BYN', symbol: CURRENCY_SYMBOLS.BYN, label: 'Белорусский рубль' }
    ];
  }

  /**
   * Применяет тему к documentElement.
   * @param {string} theme 'dark' | 'light'
   */
  applyTheme(theme) {
    const value = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', value);
    document.body.classList.toggle('theme-light', value === 'light');
    document.body.classList.toggle('theme-dark', value === 'dark');
  }

  /**
   * Устанавливает тему.
   * @param {string} theme
   * @returns {object}
   */
  setTheme(theme) {
    const value = theme === 'light' ? 'light' : 'dark';
    const settings = this.store.updateSettings({ theme: value });
    this.applyTheme(value);

    historyService.add({
      type: 'settings',
      title: `Тема: ${value === 'dark' ? 'тёмная' : 'светлая'}`,
      description: 'Изменены настройки оформления',
      icon: '⚙'
    });

    return settings;
  }

  /**
   * Переключает тему.
   * @returns {object}
   */
  toggleTheme() {
    const current = this.get().theme;
    return this.setTheme(current === 'dark' ? 'light' : 'dark');
  }

  /**
   * Устанавливает валюту.
   * @param {string} currency
   * @returns {{ success: boolean, data?: object, message?: string }}
   */
  setCurrency(currency) {
    const allowed = this.getCurrencies().map((c) => c.code);
    if (!allowed.includes(currency)) {
      return { success: false, message: 'Неподдерживаемая валюта' };
    }

    const settings = this.store.updateSettings({ currency });

    historyService.add({
      type: 'settings',
      title: `Валюта: ${currency}`,
      description: 'Изменена валюта отображения',
      icon: '⚙'
    });

    return { success: true, data: settings };
  }

  /**
   * Включает/выключает анимации.
   * @param {boolean} enabled
   * @returns {object}
   */
  setAnimations(enabled) {
    return this.store.updateSettings({ animations: Boolean(enabled) });
  }

  /**
   * Экспортирует все данные в JSON-файл.
   */
  exportData() {
    const json = this.store.exportJSON();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadFile(`finance-backup-${stamp}.json`, json, 'application/json');

    historyService.add({
      type: 'settings',
      title: 'Экспорт данных',
      description: 'Создан JSON-бэкап',
      icon: '⚙'
    });
  }

  /**
   * Импортирует данные из File.
   * @param {File} file
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async importData(file) {
    if (!file) {
      return { success: false, message: 'Файл не выбран' };
    }

    try {
      const text = await readFileAsText(file);
      const result = this.store.importJSON(text);

      if (result.success) {
        this.applyTheme(this.get().theme);
        historyService.add({
          type: 'settings',
          title: 'Импорт данных',
          description: file.name || 'Данные восстановлены из файла',
          icon: '⚙'
        });
      }

      return result;
    } catch (error) {
      return { success: false, message: error.message || 'Ошибка чтения файла' };
    }
  }

  /**
   * Полная очистка данных пользователя.
   * @returns {{ success: boolean, message: string }}
   */
  clearAllData() {
    this.store.clearAll();
    this.applyTheme(this.get().theme);
    return { success: true, message: 'Все данные очищены' };
  }

  /**
   * Инициализация настроек при старте приложения.
   */
  init() {
    const settings = this.get();
    this.applyTheme(settings.theme || 'dark');
  }
}

/** Единственный экземпляр сервиса настроек. */
export const settingsService = new SettingsService();

export default settingsService;
