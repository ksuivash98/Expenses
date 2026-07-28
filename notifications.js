/**
 * notifications.js
 * Система уведомлений о платежах, целях и важных событиях.
 */

import { storage } from './storage.js';
import { sortByDate, todayISO, toISODate } from './utils.js';

/**
 * Сервис уведомлений.
 */
export class NotificationsService {
  /**
   * @param {import('./storage.js').Storage} [store]
   */
  constructor(store = storage) {
    this.store = store;
  }

  /**
   * Возвращает все уведомления (новые сверху).
   * @returns {Array<object>}
   */
  getAll() {
    return sortByDate(
      this.store.getCollection('notifications'),
      (item) => item.timestamp,
      true
    );
  }

  /**
   * Возвращает непрочитанные уведомления.
   * @returns {Array<object>}
   */
  getUnread() {
    return this.getAll().filter((item) => !item.read);
  }

  /**
   * Возвращает количество непрочитанных уведомлений.
   * @returns {number}
   */
  getUnreadCount() {
    return this.getUnread().length;
  }

  /**
   * Создаёт уведомление.
   * @param {object} payload
   * @param {boolean} [autoSave=true]
   * @returns {object}
   */
  create(payload, autoSave = true) {
    return this.store.addNotification({
      type: payload.type || 'info',
      title: payload.title,
      message: payload.message || '',
      link: payload.link || null
    }, autoSave);
  }

  /**
   * Отмечает уведомление как прочитанное.
   * @param {string} id
   * @returns {object|null}
   */
  markRead(id) {
    return this.store.update('notifications', id, { read: true });
  }

  /**
   * Отмечает все уведомления как прочитанные.
   */
  markAllRead() {
    this.store.batch((store) => {
      const items = store.getCollection('notifications');
      items.forEach((item) => {
        if (!item.read) {
          store.update('notifications', item.id, { read: true }, false);
        }
      });
    });
  }

  /**
   * Удаляет уведомление.
   * @param {string} id
   * @returns {boolean}
   */
  remove(id) {
    return this.store.remove('notifications', id);
  }

  /**
   * Очищает все уведомления.
   */
  clear() {
    this.store.setCollection('notifications', []);
  }

  /**
   * Проверяет ближайшие платежи и создаёт уведомления при необходимости.
   * Вызывается при старте приложения и при обновлении данных.
   * @param {object} context Контекст с данными из других модулей.
   * @param {Array<object>} context.credits
   * @param {Array<object>} context.utilities
   * @param {Array<object>} context.goals
   */
  refreshFromData(context = {}) {
    const today = todayISO();
    const existing = this.getAll();
    const recentKeys = new Set(
      existing
        .filter((n) => String(n.timestamp).slice(0, 10) === today)
        .map((n) => n.message)
    );

    const credits = context.credits || this.store.getCollection('credits');
    const utilities = context.utilities || this.store.getCollection('utilities');
    const goals = context.goals || this.store.getCollection('goals');

    /** @type {Array<object>} */
    const pending = [];

    credits
      .filter((credit) => credit.status === 'active')
      .forEach((credit) => {
        const paymentDay = Number(credit.paymentDay || 1);
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const daysInCurrent = new Date(year, month + 1, 0).getDate();
        const day = Math.min(paymentDay, daysInCurrent);
        const dueDate = toISODate(new Date(year, month, day));

        if (dueDate >= today) {
          const diff = Math.ceil(
            (new Date(dueDate).getTime() - new Date(today).getTime()) / 86400000
          );

          if (diff <= 3) {
            const message = `Платёж по кредиту «${credit.name}» ${diff === 0 ? 'сегодня' : `через ${diff} дн.`}`;
            if (!recentKeys.has(message)) {
              pending.push({
                type: 'warning',
                title: 'Ближайший платёж по кредиту',
                message,
                link: 'credits'
              });
              recentKeys.add(message);
            }
          }
        }
      });

    utilities
      .filter((item) => item.status === 'pending')
      .forEach((item) => {
        if (item.dueDate && item.dueDate <= today) {
          const message = `Не оплачено: ${item.name || item.typeName}`;
          if (!recentKeys.has(message)) {
            pending.push({
              type: 'warning',
              title: 'Коммунальный платёж',
              message,
              link: 'utilities'
            });
            recentKeys.add(message);
          }
        }
      });

    goals
      .filter((goal) => goal.status === 'active')
      .forEach((goal) => {
        const saved = Number(goal.savedAmount || 0);
        const target = Number(goal.targetAmount || 0);
        if (target > 0 && saved >= target) {
          const message = `Цель «${goal.name}» достигнута!`;
          if (!recentKeys.has(message)) {
            pending.push({
              type: 'success',
              title: 'Финансовая цель',
              message,
              link: 'goals'
            });
            recentKeys.add(message);
          }
        }
      });

    if (!pending.length) return;

    this.store.batch((store) => {
      pending.forEach((entry) => {
        store.addNotification(entry, false);
      });
    });
  }
}

/** Единственный экземпляр сервиса уведомлений. */
export const notificationsService = new NotificationsService();

export default notificationsService;
