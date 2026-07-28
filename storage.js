/**
 * storage.js
 * Единое хранилище данных приложения на базе LocalStorage.
 * Все модули работают только через этот класс — без дублирующих массивов.
 */

import { deepClone, generateId, todayISO } from './utils.js';

/** Ключ LocalStorage для всего состояния приложения. */
const STORAGE_KEY = 'personal_finance_cabinet_v1';

/**
 * Категории бюджетных конвертов по умолчанию.
 * @returns {Array<object>}
 */
function getDefaultBudgetCategories() {
  return [
    {
      id: 'cat_debts',
      name: 'Долги',
      icon: '💳',
      color: '#F31260',
      createdAt: todayISO(),
      isDefault: true
    },
    {
      id: 'cat_child',
      name: 'Ребёнок',
      icon: '👶',
      color: '#5B8DEF',
      createdAt: todayISO(),
      isDefault: true
    },
    {
      id: 'cat_life',
      name: 'Жизнь',
      icon: '🛒',
      color: '#36C6A0',
      createdAt: todayISO(),
      isDefault: true
    },
    {
      id: 'cat_home',
      name: 'Квартира',
      icon: '🏠',
      color: '#F5A524',
      createdAt: todayISO(),
      isDefault: true
    },
    {
      id: 'cat_clothes',
      name: 'Одежда',
      icon: '👕',
      color: '#9353D3',
      createdAt: todayISO(),
      isDefault: true
    },
    {
      id: 'cat_beauty',
      name: 'Бьюти',
      icon: '💄',
      color: '#FF6B6B',
      createdAt: todayISO(),
      isDefault: true
    },
    {
      id: 'cat_savings',
      name: 'Накопления',
      icon: '💰',
      color: '#7CFFB2',
      createdAt: todayISO(),
      isDefault: true
    }
  ];
}

/**
 * Категории коммунальных услуг по умолчанию.
 * @returns {Array<object>}
 */
function getDefaultUtilityTypes() {
  return [
    { id: 'util_energy', name: 'ПЕРМЭНЕРГОСБЫТ', icon: '⚡', color: '#F5A524' },
    { id: 'util_maintenance', name: 'СОДЕРЖАНИЕ ЖИЛОГО ПОМЕЩЕНИЯ', icon: '🏢', color: '#5B8DEF' },
    { id: 'util_zhkh', name: 'ЖКХ', icon: '🚿', color: '#00B7C3' },
    { id: 'util_gas', name: 'ГАЗ', icon: '🔥', color: '#FF6B6B' },
    { id: 'util_capital', name: 'КАПИТАЛЬНЫЙ РЕМОНТ', icon: '🛠', color: '#9353D3' },
    { id: 'util_tko', name: 'ТКО', icon: '♻', color: '#36C6A0' }
  ];
}

/**
 * Категории покупок по умолчанию.
 * @returns {Array<object>}
 */
function getDefaultExpenseCategories() {
  return [
    { id: 'exp_food', name: 'Продукты', icon: '🛒' },
    { id: 'exp_home', name: 'Дом', icon: '🏠' },
    { id: 'exp_beauty', name: 'Красота', icon: '💄' },
    { id: 'exp_clothes', name: 'Одежда', icon: '👕' },
    { id: 'exp_pharmacy', name: 'Аптека', icon: '💊' },
    { id: 'exp_transport', name: 'Транспорт', icon: '🚌' },
    { id: 'exp_fun', name: 'Развлечения', icon: '🎬' },
    { id: 'exp_other', name: 'Прочее', icon: '📦' }
  ];
}

/**
 * Источники доходов по умолчанию.
 * @returns {string[]}
 */
function getDefaultIncomeSources() {
  return [
    'Зарплата',
    'Аванс',
    'Подработка',
    'Премия',
    'Кэшбэк',
    'Возврат долга',
    'Дивиденды',
    'Подарок',
    'Другое'
  ];
}

/**
 * Возвращает начальное состояние приложения.
 * @returns {object}
 */
function createDefaultState() {
  return {
    income: [],
    budgetCategories: getDefaultBudgetCategories(),
    budgetTransactions: [],
    expenses: [],
    credits: [],
    creditPayments: [],
    utilities: [],
    utilityTypes: getDefaultUtilityTypes(),
    expenseCategories: getDefaultExpenseCategories(),
    incomeSources: getDefaultIncomeSources(),
    goals: [],
    history: [],
    notifications: [],
    settings: {
      theme: 'dark',
      currency: 'RUB',
      locale: 'ru-RU',
      animations: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  };
}

/**
 * Класс единого хранилища данных.
 * Обеспечивает загрузку, сохранение, CRUD и подписку на изменения.
 */
export class Storage {
  /**
   * Создаёт экземпляр хранилища и загружает данные.
   */
  constructor() {
    /** @type {object} */
    this.state = createDefaultState();

    /** @type {Set<Function>} */
    this.listeners = new Set();

    this.load();
  }

  /**
   * Загружает состояние из LocalStorage или инициализирует значениями по умолчанию.
   */
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.state = createDefaultState();
        this.save(false);
        return;
      }

      const parsed = JSON.parse(raw);
      const defaults = createDefaultState();

      this.state = {
        ...defaults,
        ...parsed,
        settings: {
          ...defaults.settings,
          ...(parsed.settings || {})
        },
        budgetCategories: parsed.budgetCategories?.length
          ? parsed.budgetCategories
          : defaults.budgetCategories,
        utilityTypes: parsed.utilityTypes?.length
          ? parsed.utilityTypes
          : defaults.utilityTypes,
        expenseCategories: parsed.expenseCategories?.length
          ? parsed.expenseCategories
          : defaults.expenseCategories,
        incomeSources: parsed.incomeSources?.length
          ? parsed.incomeSources
          : defaults.incomeSources
      };
    } catch (error) {
      console.error('Ошибка загрузки LocalStorage:', error);
      this.state = createDefaultState();
      this.save(false);
    }
  }

  /**
   * Сохраняет текущее состояние в LocalStorage.
   * @param {boolean} [notify=true] Уведомлять ли подписчиков.
   */
  save(notify = true) {
    this.state.settings.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.error('Ошибка сохранения LocalStorage:', error);
      throw new Error('Не удалось сохранить данные. Возможно, переполнено хранилище браузера.');
    }

    if (notify) {
      this.notify();
    }
  }

  /**
   * Подписывает колбэк на изменения хранилища.
   * @param {Function} listener
   * @returns {Function} Функция отписки.
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Уведомляет всех подписчиков об изменении данных.
   */
  notify() {
    const snapshot = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error('Ошибка в подписчике Storage:', error);
      }
    });
  }

  /**
   * Возвращает глубокую копию текущего состояния.
   * @returns {object}
   */
  getState() {
    return deepClone(this.state);
  }

  /**
   * Возвращает копию коллекции по имени.
   * @param {string} collection
   * @returns {Array}
   */
  getCollection(collection) {
    if (!Array.isArray(this.state[collection])) {
      return [];
    }
    return deepClone(this.state[collection]);
  }

  /**
   * Возвращает настройки приложения.
   * @returns {object}
   */
  getSettings() {
    return deepClone(this.state.settings);
  }

  /**
   * Обновляет настройки.
   * @param {object} patch
   * @returns {object}
   */
  updateSettings(patch) {
    this.state.settings = {
      ...this.state.settings,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    this.save();
    return this.getSettings();
  }

  /**
   * Находит запись в коллекции по ID.
   * @param {string} collection
   * @param {string} id
   * @returns {object|null}
   */
  findById(collection, id) {
    const items = this.state[collection];
    if (!Array.isArray(items)) return null;
    const found = items.find((item) => item.id === id);
    return found ? deepClone(found) : null;
  }

  /**
   * Добавляет запись в коллекцию.
   * @param {string} collection
   * @param {object} item
   * @param {boolean} [autoSave=true]
   * @returns {object}
   */
  add(collection, item, autoSave = true) {
    if (!Array.isArray(this.state[collection])) {
      throw new Error(`Коллекция "${collection}" не существует`);
    }

    const record = {
      id: item.id || generateId(),
      createdAt: item.createdAt || new Date().toISOString(),
      ...item
    };

    this.state[collection].push(record);

    if (autoSave) {
      this.save();
    }

    return deepClone(record);
  }

  /**
   * Обновляет запись в коллекции по ID.
   * @param {string} collection
   * @param {string} id
   * @param {object} patch
   * @param {boolean} [autoSave=true]
   * @returns {object|null}
   */
  update(collection, id, patch, autoSave = true) {
    if (!Array.isArray(this.state[collection])) {
      throw new Error(`Коллекция "${collection}" не существует`);
    }

    const index = this.state[collection].findIndex((item) => item.id === id);
    if (index === -1) return null;

    this.state[collection][index] = {
      ...this.state[collection][index],
      ...patch,
      id,
      updatedAt: new Date().toISOString()
    };

    if (autoSave) {
      this.save();
    }

    return deepClone(this.state[collection][index]);
  }

  /**
   * Удаляет запись из коллекции по ID.
   * @param {string} collection
   * @param {string} id
   * @param {boolean} [autoSave=true]
   * @returns {boolean}
   */
  remove(collection, id, autoSave = true) {
    if (!Array.isArray(this.state[collection])) {
      throw new Error(`Коллекция "${collection}" не существует`);
    }

    const before = this.state[collection].length;
    this.state[collection] = this.state[collection].filter((item) => item.id !== id);
    const removed = this.state[collection].length < before;

    if (removed && autoSave) {
      this.save();
    }

    return removed;
  }

  /**
   * Удаляет несколько записей по предикату.
   * @param {string} collection
   * @param {function(object): boolean} predicate
   * @param {boolean} [autoSave=true]
   * @returns {number} Количество удалённых записей.
   */
  removeWhere(collection, predicate, autoSave = true) {
    if (!Array.isArray(this.state[collection])) {
      throw new Error(`Коллекция "${collection}" не существует`);
    }

    const before = this.state[collection].length;
    this.state[collection] = this.state[collection].filter((item) => !predicate(item));
    const removedCount = before - this.state[collection].length;

    if (removedCount > 0 && autoSave) {
      this.save();
    }

    return removedCount;
  }

  /**
   * Заменяет всю коллекцию новым массивом.
   * @param {string} collection
   * @param {Array} items
   * @param {boolean} [autoSave=true]
   */
  setCollection(collection, items, autoSave = true) {
    if (!Array.isArray(items)) {
      throw new Error('Ожидается массив');
    }
    this.state[collection] = deepClone(items);
    if (autoSave) {
      this.save();
    }
  }

  /**
   * Выполняет несколько изменений без промежуточных сохранений.
   * @param {function(Storage): void} mutator
   */
  batch(mutator) {
    mutator(this);
    this.save();
  }

  /**
   * Добавляет запись в историю операций.
   * @param {object} entry
   * @param {boolean} [autoSave=true]
   * @returns {object}
   */
  addHistory(entry, autoSave = true) {
    return this.add('history', {
      id: generateId(),
      timestamp: new Date().toISOString(),
      type: entry.type,
      title: entry.title,
      description: entry.description || '',
      amount: entry.amount ?? null,
      meta: entry.meta || {},
      icon: entry.icon || '📌'
    }, autoSave);
  }

  /**
   * Добавляет уведомление.
   * @param {object} entry
   * @param {boolean} [autoSave=true]
   * @returns {object}
   */
  addNotification(entry, autoSave = true) {
    return this.add('notifications', {
      id: generateId(),
      timestamp: new Date().toISOString(),
      read: false,
      type: entry.type || 'info',
      title: entry.title,
      message: entry.message || '',
      link: entry.link || null
    }, autoSave);
  }

  /**
   * Экспортирует всё состояние в JSON-строку.
   * @returns {string}
   */
  exportJSON() {
    return JSON.stringify(this.getState(), null, 2);
  }

  /**
   * Импортирует состояние из JSON-строки с валидацией структуры.
   * @param {string} jsonString
   * @returns {{ success: boolean, message: string }}
   */
  importJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { success: false, message: 'Некорректный формат файла' };
      }

      const defaults = createDefaultState();
      const collections = [
        'income',
        'budgetCategories',
        'budgetTransactions',
        'expenses',
        'credits',
        'creditPayments',
        'utilities',
        'utilityTypes',
        'expenseCategories',
        'incomeSources',
        'goals',
        'history',
        'notifications'
      ];

      const nextState = createDefaultState();

      collections.forEach((key) => {
        if (Array.isArray(data[key])) {
          nextState[key] = data[key];
        }
      });

      if (data.settings && typeof data.settings === 'object') {
        nextState.settings = {
          ...defaults.settings,
          ...data.settings
        };
      }

      if (!nextState.budgetCategories.length) {
        nextState.budgetCategories = defaults.budgetCategories;
      }

      this.state = nextState;
      this.save();

      return { success: true, message: 'Данные успешно импортированы' };
    } catch (error) {
      return {
        success: false,
        message: `Ошибка импорта: ${error.message}`
      };
    }
  }

  /**
   * Полностью очищает данные и восстанавливает значения по умолчанию.
   */
  clearAll() {
    this.state = createDefaultState();
    this.save();
  }

  /**
   * Возвращает ключ LocalStorage (для отладки).
   * @returns {string}
   */
  getStorageKey() {
    return STORAGE_KEY;
  }
}

/** Единственный экземпляр хранилища на всё приложение. */
export const storage = new Storage();

export default storage;
