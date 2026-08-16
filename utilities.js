/**
 * utilities.js — коммунальные услуги
 */
import { storage } from './storage.js';
import { budgetService } from './budget.js';
import {
  generateId, parseAmount, percent, roundMoney, sortByDate, sumBy, todayISO, validateRequired
} from './utils.js';

export const UTILITY_SERVICES = [
  'Электричество', 'Газ', 'Вода', 'Отопление', 'Интернет',
  'ТВ', 'Домофон', 'Вывоз мусора', 'Капремонт', 'Другое'
];

export class UtilitiesService {
  getPayments(utilityId = null) {
    const rows = storage.list('utilityPayments');
    if (!utilityId) return rows;
    return rows.filter((p) => p.utility_id === utilityId);
  }

  getPaidAmount(utilityId) {
    return roundMoney(sumBy(this.getPayments(utilityId), (p) => Number(p.amount) || 0));
  }

  /**
   * Обогащает запись остатком и статусом частичной оплаты.
   */
  enrich(util) {
    if (!util) return null;
    const amount = roundMoney(Number(util.amount) || 0);
    const paidAmount = this.getPaidAmount(util.id);
    const remaining = roundMoney(Math.max(0, amount - paidAmount));
    const fullyPaid = remaining <= 0.009 || util.status === 'paid';
    let status = fullyPaid ? 'paid' : (paidAmount > 0.009 ? 'partial' : 'pending');
    // Синхронизация legacy: если status=paid, remaining=0
    if (util.status === 'paid') {
      status = 'paid';
    }
    return {
      ...util,
      amount,
      paid_amount: fullyPaid && paidAmount <= 0.009 ? amount : paidAmount,
      remaining: fullyPaid ? 0 : remaining,
      status,
      isPartial: status === 'partial',
      fullyPaid
    };
  }

  getAll() {
    return sortByDate(
      storage.list('utilities').map((u) => this.enrich(u)).filter(Boolean),
      (u) => u.due_date || u.created_at,
      false
    );
  }

  getById(id) {
    return this.enrich(storage.find('utilities', id));
  }

  getPending() {
    return this.getAll().filter((u) => u.status !== 'paid');
  }

  getPaid() {
    return this.getAll().filter((u) => u.status === 'paid');
  }

  getTotalPending() {
    return roundMoney(sumBy(this.getPending(), (u) => Number(u.remaining) || 0));
  }

  getTotalPaid() {
    return roundMoney(sumBy(this.getAll(), (u) => Number(u.paid_amount) || 0));
  }

  getServices() {
    return UTILITY_SERVICES;
  }

  /**
   * Структура сумм по видам услуг (текущий период).
   */
  getStructure() {
    const map = new Map();
    this.getAll().forEach((item) => {
      const key = item.service || 'Другое';
      map.set(key, roundMoney((map.get(key) || 0) + (Number(item.amount) || 0)));
    });
    return [...map.entries()]
      .map(([service, amount]) => ({ service, amount }))
      .sort((a, b) => b.amount - a.amount);
  }

  getPaidStructure() {
    const map = new Map();
    this.getAll().forEach((item) => {
      const paid = Number(item.paid_amount) || 0;
      if (paid <= 0) return;
      const key = item.service || 'Другое';
      map.set(key, roundMoney((map.get(key) || 0) + paid));
    });
    return [...map.entries()]
      .map(([service, amount]) => ({ service, amount }))
      .sort((a, b) => b.amount - a.amount);
  }

  getOverdue() {
    const today = todayISO();
    return this.getPending().filter((u) => u.due_date && String(u.due_date) < today);
  }

  getDueToday() {
    const today = todayISO();
    return this.getPending().filter((u) => u.due_date && String(u.due_date) === today);
  }

  getObligationCard() {
    const remaining = this.getTotalPending();
    const overdue = roundMoney(sumBy(this.getOverdue(), (u) => Number(u.remaining) || 0));
    const today = roundMoney(sumBy(this.getDueToday(), (u) => Number(u.remaining) || 0));
    let status = 'paid';
    let statusLabel = '✓ Всё оплачено';
    let tone = 'green';
    if (overdue > 0) {
      status = 'overdue';
      statusLabel = '🔴 Просрочено';
      tone = 'red';
    } else if (today > 0) {
      status = 'today';
      statusLabel = '🟠 Сегодня';
      tone = 'orange';
    } else if (remaining > 0) {
      status = 'pending';
      statusLabel = '🟡 Осталось оплатить';
      tone = 'yellow';
    }
    return { remaining, overdue, today, status, statusLabel, tone };
  }

  getAnalytics() {
    const items = this.getAll();
    const pending = this.getPending();
    const paid = this.getPaid();
    const overdue = this.getOverdue();
    const structure = this.getStructure();
    const total = roundMoney(sumBy(items, (u) => Number(u.amount) || 0));
    const pendingTotal = this.getTotalPending();
    const paidTotal = this.getTotalPaid();
    const overdueTotal = roundMoney(sumBy(overdue, (u) => Number(u.remaining) || 0));
    const avgAmount = items.length ? roundMoney(total / items.length) : 0;
    const top = structure[0] || null;
    const nearest = [...pending]
      .filter((u) => u.due_date)
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0] || null;

    const chartItems = structure.map((row, i) => ({
      name: row.service,
      amount: row.amount,
      color: `hsl(${(i * 47 + 200) % 360} 65% 55%)`
    }));

    const statusBars = [
      { label: 'К оплате', amount: pendingTotal, color: '#f5a524' },
      { label: 'Оплачено', amount: paidTotal, color: '#2dd4bf' },
      { label: 'Просрочено', amount: overdueTotal, color: '#ff4d6d' }
    ].filter((row) => row.amount > 0);

    const serviceBars = structure.map((row, i) => ({
      label: row.service,
      amount: row.amount,
      color: `hsl(${(i * 47 + 200) % 360} 65% 55%)`
    }));

    return {
      pending: pendingTotal,
      paid: paidTotal,
      total,
      pendingCount: pending.length,
      paidCount: paid.length,
      totalCount: items.length,
      overdueCount: overdue.length,
      overdueTotal,
      card: this.getObligationCard(),
      avgAmount,
      progress: percent(paidTotal, total),
      topService: top ? top.service : null,
      topAmount: top ? top.amount : 0,
      nearestDue: nearest ? nearest.due_date : null,
      nearestService: nearest ? nearest.service : null,
      nearestAmount: nearest ? Number(nearest.remaining ?? nearest.amount) || 0 : 0,
      structure,
      chartItems,
      statusBars,
      serviceBars,
      items
    };
  }

  getSummary() {
    const analytics = this.getAnalytics();
    return {
      pending: analytics.pending,
      paid: analytics.paid,
      pendingCount: analytics.pendingCount,
      items: analytics.items,
      ...analytics
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

    const newAmount = roundMoney(parseAmount(merged.amount));
    if (newAmount + 0.009 < (existing.paid_amount || 0)) {
      return {
        success: false,
        message: `Сумма не может быть меньше уже оплаченного (${existing.paid_amount})`
      };
    }

    const updated = storage.update('utilities', id, {
      service: String(merged.service).trim(),
      amount: newAmount,
      due_date: merged.due_date,
      receipt: String(merged.receipt || '').trim(),
      comment: String(merged.comment || '').trim(),
      status: newAmount <= (existing.paid_amount || 0) + 0.009 ? 'paid' : 'pending'
    });
    return { success: true, data: this.enrich(updated) };
  }

  /**
   * Оплата полностью или частично.
   * @param {string} id
   * @param {string} budgetCategoryId
   * @param {string} date
   * @param {number|string|null} amountValue — если не задано, оплачивается весь остаток
   */
  pay(id, budgetCategoryId, date = todayISO(), amountValue = null) {
    const util = this.getById(id);
    if (!util) return { success: false, message: 'Запись не найдена' };
    if (util.status === 'paid') return { success: false, message: 'Уже оплачено' };

    const remaining = roundMoney(Number(util.remaining) || 0);
    if (!(remaining > 0)) return { success: false, message: 'Нечего оплачивать' };

    const amount = roundMoney(
      amountValue != null && amountValue !== ''
        ? parseAmount(amountValue)
        : remaining
    );
    if (!(amount > 0)) return { success: false, message: 'Сумма должна быть больше нуля' };
    if (amount > remaining + 0.009) {
      return { success: false, message: `Нельзя оплатить больше остатка (${remaining})` };
    }

    const category = budgetService.getCategoryById(budgetCategoryId);
    if (!category) return { success: false, message: 'Конверт не найден' };
    const balance = budgetService.getCategoryBalance(category.id).balance;
    if (amount > balance) {
      return { success: false, message: `Недостаточно средств в «${category.name}»` };
    }

    const newPaid = roundMoney((util.paid_amount || 0) + amount);
    const fullyPaid = newPaid + 0.009 >= util.amount;
    const isPartial = !fullyPaid;

    storage.batch((db) => {
      db.update('utilities', id, { status: fullyPaid ? 'paid' : 'pending' });
      db.add('utilityPayments', {
        id: generateId(),
        utility_id: id,
        amount,
        date,
        budget_category: budgetCategoryId,
        partial: isPartial
      });
      db.add('budgetTransactions', {
        id: generateId(),
        category_id: budgetCategoryId,
        amount: -amount,
        type: 'utility_payment',
        date,
        comment: isPartial
          ? `КУслуги (часть): ${util.service}`
          : `КУслуги: ${util.service}`,
        utility_id: id
      });
      db.add('history', {
        id: generateId(),
        type: 'utility',
        title: isPartial
          ? `Частичная оплата: ${util.service}`
          : `Оплачено: ${util.service}`,
        amount,
        description: category.name,
        icon: '🏠',
        date: new Date().toISOString()
      });
    });

    return {
      success: true,
      partial: isPartial,
      remaining: fullyPaid ? 0 : roundMoney(util.amount - newPaid),
      message: isPartial ? 'Частичная оплата сохранена' : 'Оплачено полностью'
    };
  }

  remove(id) {
    const existing = this.getById(id);
    if (!existing) return { success: false, message: 'Запись не найдена' };
    if (existing.status === 'paid') return { success: false, message: 'Нельзя удалить оплаченную услугу' };
    if ((existing.paid_amount || 0) > 0.009) {
      return { success: false, message: 'Нельзя удалить услугу с частичной оплатой' };
    }
    storage.remove('utilities', id);
    return { success: true };
  }
}

export const utilitiesService = new UtilitiesService();
export default utilitiesService;
