/**
 * storage/LocalCache.js — кэш пользователя (v3, с периодами)
 */
import { CACHE_VERSION, TABLES, PERIOD_SCOPED_TABLES } from '../config.js';
import { deepClone } from '../helpers/utils.js';

export class LocalCache {
  constructor(userId) {
    this.userId = userId;
    this.key = `finance_cache_${userId}_v${CACHE_VERSION}`;
    this.state = this._empty();
    this.load();
  }

  _empty() {
    const state = {
      version: CACHE_VERSION,
      userId: this.userId,
      updatedAt: null,
      currentPeriodId: null,
      profile: null,
      settings: null,
      [TABLES.financialPeriods]: [],
      [TABLES.periodReports]: []
    };
    PERIOD_SCOPED_TABLES.forEach((table) => {
      state[table] = [];
    });
    return state;
  }

  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) {
        this.state = this._empty();
        return;
      }
      this.state = { ...this._empty(), ...JSON.parse(raw), userId: this.userId };
    } catch (error) {
      console.error('LocalCache load error', error);
      this.state = this._empty();
    }
  }

  save() {
    this.state.updatedAt = new Date().toISOString();
    localStorage.setItem(this.key, JSON.stringify(this.state));
  }

  getSnapshot() {
    return deepClone(this.state);
  }

  getCurrentPeriodId() {
    return this.state.currentPeriodId;
  }

  setCurrentPeriodId(periodId) {
    this.state.currentPeriodId = periodId;
    this.save();
  }

  setTable(table, rows) {
    this.state[table] = deepClone(rows || []);
    this.save();
  }

  getTable(table) {
    return deepClone(this.state[table] || []);
  }

  find(table, id) {
    const row = (this.state[table] || []).find((item) => item.id === id);
    return row ? deepClone(row) : null;
  }

  upsert(table, row) {
    const list = this.state[table] || [];
    const index = list.findIndex((item) => item.id === row.id);
    if (index === -1) list.push(deepClone(row));
    else list[index] = { ...list[index], ...deepClone(row) };
    this.state[table] = list;
    this.save();
  }

  remove(table, id) {
    this.state[table] = (this.state[table] || []).filter((item) => item.id !== id);
    this.save();
  }

  setProfile(profile) {
    this.state.profile = profile ? deepClone(profile) : null;
    this.save();
  }

  getProfile() {
    return this.state.profile ? deepClone(this.state.profile) : null;
  }

  setSettings(settings) {
    this.state.settings = settings ? deepClone(settings) : null;
    this.save();
  }

  getSettings() {
    return this.state.settings ? deepClone(this.state.settings) : null;
  }

  clear() {
    this.state = this._empty();
    localStorage.removeItem(this.key);
  }
}

export default LocalCache;
