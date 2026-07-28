/**
 * services/SyncService.js
 * Онлайн/офлайн синхронизация и слушатели сети.
 */

import { isOnline } from '../helpers/utils.js';
import { databaseService } from './DatabaseService.js';

/**
 * Сервис синхронизации.
 */
export class SyncService {
  constructor() {
    this.bound = false;
    this.syncing = false;
  }

  /**
   * Включает слушатели online/offline.
   */
  start() {
    if (this.bound) return;
    this.bound = true;
    window.addEventListener('online', () => this.syncNow());
    window.addEventListener('offline', () => databaseService.notify());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && isOnline()) {
        this.syncNow();
      }
    });
  }

  /**
   * Принудительная синхронизация.
   */
  async syncNow() {
    if (this.syncing || !isOnline() || !databaseService.userId) return;
    this.syncing = true;
    try {
      await databaseService.flushQueue();
      await databaseService.pullAll();
    } catch (error) {
      console.error('Sync failed', error);
    } finally {
      this.syncing = false;
      databaseService.notify();
    }
  }

  /**
   * Статус синхронизации.
   * @returns {{ online: boolean, pending: number, syncing: boolean }}
   */
  getStatus() {
    const snapshot = databaseService.getSnapshot();
    return {
      online: snapshot.online,
      pending: snapshot.pendingSync,
      syncing: this.syncing
    };
  }
}

export const syncService = new SyncService();
export default syncService;
