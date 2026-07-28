/**
 * notifications.js — уведомления
 */
import { storage } from './storage.js';
import { generateId, sortByDate } from './utils.js';

export class NotificationService {
  getAll() {
    return sortByDate(storage.list('notifications'), (n) => n.created_at, true);
  }

  getUnread() {
    return this.getAll().filter((n) => !n.is_read);
  }

  getUnreadCount() {
    return this.getUnread().length;
  }

  add({ title, text, type = 'info' }) {
    const row = storage.add('notifications', {
      id: generateId(),
      title: String(title || '').trim(),
      text: String(text || '').trim(),
      type,
      is_read: false,
      created_at: new Date().toISOString()
    });
    return { success: true, data: row };
  }

  markRead(id) {
    storage.update('notifications', id, { is_read: true });
    return { success: true };
  }

  markAllRead() {
    storage.batch((db) => {
      this.getUnread().forEach((n) => db.update('notifications', n.id, { is_read: true }));
    });
    return { success: true };
  }

  remove(id) {
    storage.remove('notifications', id);
    return { success: true };
  }

  clear() {
    storage.batch((db) => {
      this.getAll().forEach((n) => db.remove('notifications', n.id));
    });
    return { success: true };
  }
}

export const notificationService = new NotificationService();
export default notificationService;
