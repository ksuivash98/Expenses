/**
 * utilities.js — коммунальные услуги
 */
import { storage } from './storage.js';
import { budgetService } from './budget.js';
import {
  generateId, parseAmount, roundMoney, sortByDate, sumBy, todayISO, validateRequired
} from './utils.js';

export const UTILITY_SERVICES = [
  'Электричество', 'Газ', 'Вода', 'Отопление', 'Интернет',
  'ТВ', 'Домофон', 'Вывоз мусора', 'Капремонт', 'Другое'
];

export class UtilitiesService {
  getAll() {
    return sortByDate(storage.list('utilities'), (u) => u.due_date || u.created_at, false);
  }

  getById(id) {
    return storage.find('utilities', id);
  }

  getPending() {
    return this.getAll().filter((u) => u.status !== 'paid');
  }

  getPaid() {
    return this.getAll().filter((u) => u.status === 'paid');
  }

  getTotalPending() {
    return sumBy(this.getPending(), (u) => Number(u.amount) || 0);
  }

  getTotalPaid() {
    return sumBy(this.getPaid(), (u) => Number(u.amount) || 0);
  }

  getServices() {
    return UTILITY_SERVICES;
  }

  getSummary() {
    return {
      pending: this.getTotalPending(),
      paid: this.getTotalPaid(),
      pendingCount: this.getPending().length,
      items: this.getAll()
    };
  }

  validate(data) {
    const base = validateRequired(data, ['service', 'amount', 'due_date']);
    const errors = { ...base.errors };
    if (!(parseAmount(data.amount) >= 0)) errors.amount = 'Некорректная сумма';
    return { valid: Object.keys(errors).length === 0, errors };
  }

  add(data) {
    const validation = this.validate(data);
    if (!validation.valid) return { success: false, errors: validation.errors, message: 'Проверьте форму' };

    const period = storage.getCurrentPeriod();
    const monthKey = period
      ? `${period.year}-${String(period.month).padStart(2, '0')}`
      : todayISO().slice(0, 7);

    const row = {
      id: generateId(),
      service: String(data.service).trim(),
      amount: roundMoney(parseAmount(data.amount)),
      month_key: monthKey,
      status: 'pending',
      due_date: data.due_date || todayISO(),
      receipt: String(data.receipt || '').trim(),
      comment: String(data.comment || '').trim()
    };

    storage.add('utilities', row);
    return { success: true, data: row };
  }

  update(id, data) {
    const existing = this.getById(id);
    if (!existing) return { success: false, message: 'Запись не найдена' };
    if (existing.status === 'paid') return { success: false, message: 'Оплаченную услугу нельзя изменить' };

    const merged = { ...existing, ...data };
    const validation = this.validate(merged);
    if (!validation.valid) return { success: false, errors: validation.errors, message: 'Проверьте форму' };

    const updated = storage.update('utilities', id, {
      service: String(merged.service).trim(),
      amount: roundMoney(parseAmount(merged.amount)),
      due_date: merged.due_date,
      receipt: String(merged.receipt || '').trim(),
      comment: String(merged.comment || '').trim()
    });
    return { success: true, data: updated };
  }

  pay(id, budgetCategoryId, date = todayISO()) {
    const util = this.getById(id);
    if (!util) return { success: false, message: 'Запись не найдена' };
    if (util.status === 'paid') return { success: false, message: 'Уже оплачено' };

    const amount = roundMoney(Number(util.amount) || 0);
    if (!(amount > 0)) return { success: false, message: 'Сумма должна быть больше нуля' };

    const category = budgetService.getCategoryById(budgetCategoryId);
    if (!category) return { success: false, message: 'Конверт не найден' };
    const balance = budgetService.getCategoryBalance(category.id).balance;
    if (amount > balance) {
      return { success: false, message: `Недостаточно средств в «${category.name}»` };
    }

    storage.batch((db) => {
      db.update('utilities', id, { status: 'paid' });
      db.add('utilityPayments', {
        id: generateId(),
        utility_id: id,
        amount,
        date,
        budget_category: budgetCategoryId
      });
      db.add('budgetTransactions', {
        id: generateId(),
        category_id: budgetCategoryId,
        amount: -amount,
        type: 'utility_payment',
        date,
        comment: `КУслуги: ${util.service}`,
        utility_id: id
      });
      db.add('history', {
        id: generateId(),
        type: 'utility',
        title: `Оплачено: ${util.service}`,
        amount,
        description: category.name,
        icon: '🏠',
        date: new Date().toISOString()
      });
    });

    return { success: true };
  }

  remove(id) {
    const existing = this.getById(id);
    if (!existing) return { success: false, message: 'Запись не найдена' };
    if (existing.status === 'paid') return { success: false, message: 'Нельзя удалить оплаченную услугу' };
    storage.remove('utilities', id);
    return { success: true };
  }
}

export const utilitiesService = new UtilitiesService();
export default utilitiesService;
