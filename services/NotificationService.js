/**
 * services/NotificationService.js
 */
import { TABLES } from '../config.js';
import { databaseService } from './DatabaseService.js';
import { creditService } from './CreditService.js';
import { utilityService } from './UtilityService.js';
import { goalsService } from './GoalsService.js';
import { budgetService } from './BudgetService.js';
import { generateId, sortByDate, todayISO } from '../helpers/utils.js';

export class NotificationService {
  getAll() {
    return sortByDate(databaseService.list(TABLES.notifications), (n) => n.created_at, true);
  }

  getUnread() {
    return this.getAll().filter((n) => !n.is_read);
  }

  getUnreadCount() {
    return this.getUnread().length;
  }

  async create({ title, text = '', type = 'info', link = null }) {
    return databaseService.insert(TABLES.notifications, {
      id: generateId(),
      title,
      text,
      type,
      link,
      is_read: false
    });
  }

  async markRead(id) {
    return databaseService.update(TABLES.notifications, id, { is_read: true });
  }

  async markAllRead() {
    await databaseService.batch(async (db) => {
      for (const n of this.getUnread()) {
        await db.update(TABLES.notifications, n.id, { is_read: true });
      }
    });
  }

  async remove(id) {
    return databaseService.remove(TABLES.notifications, id);
  }

  /**
   * Генерирует уведомления по текущим данным (без дублей за день).
   */
  async refreshFromData() {
    const today = todayISO();
    const existing = this.getAll()
      .filter((n) => String(n.created_at).slice(0, 10) === today)
      .map((n) => n.text);
    const keys = new Set(existing);
    const pending = [];

    creditService.getUpcomingPayments(10).forEach((item) => {
      if (!item.date) return;
      const diff = Math.ceil((new Date(item.date) - new Date(today)) / 86400000);
      if (diff >= 0 && diff <= 3) {
        const text = `Платёж по кредиту «${item.title}» ${diff === 0 ? 'сегодня' : `через ${diff} дн.`}`;
        if (!keys.has(text)) {
          pending.push({ title: 'Сегодня платеж по кредиту', text, type: 'warning', link: 'credits' });
          keys.add(text);
        }
      }
    });

    utilityService.getUpcoming(10).forEach((item) => {
      if (!item.date) return;
      const diff = Math.ceil((new Date(item.date) - new Date(today)) / 86400000);
      if (diff >= 0 && diff <= 3) {
        const text = `Через ${diff} дн. ЖКХ: ${item.title}`;
        if (!keys.has(text)) {
          pending.push({ title: 'Коммунальный платёж', text, type: 'warning', link: 'utilities' });
          keys.add(text);
        }
      }
    });

    goalsService.getAllEnriched().forEach((goal) => {
      if (goal.isCompleted || goal.status === 'completed') {
        const text = `Цель накоплена: ${goal.title}`;
        if (!keys.has(text)) {
          pending.push({ title: 'Цель накоплена', text, type: 'success', link: 'goals' });
          keys.add(text);
        }
      }
    });

    budgetService.getEnvelopes().forEach((env) => {
      if (env.received > 0 && env.balance <= env.received * 0.1 && env.balance >= 0) {
        const text = `Заканчиваются деньги в категории «${env.name}»`;
        if (!keys.has(text)) {
          pending.push({ title: 'Низкий баланс конверта', text, type: 'warning', link: 'budget' });
          keys.add(text);
        }
      }
    });

    for (const item of pending) {
      await this.create(item);
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;
