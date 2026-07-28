/**
 * services/UtilityService.js
 */
import { TABLES } from '../config.js';
import { databaseService } from './DatabaseService.js';
import { budgetService } from './BudgetService.js';
import {
  generateId, getMonthName, parseAmount, roundMoney, sortByDate, sumBy,
  todayISO, validateRequired
} from '../helpers/utils.js';

export const UTILITY_SERVICES = [
  { name: 'ПЕРМЭНЕРГОСБЫТ', icon: '⚡', color: '#F5A524' },
  { name: 'СОДЕРЖАНИЕ ЖИЛОГО ПОМЕЩЕНИЯ', icon: '🏢', color: '#5B8DEF' },
  { name: 'ЖКХ', icon: '🚿', color: '#00B7C3' },
  { name: 'ГАЗ', icon: '🔥', color: '#FF6B6B' },
  { name: 'КАПИТАЛЬНЫЙ РЕМОНТ', icon: '🛠', color: '#9353D3' },
  { name: 'ТКО', icon: '♻', color: '#36C6A0' }
];

export class UtilityService {
  getAll() {
    return sortByDate(databaseService.list(TABLES.utilities), (u) => u.due_date || u.created_at, true);
  }

  getById(id) {
    return databaseService.find(TABLES.utilities, id);
  }

  getCurrentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Ключ месяца YYYY-MM из записи (совместимость со старым полем month).
   * @param {object} item
   * @returns {string}
   */
  getItemMonthKey(item) {
    if (item?.month_key) return String(item.month_key);
    if (typeof item?.month === 'string' && item.month.includes('-')) return item.month;
    if (item?.year && item?.month) {
      return `${item.year}-${String(item.month).padStart(2, '0')}`;
    }
    return this.getCurrentMonthKey();
  }

  getByMonthKey(monthKey) {
    return this.getAll().filter((item) => this.getItemMonthKey(item) === monthKey).map((item) => {
      const meta = UTILITY_SERVICES.find((s) => s.name === item.service);
      return {
        ...item,
        month: this.getItemMonthKey(item),
        month_key: this.getItemMonthKey(item),
        typeName: item.service,
        typeIcon: meta?.icon || '🏠',
        typeColor: meta?.color || '#5B8DEF'
      };
    });
  }

  async ensureMonthRecords(monthKey = this.getCurrentMonthKey()) {
    const existing = this.getByMonthKey(monthKey);
    const existingNames = new Set(existing.map((i) => i.service));
    const [year, month] = monthKey.split('-').map(Number);
    const dueDate = `${monthKey}-10`;
    let created = 0;

    await databaseService.batch(async (db) => {
      for (const service of UTILITY_SERVICES) {
        if (existingNames.has(service.name)) continue;
        await db.insert(TABLES.utilities, {
          id: generateId(),
          service: service.name,
          amount: 0,
          month_key: monthKey,
          status: 'pending',
          receipt: '',
          due_date: dueDate,
          comment: ''
        });
        created += 1;
      }
    });

    return {
      success: true,
      created,
      message: created
        ? `Создано записей: ${created} на ${getMonthName(month - 1)} ${year}`
        : 'Записи на этот месяц уже существуют'
    };
  }

  async update(id, data) {
    const existing = this.getById(id);
    if (!existing) return { success: false, message: 'Запись не найдена' };
    const patch = {};
    if (data.amount !== undefined) patch.amount = roundMoney(parseAmount(data.amount));
    if (data.due_date !== undefined) patch.due_date = data.due_date;
    if (data.comment !== undefined) patch.comment = String(data.comment).trim();
    if (data.receipt !== undefined) patch.receipt = String(data.receipt).trim();
    const updated = await databaseService.update(TABLES.utilities, id, patch);
    return { success: true, data: updated };
  }

  async markPaid(id, data = {}) {
    const item = this.getById(id);
    if (!item) return { success: false, message: 'Запись не найдена' };
    if (item.status === 'paid') return { success: false, message: 'Уже оплачено' };

    const amount = roundMoney(parseAmount(data.amount ?? item.amount));
    if (!(amount > 0)) return { success: false, message: 'Укажите сумму' };
    const envelopeId = data.envelopeId || data.budget_category || null;
    if (envelopeId && amount > budgetService.getCategoryBalance(envelopeId).balance) {
      return { success: false, message: 'Недостаточно средств в конверте' };
    }

    const paidAt = data.paid_at || data.paidAt || todayISO();
    await databaseService.batch(async (db) => {
      if (envelopeId) {
        await db.insert(TABLES.budgetTransactions, {
          id: generateId(), category_id: envelopeId, amount: -amount,
          type: 'utility_payment', date: paidAt, comment: `Оплата: ${item.service}`
        });
      }
      await db.update(TABLES.utilities, id, {
        amount, status: 'paid', paid_at: paidAt, budget_category: envelopeId,
        receipt: data.receipt !== undefined ? String(data.receipt).trim() : item.receipt,
        comment: data.comment !== undefined ? String(data.comment).trim() : item.comment
      });
      await db.insert(TABLES.history, {
        id: generateId(), type: 'utility', title: `Оплачено: ${item.service}`,
        amount, icon: '🏠', date: new Date().toISOString()
      });
    });

    return { success: true, data: this.getById(id) };
  }

  async remove(id) {
    if (!this.getById(id)) return { success: false, message: 'Запись не найдена' };
    await databaseService.remove(TABLES.utilities, id);
    return { success: true };
  }

  getStats(year = new Date().getFullYear()) {
    const all = this.getAll().filter((i) => Number(i.amount) > 0);
    const yearItems = all.filter((i) => this.getItemMonthKey(i).startsWith(String(year)));
    const monthKey = this.getCurrentMonthKey();
    const monthItems = all.filter((i) => this.getItemMonthKey(i) === monthKey);
    const paidYear = yearItems.filter((i) => i.status === 'paid');
    const paidMonth = monthItems.filter((i) => i.status === 'paid');
    const yearAmounts = paidYear.map((i) => Number(i.amount));
    const yearTotal = sumBy(paidYear, (i) => Number(i.amount) || 0);

    const byType = UTILITY_SERVICES.map((service) => {
      const paid = paidYear.filter((i) => i.service === service.name);
      const amounts = paid.map((i) => Number(i.amount));
      const total = sumBy(paid, (i) => Number(i.amount) || 0);
      return {
        ...service,
        count: amounts.length,
        total,
        average: amounts.length ? roundMoney(total / amounts.length) : 0,
        max: amounts.length ? Math.max(...amounts) : 0,
        min: amounts.length ? Math.min(...amounts) : 0
      };
    });

    return {
      year, monthKey, yearTotal,
      yearAverage: yearAmounts.length ? roundMoney(yearTotal / yearAmounts.length) : 0,
      yearMax: yearAmounts.length ? Math.max(...yearAmounts) : 0,
      yearMin: yearAmounts.length ? Math.min(...yearAmounts) : 0,
      monthTotal: sumBy(paidMonth, (i) => Number(i.amount) || 0),
      monthPending: sumBy(monthItems.filter((i) => i.status === 'pending'), (i) => Number(i.amount) || 0),
      byType,
      pendingCount: this.getAll().filter((i) => i.status === 'pending').length
    };
  }

  getUpcoming(limit = 5) {
    return this.getByMonthKey(this.getCurrentMonthKey())
      .concat(this.getAll().filter((i) => i.status === 'pending'))
      .filter((item, idx, arr) => arr.findIndex((x) => x.id === item.id) === idx)
      .filter((item) => item.status === 'pending' && Number(item.amount) > 0)
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
      .slice(0, limit)
      .map((item) => ({
        id: item.id, type: 'utility', title: item.service || item.typeName,
        subtitle: this.getItemMonthKey(item), amount: Number(item.amount) || 0,
        date: item.due_date, icon: item.typeIcon || '🏠'
      }));
  }

  getSummary() {
    return { ...this.getStats(), upcoming: this.getUpcoming() };
  }
}

export const utilityService = new UtilityService();
export default utilityService;
