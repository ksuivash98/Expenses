/**
 * services/HistoryService.js
 */
import { TABLES } from '../config.js';
import { databaseService } from './DatabaseService.js';
import { sortByDate } from '../helpers/utils.js';

export class HistoryService {
  getAll() {
    return sortByDate(databaseService.list(TABLES.history), (i) => i.date || i.created_at, true);
  }

  getRecent(limit = 20) {
    return this.getAll().slice(0, limit);
  }

  search(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return this.getAll();
    return this.getAll().filter((item) =>
      `${item.title || ''} ${item.description || ''}`.toLowerCase().includes(q)
    );
  }

  getByType(type) {
    return this.getAll().filter((item) => item.type === type);
  }
}

export const historyService = new HistoryService();
export default historyService;
