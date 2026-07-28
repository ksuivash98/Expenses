/**
 * history.js
 * Единая лента истории финансовых операций.
 * Записи создаются другими модулями через этот сервис.
 */

import { storage } from './storage.js';
import { sortByDate } from './utils.js';

/**
 * Сервис работы с историей операций.
 */
export class HistoryService {
  /**
   * @param {import('./storage.js').Storage} [store]
   */
  constructor(store = storage) {
    this.store = store;
  }

  /**
   * Возвращает всю историю, отсортированную по времени (новые сверху).
   * @returns {Array<object>}
   */
  getAll() {
    return sortByDate(this.store.getCollection('history'), (item) => item.timestamp, true);
  }

  /**
   * Возвращает ограниченный список последних записей.
   * @param {number} [limit=20]
   * @returns {Array<object>}
   */
  getRecent(limit = 20) {
    return this.getAll().slice(0, limit);
  }

  /**
   * Фильтрует историю по типу операции.
   * @param {string} type
   * @returns {Array<object>}
   */
  getByType(type) {
    return this.getAll().filter((item) => item.type === type);
  }

  /**
   * Фильтрует историю по диапазону дат.
   * @param {string} startISO
   * @param {string} endISO
   * @returns {Array<object>}
   */
  getByDateRange(startISO, endISO) {
    return this.getAll().filter((item) => {
      const day = String(item.timestamp || '').slice(0, 10);
      return day >= startISO && day <= endISO;
    });
  }

  /**
   * Ищет записи по тексту в заголовке или описании.
   * @param {string} query
   * @returns {Array<object>}
   */
  search(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return this.getAll();

    return this.getAll().filter((item) => {
      const haystack = `${item.title || ''} ${item.description || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }

  /**
   * Добавляет запись в историю.
   * @param {object} entry
   * @param {boolean} [autoSave=true]
   * @returns {object}
   */
  add(entry, autoSave = true) {
    return this.store.addHistory({
      type: entry.type,
      title: entry.title,
      description: entry.description || '',
      amount: entry.amount ?? null,
      meta: entry.meta || {},
      icon: entry.icon || this.getIconForType(entry.type)
    }, autoSave);
  }

  /**
   * Возвращает иконку по типу операции.
   * @param {string} type
   * @returns {string}
   */
  getIconForType(type) {
    const map = {
      income: '💰',
      distribution: '📦',
      transfer: '🔄',
      expense: '🛒',
      credit_add: '💳',
      credit_payment: '💳',
      credit_close: '✅',
      utility: '🏠',
      goal_create: '🎯',
      goal_fund: '🎯',
      goal_complete: '🏆',
      settings: '⚙',
      system: '📌'
    };
    return map[type] || '📌';
  }

  /**
   * Удаляет запись истории по ID.
   * @param {string} id
   * @returns {boolean}
   */
  remove(id) {
    return this.store.remove('history', id);
  }

  /**
   * Очищает всю историю.
   */
  clear() {
    this.store.setCollection('history', []);
  }
}

/** Единственный экземпляр сервиса истории. */
export const historyService = new HistoryService();

export default historyService;
