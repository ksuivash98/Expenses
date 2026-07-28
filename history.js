/**
 * history.js — история операций
 */
import { storage } from './storage.js';
import { formatDateTime, sortByDate } from './utils.js';

export class HistoryService {
  getAll() {
    return sortByDate(storage.list('history'), (h) => h.date, true);
  }

  getRecent(limit = 10) {
    return this.getAll().slice(0, limit);
  }

  getByType(type) {
    return this.getAll().filter((h) => h.type === type);
  }

  formatItem(item) {
    return {
      ...item,
      dateLabel: formatDateTime(item.date)
    };
  }

  clear() {
    storage.batch((db) => {
      storage.list('history').forEach((item) => db.remove('history', item.id));
    });
    return { success: true };
  }
}

export const historyService = new HistoryService();
export default historyService;
