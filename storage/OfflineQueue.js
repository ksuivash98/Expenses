/**
 * storage/OfflineQueue.js
 * Очередь операций для синхронизации при появлении сети.
 */

import { deepClone, generateId } from '../helpers/utils.js';

/**
 * Очередь офлайн-мутаций.
 */
export class OfflineQueue {
  /**
   * @param {string} userId
   */
  constructor(userId) {
    this.userId = userId;
    this.key = `finance_sync_queue_${userId}`;
    this.items = [];
    this.load();
  }

  /**
   * Загружает очередь.
   */
  load() {
    try {
      const raw = localStorage.getItem(this.key);
      this.items = raw ? JSON.parse(raw) : [];
    } catch (error) {
      this.items = [];
    }
  }

  /**
   * Сохраняет очередь.
   */
  save() {
    localStorage.setItem(this.key, JSON.stringify(this.items));
  }

  /**
   * Добавляет операцию в очередь.
   * @param {'insert'|'update'|'delete'} action
   * @param {string} table
   * @param {object} payload
   * @returns {object}
   */
  enqueue(action, table, payload) {
    const item = {
      id: generateId(),
      action,
      table,
      payload: deepClone(payload),
      createdAt: new Date().toISOString()
    };
    this.items.push(item);
    this.save();
    return item;
  }

  /**
   * Возвращает копию очереди.
   * @returns {Array}
   */
  list() {
    return deepClone(this.items);
  }

  /**
   * Есть ли неотправленные операции.
   * @returns {boolean}
   */
  hasPending() {
    return this.items.length > 0;
  }

  /**
   * Удаляет операцию из очереди.
   * @param {string} id
   */
  remove(id) {
    this.items = this.items.filter((item) => item.id !== id);
    this.save();
  }

  /**
   * Очищает очередь.
   */
  clear() {
    this.items = [];
    this.save();
  }
}

export default OfflineQueue;
