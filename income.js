/**
 * income.js — доходы
 */
import { storage } from './storage.js';
import {
  generateId, parseAmount, roundMoney, sortByDate, sumBy,
  todayISO, validateRequired
} from './utils.js';

export class IncomeService {
  getAll() {
    return sortByDate(storage.list('income'), (i) => i.date, true);
  }

  getById(id) {
    return storage.find('income', id);
  }

  getTotalIncome() {
    return sumBy(this.getAll(), (i) => Number(i.amount) || 0);
  }

  getTotalDistributed() {
    return sumBy(
      storage.list('budgetTransactions').filter((tx) => tx.type === 'distribution' && Number(tx.amount) > 0),
      (tx) => Number(tx.amount) || 0
    );
  }

  getDistributedForIncome(incomeId) {
    return sumBy(
      storage.list('budgetTransactions')
        .filter((tx) => tx.type === 'distribution' && tx.income_id === incomeId && Number(tx.amount) > 0),
      (tx) => Number(tx.amount) || 0
    );
  }

  getFreeMoney() {
    return roundMoney(this.getTotalIncome() - this.getTotalDistributed());
  }

  getRemainingForIncome(incomeId) {
    const income = this.getById(incomeId);
    if (!income) return 0;
    return roundMoney(Number(income.amount) - this.getDistributedForIncome(incomeId));
  }

  getUndistributed() {
    return this.getAll()
      .map((income) => ({
        ...income,
        distributed: this.getDistributedForIncome(income.id),
        remaining: this.getRemainingForIncome(income.id)
      }))
      .filter((i) => i.remaining > 0.009);
  }

  getSources() {
    return ['Зарплата', 'Аванс', 'Подработка', 'Премия', 'Кэшбэк', 'Возврат долга', 'Дивиденды', 'Подарок', 'Другое'];
  }

  getStructureBySource() {
    const map = new Map();
    this.getAll().forEach((item) => {
      const key = item.source || 'Другое';
      map.set(key, roundMoney((map.get(key) || 0) + Number(item.amount)));
    });
    return [...map.entries()].map(([source, amount]) => ({ source, amount })).sort((a, b) => b.amount - a.amount);
  }

  getSummary() {
    return {
      totalIncome: this.getTotalIncome(),
      totalDistributed: this.getTotalDistributed(),
      freeMoney: this.getFreeMoney(),
      count: this.getAll().length,
      undistributedCount: this.getUndistributed().length
    };
  }

  validate(data) {
    const base = validateRequired(data, ['title', 'source', 'amount', 'date']);
    const errors = { ...base.errors };
    if (!(parseAmount(data.amount) > 0)) errors.amount = 'Сумма должна быть больше нуля';
    return { valid: Object.keys(errors).length === 0, errors };
  }

  add(data) {
    const validation = this.validate(data);
    if (!validation.valid) return { success: false, errors: validation.errors, message: 'Проверьте форму' };

    const row = {
      id: generateId(),
      title: String(data.title).trim(),
      source: String(data.source).trim(),
      amount: roundMoney(parseAmount(data.amount)),
      date: data.date || todayISO(),
      comment: String(data.comment || '').trim()
    };

    storage.batch((db) => {
      db.add('income', row);
      db.add('history', {
        id: generateId(),
        type: 'income',
        title: `Получен доход: ${row.title}`,
        amount: row.amount,
        description: row.source,
        icon: '💰',
        date: new Date().toISOString()
      });
    });

    return { success: true, data: row };
  }

  update(id, data) {
    const existing = this.getById(id);
    if (!existing) return { success: false, message: 'Доход не найден' };
    const validation = this.validate({ ...existing, ...data, title: data.title ?? existing.title });
    if (!validation.valid) return { success: false, errors: validation.errors, message: 'Проверьте форму' };

    const amount = roundMoney(parseAmount(data.amount));
    if (amount < this.getDistributedForIncome(id)) {
      return { success: false, message: 'Нельзя уменьшить сумму ниже распределённой' };
    }

    const updated = storage.update('income', id, {
      title: String(data.title).trim(),
      source: String(data.source).trim(),
      amount,
      date: data.date || existing.date,
      comment: String(data.comment || '').trim()
    });
    return { success: true, data: updated };
  }

  remove(id) {
    const existing = this.getById(id);
    if (!existing) return { success: false, message: 'Доход не найден' };
    if (this.getDistributedForIncome(id) > 0) {
      return { success: false, message: 'Нельзя удалить доход с распределением' };
    }
    storage.remove('income', id);
    return { success: true };
  }
}

export const incomeService = new IncomeService();
export default incomeService;
