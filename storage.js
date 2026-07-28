/**
 * storage.js — единое LocalStorage-хранилище financeApp
 */

import {
  deepClone, generateId, getMonthName, todayISO
} from './utils.js';

const STORAGE_KEY = 'financeApp_v1';

/**
 * Категории бюджета по умолчанию.
 */
function defaultCategories(periodId, year, month) {
  const base = [
    { name: 'Долги', icon: '💳', color: '#F31260', sort: 1, carry_rule: 'balance', carry_max: null },
    { name: 'Ребёнок', icon: '👶', color: '#5B8DEF', sort: 2, carry_rule: 'balance', carry_max: null },
    { name: 'Жизнь', icon: '🛒', color: '#36C6A0', sort: 3, carry_rule: 'zero', carry_max: null },
    { name: 'Квартира', icon: '🏠', color: '#F5A524', sort: 4, carry_rule: 'balance', carry_max: null },
    { name: 'Одежда', icon: '👕', color: '#9353D3', sort: 5, carry_rule: 'max', carry_max: 5000 },
    { name: 'Бьюти', icon: '💄', color: '#FF6B6B', sort: 6, carry_rule: 'never', carry_max: null },
    { name: 'Накопления', icon: '💰', color: '#7CFFB2', sort: 7, carry_rule: 'always', carry_max: null }
  ];
  return base.map((item) => ({
    id: generateId(),
    period_id: periodId,
    year,
    month,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...item
  }));
}

/**
 * Создаёт начальное состояние приложения.
 */
function createDefaultState() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const periodId = generateId();

  const currentPeriod = {
    id: periodId,
    year,
    month,
    status: 'current',
    carry_over_mode: 'ask',
    unlock_edit: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    closed_at: null
  };

  return {
    settings: {
      theme: 'dark',
      currency: 'RUB',
      animations: true,
      locale: 'ru-RU',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    currentPeriodId: periodId,
    currentPeriod,
    financialPeriods: [currentPeriod],
    periodPlans: [{
      id: generateId(),
      period_id: periodId,
      year,
      month,
      planned_income: 0,
      actual_income: 0,
      planned_expense: 0,
      actual_expense: 0,
      planned_savings: 0,
      actual_savings: 0,
      planned_credits: 0,
      actual_credits: 0
    }],
    periodReports: [],
    income: [],
    budgetCategories: defaultCategories(periodId, year, month),
    budgetTransactions: [],
    expenses: [],
    credits: [],
    creditPayments: [],
    utilities: [],
    utilityPayments: [],
    regularPayments: [],
    goals: [],
    notifications: [{
      id: generateId(),
      period_id: periodId,
      year,
      month,
      title: 'Добро пожаловать',
      text: 'Личный финансовый кабинет готов к работе',
      is_read: false,
      type: 'success',
      created_at: new Date().toISOString()
    }],
    history: [{
      id: generateId(),
      period_id: periodId,
      year,
      month,
      type: 'system',
      title: 'Приложение запущено',
      description: `Создан период ${getMonthName(month - 1)} ${year}`,
      amount: null,
      icon: '👋',
      date: new Date().toISOString()
    }]
  };
}

/**
 * Единое хранилище.
 */
export class Storage {
  constructor() {
    this.state = createDefaultState();
    this.listeners = new Set();
    this.load();
  }

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
        settings: { ...defaults.settings, ...(parsed.settings || {}) }
      };
      if (!this.state.currentPeriodId && this.state.financialPeriods?.length) {
        const current = this.state.financialPeriods.find((p) => p.status === 'current')
          || this.state.financialPeriods[0];
        this.state.currentPeriodId = current.id;
        this.state.currentPeriod = current;
      } else {
        this.state.currentPeriod = this.state.financialPeriods
          .find((p) => p.id === this.state.currentPeriodId) || this.state.currentPeriod;
      }
    } catch (error) {
      console.error('Ошибка загрузки LocalStorage', error);
      this.state = createDefaultState();
      this.save(false);
    }
  }

  save(notify = true) {
    this.state.settings.updated_at = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    if (notify) this.notify();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    const snapshot = this.getState();
    this.listeners.forEach((fn) => {
      try { fn(snapshot); } catch (e) { console.error(e); }
    });
  }

  getState() {
    return deepClone(this.state);
  }

  getSettings() {
    return deepClone(this.state.settings);
  }

  updateSettings(patch) {
    this.state.settings = {
      ...this.state.settings,
      ...patch,
      updated_at: new Date().toISOString()
    };
    this.save();
    return this.getSettings();
  }

  getCurrentPeriod() {
    return deepClone(this.state.currentPeriod);
  }

  getCurrentPeriodId() {
    return this.state.currentPeriodId;
  }

  setCurrentPeriod(periodId) {
    const period = this.state.financialPeriods.find((p) => p.id === periodId);
    if (!period) throw new Error('Период не найден');
    this.state.currentPeriodId = periodId;
    this.state.currentPeriod = period;
    this.save();
    return deepClone(period);
  }

  canEditCurrentPeriod() {
    const period = this.state.currentPeriod;
    if (!period) return false;
    if (period.status === 'current' || period.status === 'future') return true;
    return Boolean(period.unlock_edit);
  }

  getPeriodMeta() {
    const period = this.state.currentPeriod;
    if (!period) throw new Error('Период не выбран');
    return { period_id: period.id, year: period.year, month: period.month };
  }

  /**
   * Коллекция с фильтром по текущему периоду (если есть period_id).
   */
  list(collection, { allPeriods = false } = {}) {
    const rows = this.state[collection] || [];
    if (allPeriods || !this.state.currentPeriodId) return deepClone(rows);
    if (!rows.length || rows[0].period_id === undefined) return deepClone(rows);
    return deepClone(rows.filter((row) => row.period_id === this.state.currentPeriodId));
  }

  listByPeriod(collection, periodId) {
    return deepClone((this.state[collection] || []).filter((row) => row.period_id === periodId));
  }

  find(collection, id) {
    const row = (this.state[collection] || []).find((item) => item.id === id);
    return row ? deepClone(row) : null;
  }

  add(collection, item, { skipPeriod = false } = {}) {
    if (['closed', 'archive'].includes(this.state.currentPeriod?.status)
      && !this.state.currentPeriod?.unlock_edit
      && !skipPeriod
      && collection !== 'financialPeriods'
      && collection !== 'periodReports') {
      throw new Error('Период закрыт. Разблокируйте редактирование.');
    }

    const now = new Date().toISOString();
    let record = {
      id: item.id || generateId(),
      created_at: item.created_at || now,
      updated_at: now,
      ...item
    };

    const periodScoped = ![
      'financialPeriods', 'periodReports', 'settings'
    ].includes(collection);

    if (periodScoped && !skipPeriod && !record.period_id) {
      const meta = this.getPeriodMeta();
      record = { ...record, ...meta };
    }

    if (!Array.isArray(this.state[collection])) this.state[collection] = [];
    this.state[collection].push(record);
    this.save();
    return deepClone(record);
  }

  update(collection, id, patch) {
    const list = this.state[collection] || [];
    const index = list.findIndex((item) => item.id === id);
    if (index === -1) return null;

    const current = list[index];
    if (current.period_id) {
      const period = this.state.financialPeriods.find((p) => p.id === current.period_id);
      if (period && ['closed', 'archive'].includes(period.status) && !period.unlock_edit
        && collection !== 'financialPeriods') {
        throw new Error('Период закрыт. Разблокируйте редактирование.');
      }
    }

    list[index] = {
      ...current,
      ...patch,
      id,
      updated_at: new Date().toISOString()
    };
    this.state[collection] = list;

    if (collection === 'financialPeriods' && id === this.state.currentPeriodId) {
      this.state.currentPeriod = list[index];
    }

    this.save();
    return deepClone(list[index]);
  }

  remove(collection, id) {
    const before = (this.state[collection] || []).length;
    this.state[collection] = (this.state[collection] || []).filter((item) => item.id !== id);
    const removed = this.state[collection].length < before;
    if (removed) this.save();
    return removed;
  }

  batch(mutator) {
    const api = {
      add: (collection, item, options) => {
        const now = new Date().toISOString();
        let record = { id: item.id || generateId(), created_at: now, updated_at: now, ...item };
        const periodScoped = !['financialPeriods', 'periodReports', 'settings'].includes(collection);
        if (periodScoped && !options?.skipPeriod && !record.period_id) {
          record = { ...record, ...this.getPeriodMeta() };
        }
        if (!Array.isArray(this.state[collection])) this.state[collection] = [];
        this.state[collection].push(record);
        return deepClone(record);
      },
      update: (collection, id, patch) => {
        const list = this.state[collection] || [];
        const index = list.findIndex((item) => item.id === id);
        if (index === -1) return null;
        list[index] = { ...list[index], ...patch, id, updated_at: new Date().toISOString() };
        if (collection === 'financialPeriods' && id === this.state.currentPeriodId) {
          this.state.currentPeriod = list[index];
        }
        return deepClone(list[index]);
      },
      remove: (collection, id) => {
        this.state[collection] = (this.state[collection] || []).filter((item) => item.id !== id);
        return true;
      },
      find: (collection, id) => this.find(collection, id),
      list: (collection) => this.list(collection),
      listByPeriod: (collection, periodId) => this.listByPeriod(collection, periodId),
      getPeriodMeta: () => this.getPeriodMeta()
    };
    mutator(api);
    this.save();
  }

  exportJSON() {
    return JSON.stringify(this.getState(), null, 2);
  }

  importJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { success: false, message: 'Некорректный формат файла' };
      }
      const defaults = createDefaultState();
      this.state = {
        ...defaults,
        ...data,
        settings: { ...defaults.settings, ...(data.settings || {}) }
      };
      if (!this.state.currentPeriodId && this.state.financialPeriods?.length) {
        this.state.currentPeriodId = this.state.financialPeriods[0].id;
      }
      this.state.currentPeriod = this.state.financialPeriods
        .find((p) => p.id === this.state.currentPeriodId) || this.state.financialPeriods[0];
      this.save();
      return { success: true, message: 'Данные успешно импортированы' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  clearAll() {
    this.state = createDefaultState();
    this.save();
    return { success: true, message: 'Все данные очищены' };
  }

  createDefaultCategories = defaultCategories;
}

export const storage = new Storage();
export default storage;
