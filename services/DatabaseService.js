/**
 * services/DatabaseService.js
 * Offline-first доступ к данным с привязкой к финансовому периоду.
 */

import { TABLES, PERIOD_SCOPED_TABLES } from '../config.js';
import { generateId, isOnline, deepClone } from '../helpers/utils.js';
import { LocalCache } from '../storage/LocalCache.js';
import { OfflineQueue } from '../storage/OfflineQueue.js';
import { authService } from './AuthService.js';

export class DatabaseService {
  constructor() {
    this.userId = null;
    this.cache = null;
    this.queue = null;
    this.listeners = new Set();
    this.realtimeChannels = [];
    /** @type {string|null} */
    this.currentPeriodId = null;
  }

  async init(userId) {
    this.userId = userId;
    this.cache = new LocalCache(userId);
    this.queue = new OfflineQueue(userId);
    this.currentPeriodId = this.cache.getCurrentPeriodId();

    if (isOnline() && authService.isConfigured()) {
      await this.pullAll();
      await this.flushQueue();
      this.subscribeRealtime();
    }

    if (!this.currentPeriodId) {
      const periods = this.listAll(TABLES.financialPeriods);
      const current = periods.find((p) => p.status === 'current') || periods[0];
      if (current) this.setCurrentPeriod(current.id);
    }

    this.notify();
  }

  async destroy() {
    this.unsubscribeRealtime();
    this.userId = null;
    this.cache = null;
    this.queue = null;
    this.currentPeriodId = null;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((fn) => {
      try { fn(snapshot); } catch (e) { console.error(e); }
    });
  }

  setCurrentPeriod(periodId) {
    this.currentPeriodId = periodId;
    this.cache?.setCurrentPeriodId(periodId);
    this.notify();
  }

  getCurrentPeriodId() {
    return this.currentPeriodId;
  }

  getCurrentPeriod() {
    if (!this.currentPeriodId) return null;
    return this.find(TABLES.financialPeriods, this.currentPeriodId);
  }

  /**
   * Метаданные периода для новых записей.
   * @returns {{ period_id: string, year: number, month: number }}
   */
  getPeriodMeta() {
    const period = this.getCurrentPeriod();
    if (!period) {
      throw new Error('Не выбран финансовый период');
    }
    return {
      period_id: period.id,
      year: Number(period.year),
      month: Number(period.month)
    };
  }

  /**
   * Можно ли редактировать текущий период.
   * @returns {boolean}
   */
  canEditCurrentPeriod() {
    const period = this.getCurrentPeriod();
    if (!period) return false;
    if (period.status === 'current' || period.status === 'future') return true;
    return Boolean(period.unlock_edit);
  }

  getSnapshot() {
    if (!this.cache) {
      return {
        profile: null,
        settings: null,
        financial_periods: [],
        period_reports: [],
        currentPeriodId: null,
        currentPeriod: null,
        income: [],
        budget_categories: [],
        budget_transactions: [],
        expenses: [],
        credits: [],
        credit_payments: [],
        utilities: [],
        goals: [],
        history: [],
        notifications: [],
        regular_payments: [],
        period_plans: [],
        online: isOnline(),
        pendingSync: 0,
        canEdit: false
      };
    }

    const raw = this.cache.getSnapshot();
    const periodId = this.currentPeriodId;
    const filterPeriod = (rows) => (rows || []).filter((r) => !periodId || r.period_id === periodId);

    return {
      profile: raw.profile,
      settings: raw.settings,
      financial_periods: raw[TABLES.financialPeriods] || [],
      period_reports: raw[TABLES.periodReports] || [],
      currentPeriodId: periodId,
      currentPeriod: this.getCurrentPeriod(),
      income: filterPeriod(raw[TABLES.income]),
      budget_categories: filterPeriod(raw[TABLES.budgetCategories]),
      budget_transactions: filterPeriod(raw[TABLES.budgetTransactions]),
      expenses: filterPeriod(raw[TABLES.expenses]),
      credits: filterPeriod(raw[TABLES.credits]),
      credit_payments: filterPeriod(raw[TABLES.creditPayments]),
      utilities: filterPeriod(raw[TABLES.utilities]),
      goals: filterPeriod(raw[TABLES.goals]),
      history: filterPeriod(raw[TABLES.history]),
      notifications: filterPeriod(raw[TABLES.notifications]),
      regular_payments: filterPeriod(raw[TABLES.regularPayments]),
      period_plans: filterPeriod(raw[TABLES.periodPlans]),
      online: isOnline(),
      pendingSync: this.queue?.list().length || 0,
      canEdit: this.canEditCurrentPeriod()
    };
  }

  _client() {
    return authService.getClient();
  }

  async pullAll() {
    if (!this.userId || !authService.isConfigured()) return;
    const client = this._client();

    const globalTables = [TABLES.financialPeriods, TABLES.periodReports];
    const scoped = PERIOD_SCOPED_TABLES;

    const [profileRes, settingsRes, ...rest] = await Promise.all([
      client.from(TABLES.profiles).select('*').eq('user_id', this.userId).maybeSingle(),
      client.from(TABLES.settings).select('*').eq('user_id', this.userId).maybeSingle(),
      ...globalTables.map((table) => client.from(table).select('*').eq('user_id', this.userId)),
      ...scoped.map((table) => client.from(table).select('*').eq('user_id', this.userId))
    ]);

    if (profileRes.data) this.cache.setProfile(profileRes.data);
    if (settingsRes.data) this.cache.setSettings(settingsRes.data);

    globalTables.forEach((table, index) => {
      const res = rest[index];
      if (!res.error && Array.isArray(res.data)) this.cache.setTable(table, res.data);
    });

    scoped.forEach((table, index) => {
      const res = rest[globalTables.length + index];
      if (!res.error && Array.isArray(res.data)) this.cache.setTable(table, res.data);
    });

    if (!this.currentPeriodId || !this.find(TABLES.financialPeriods, this.currentPeriodId)) {
      const periods = this.listAll(TABLES.financialPeriods);
      const current = periods.find((p) => p.status === 'current')
        || [...periods].sort((a, b) => (b.year - a.year) || (b.month - a.month))[0];
      if (current) {
        this.currentPeriodId = current.id;
        this.cache.setCurrentPeriodId(current.id);
      }
    }

    this.notify();
  }

  /**
   * Список с фильтром по текущему периоду (для period-scoped).
   */
  list(table) {
    const rows = this.cache ? this.cache.getTable(table) : [];
    if (!PERIOD_SCOPED_TABLES.includes(table)) return rows;
    if (!this.currentPeriodId) return rows;
    return rows.filter((row) => row.period_id === this.currentPeriodId);
  }

  /**
   * Все строки таблицы без фильтра периода.
   */
  listAll(table) {
    return this.cache ? this.cache.getTable(table) : [];
  }

  /**
   * Список за конкретный период.
   */
  listByPeriod(table, periodId) {
    return this.listAll(table).filter((row) => row.period_id === periodId);
  }

  find(table, id) {
    return this.cache ? this.cache.find(table, id) : null;
  }

  async insert(table, data, options = {}) {
    this._ensureReady();
    const now = new Date().toISOString();
    let row = {
      id: data.id || generateId(),
      user_id: this.userId,
      created_at: data.created_at || now,
      updated_at: now,
      ...data
    };

    if (PERIOD_SCOPED_TABLES.includes(table) && !options.skipPeriod) {
      if (!this.canEditCurrentPeriod() && !options.force) {
        throw new Error('Период закрыт. Разблокируйте редактирование для изменений.');
      }
      const meta = options.periodMeta || this.getPeriodMeta();
      row = {
        ...row,
        period_id: row.period_id || meta.period_id,
        year: row.year || meta.year,
        month: row.month || meta.month
      };
      if (!row.period_id) throw new Error('Запись без period_id запрещена');
    }

    this.cache.upsert(table, row);

    if (isOnline() && authService.isConfigured()) {
      const { error } = await this._client().from(table).insert(row);
      if (error) {
        this.queue.enqueue('insert', table, row);
        console.warn('insert queued', error.message);
      }
    } else {
      this.queue.enqueue('insert', table, row);
    }

    this.notify();
    return deepClone(row);
  }

  async update(table, id, patch, options = {}) {
    this._ensureReady();
    const current = this.cache.find(table, id);
    if (!current) throw new Error('Запись не найдена');

    if (PERIOD_SCOPED_TABLES.includes(table) && !options.force) {
      const period = this.find(TABLES.financialPeriods, current.period_id);
      if (period && (period.status === 'closed' || period.status === 'archive') && !period.unlock_edit) {
        throw new Error('Период закрыт. Подтвердите разблокировку редактирования.');
      }
    }

    const row = {
      ...current,
      ...patch,
      id,
      user_id: this.userId,
      updated_at: new Date().toISOString()
    };
    this.cache.upsert(table, row);

    if (isOnline() && authService.isConfigured()) {
      const { error } = await this._client()
        .from(table)
        .update({ ...patch, updated_at: row.updated_at })
        .eq('id', id)
        .eq('user_id', this.userId);
      if (error) {
        this.queue.enqueue('update', table, { id, patch: { ...patch, updated_at: row.updated_at } });
      }
    } else {
      this.queue.enqueue('update', table, { id, patch: { ...patch, updated_at: row.updated_at } });
    }

    this.notify();
    return deepClone(row);
  }

  async remove(table, id, options = {}) {
    this._ensureReady();
    const current = this.cache.find(table, id);

    if (current && PERIOD_SCOPED_TABLES.includes(table) && !options.force) {
      const period = this.find(TABLES.financialPeriods, current.period_id);
      if (period && (period.status === 'closed' || period.status === 'archive') && !period.unlock_edit) {
        throw new Error('Период закрыт. Подтвердите разблокировку редактирования.');
      }
    }

    this.cache.remove(table, id);

    if (isOnline() && authService.isConfigured()) {
      const { error } = await this._client().from(table).delete().eq('id', id).eq('user_id', this.userId);
      if (error) this.queue.enqueue('delete', table, { id });
    } else {
      this.queue.enqueue('delete', table, { id });
    }

    this.notify();
    return true;
  }

  async batch(mutator) {
    const silent = {
      insert: async (table, data, options = {}) => this._silentInsert(table, data, options),
      update: async (table, id, patch, options = {}) => {
        const current = this.cache.find(table, id);
        const row = { ...current, ...patch, id, updated_at: new Date().toISOString() };
        this.cache.upsert(table, row);
        if (isOnline() && authService.isConfigured()) {
          const { error } = await this._client().from(table).update({ ...patch, updated_at: row.updated_at }).eq('id', id).eq('user_id', this.userId);
          if (error) this.queue.enqueue('update', table, { id, patch });
        } else {
          this.queue.enqueue('update', table, { id, patch });
        }
        return row;
      },
      remove: async (table, id) => {
        this.cache.remove(table, id);
        if (isOnline() && authService.isConfigured()) {
          const { error } = await this._client().from(table).delete().eq('id', id).eq('user_id', this.userId);
          if (error) this.queue.enqueue('delete', table, { id });
        } else {
          this.queue.enqueue('delete', table, { id });
        }
        return true;
      },
      find: (table, id) => this.find(table, id),
      list: (table) => this.list(table),
      listByPeriod: (table, periodId) => this.listByPeriod(table, periodId)
    };

    await mutator(silent);
    this.notify();
  }

  async _silentInsert(table, data, options = {}) {
    const now = new Date().toISOString();
    let row = {
      id: data.id || generateId(),
      user_id: this.userId,
      created_at: data.created_at || now,
      updated_at: now,
      ...data
    };
    if (PERIOD_SCOPED_TABLES.includes(table) && !options.skipPeriod) {
      const meta = options.periodMeta || this.getPeriodMeta();
      row = {
        ...row,
        period_id: row.period_id || meta.period_id,
        year: row.year || meta.year,
        month: row.month || meta.month
      };
    }
    this.cache.upsert(table, row);
    if (isOnline() && authService.isConfigured()) {
      const { error } = await this._client().from(table).insert(row);
      if (error) this.queue.enqueue('insert', table, row);
    } else {
      this.queue.enqueue('insert', table, row);
    }
    return row;
  }

  async upsertSingleton(table, data) {
    this._ensureReady();
    const row = { ...data, user_id: this.userId, updated_at: new Date().toISOString() };
    if (table === TABLES.profiles) this.cache.setProfile(row);
    if (table === TABLES.settings) this.cache.setSettings(row);

    if (isOnline() && authService.isConfigured()) {
      const { error } = await this._client().from(table).upsert(row, { onConflict: 'user_id' });
      if (error) this.queue.enqueue('update', table, { id: row.id, patch: row, singleton: true });
    } else {
      this.queue.enqueue('update', table, { id: row.id, patch: row, singleton: true });
    }
    this.notify();
    return deepClone(row);
  }

  async flushQueue() {
    if (!this.queue || !isOnline() || !authService.isConfigured()) return;
    const items = this.queue.list();
    for (const item of items) {
      try {
        if (item.action === 'insert') {
          const { error } = await this._client().from(item.table).upsert(item.payload);
          if (error) throw error;
        } else if (item.action === 'update') {
          if (item.payload.singleton) {
            const { error } = await this._client().from(item.table).upsert(item.payload.patch, { onConflict: 'user_id' });
            if (error) throw error;
          } else {
            const { error } = await this._client().from(item.table).update(item.payload.patch).eq('id', item.payload.id).eq('user_id', this.userId);
            if (error) throw error;
          }
        } else if (item.action === 'delete') {
          const { error } = await this._client().from(item.table).delete().eq('id', item.payload.id).eq('user_id', this.userId);
          if (error) throw error;
        }
        this.queue.remove(item.id);
      } catch (error) {
        console.warn('flush item failed', item, error);
        break;
      }
    }
  }

  subscribeRealtime() {
    this.unsubscribeRealtime();
    if (!authService.isConfigured() || !this.userId) return;
    const client = this._client();
    const tables = [TABLES.financialPeriods, TABLES.periodReports, ...PERIOD_SCOPED_TABLES];

    tables.forEach((table) => {
      const channel = client
        .channel(`rt_${table}_${this.userId}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table, filter: `user_id=eq.${this.userId}`
        }, (payload) => this._onRealtime(table, payload))
        .subscribe();
      this.realtimeChannels.push(channel);
    });
  }

  _onRealtime(table, payload) {
    if (!this.cache) return;
    if (payload.eventType === 'DELETE') this.cache.remove(table, payload.old?.id);
    else if (payload.new) this.cache.upsert(table, payload.new);
    this.notify();
  }

  unsubscribeRealtime() {
    if (!authService.isConfigured()) {
      this.realtimeChannels = [];
      return;
    }
    const client = this._client();
    this.realtimeChannels.forEach((ch) => {
      try { client.removeChannel(ch); } catch (e) { /* ignore */ }
    });
    this.realtimeChannels = [];
  }

  async importSnapshot(data) {
    this._ensureReady();
    // Импорт только в текущий период
    const map = {
      income: TABLES.income,
      budget_categories: TABLES.budgetCategories,
      budget_transactions: TABLES.budgetTransactions,
      expenses: TABLES.expenses,
      credits: TABLES.credits,
      credit_payments: TABLES.creditPayments,
      utilities: TABLES.utilities,
      goals: TABLES.goals,
      history: TABLES.history,
      notifications: TABLES.notifications,
      regular_payments: TABLES.regularPayments
    };

    for (const [key, table] of Object.entries(map)) {
      if (!Array.isArray(data[key])) continue;
      const existing = this.list(table);
      for (const row of existing) await this.remove(table, row.id, { force: true });
      for (const row of data[key]) {
        await this.insert(table, { ...row, id: generateId() }, { force: true });
      }
    }
  }

  _ensureReady() {
    if (!this.userId || !this.cache) throw new Error('DatabaseService не инициализирован');
  }
}

export const databaseService = new DatabaseService();
export default databaseService;
