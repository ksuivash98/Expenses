/**
 * credits.js — кредиты и платежи
 */
import { storage } from './storage.js';
import { budgetService } from './budget.js';
import {
  addMonths, daysInMonth, generateId, parseAmount, roundMoney,
  sortByDate, sumBy, todayISO, toISODate, validateRequired
} from './utils.js';

const STATUS_LABELS = {
  active: 'Активный',
  closed: 'Закрыт',
  paid: 'Закрыт'
};

function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function safePct(part, total) {
  const t = safeNum(total);
  if (!(t > 0)) return 0;
  const p = (safeNum(part) / t) * 100;
  if (!Number.isFinite(p)) return 0;
  return Math.max(0, Math.min(100, roundMoney(p)));
}

function progressTone(percent) {
  const p = safeNum(percent);
  if (p <= 30) return 'red';
  if (p <= 70) return 'yellow';
  return 'green';
}

function nextPaymentDate(paymentDay, from = new Date()) {
  const day = Math.min(31, Math.max(1, Math.round(safeNum(paymentDay)) || 1));
  let year = from.getFullYear();
  let month = from.getMonth();
  if (from.getDate() > day) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  const d = Math.min(day, daysInMonth(year, month));
  return toISODate(new Date(year, month, d));
}

function monthsUntil(dateISO) {
  if (!dateISO) return null;
  const end = new Date(dateISO);
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  if (target <= today) return 0;
  let months = (target.getFullYear() - today.getFullYear()) * 12
    + (target.getMonth() - today.getMonth());
  if (target.getDate() < today.getDate()) months -= 1;
  return Math.max(0, months);
}

function daysUntil(dateISO) {
  if (!dateISO) return null;
  const end = new Date(dateISO);
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const diff = Math.round((target - today) / 86400000);
  return Number.isFinite(diff) ? Math.max(0, diff) : null;
}

export class CreditsService {
  getAll() {
    return sortByDate(storage.list('credits'), (c) => c.start_date || c.created_at, true);
  }

  getActive() {
    return this.getAll().filter((c) => c.status === 'active');
  }

  getById(id) {
    return storage.find('credits', id);
  }

  getPayments(creditId) {
    return sortByDate(
      storage.list('creditPayments').filter((p) => p.credit_id === creditId),
      (p) => p.date,
      true
    );
  }

  getTotalDebt() {
    return sumBy(this.getActive(), (c) => safeNum(c.current_balance));
  }

  getMonthlyPayments() {
    return sumBy(this.getActive(), (c) => safeNum(c.monthly_payment));
  }

  /**
   * Аналитика по одному кредиту (считается на лету, не хранится).
   */
  enrich(credit) {
    if (!credit) return null;

    const initialAmount = Math.max(0, safeNum(credit.initial_amount));
    const currentBalance = Math.max(0, safeNum(credit.current_balance));
    const monthlyPayment = Math.max(0, safeNum(credit.monthly_payment));
    const interestRate = Math.max(0, safeNum(credit.interest_rate));
    const paymentDay = Math.min(31, Math.max(1, Math.round(safeNum(credit.payment_day)) || 1));

    const remaining = currentBalance;
    const paid = roundMoney(Math.max(0, initialAmount - currentBalance));
    const progress = safePct(paid, initialAmount);
    const payments = this.getPayments(credit.id);
    const paidFromPayments = roundMoney(sumBy(payments, (p) => safeNum(p.amount)));
    const overpayment = roundMoney(Math.max(0, paidFromPayments - paid));

    const status = credit.status === 'active' ? 'active' : 'closed';
    const nextPayment = status === 'active' ? nextPaymentDate(paymentDay) : null;

    let monthsLeft = null;
    let daysLeft = null;
    let estimatedCloseDate = null;

    if (status === 'closed' || currentBalance <= 0) {
      monthsLeft = 0;
      daysLeft = 0;
      estimatedCloseDate = credit.end_date || todayISO();
    } else if (credit.end_date) {
      monthsLeft = monthsUntil(credit.end_date);
      daysLeft = daysUntil(credit.end_date);
      estimatedCloseDate = credit.end_date;
      if (monthsLeft == null && monthlyPayment > 0) {
        monthsLeft = Math.ceil(currentBalance / monthlyPayment);
      }
    } else if (monthlyPayment > 0) {
      monthsLeft = Math.ceil(currentBalance / monthlyPayment);
      if (Number.isFinite(monthsLeft) && monthsLeft > 0) {
        estimatedCloseDate = addMonths(nextPayment || todayISO(), Math.max(0, monthsLeft - 1));
        daysLeft = daysUntil(estimatedCloseDate);
      } else {
        monthsLeft = 0;
      }
    }

    if (monthsLeft != null && !Number.isFinite(monthsLeft)) monthsLeft = null;
    if (daysLeft != null && !Number.isFinite(daysLeft)) daysLeft = null;

    return {
      ...credit,
      bank: credit.bank || '—',
      title: credit.title || '—',
      initial_amount: initialAmount,
      current_balance: currentBalance,
      monthly_payment: monthlyPayment,
      interest_rate: interestRate,
      payment_day: paymentDay,
      status,
      statusLabel: STATUS_LABELS[status] || '—',
      remaining,
      paid,
      overpayment,
      progress,
      progressTone: progressTone(progress),
      nextPayment,
      monthsLeft,
      daysLeft,
      estimatedCloseDate,
      paidFromPayments
    };
  }

  getEnrichedAll() {
    return this.getAll().map((c) => this.enrich(c)).filter(Boolean);
  }

  getEnrichedActive() {
    return this.getEnrichedAll().filter((c) => c.status === 'active');
  }

  getSummary() {
    const items = this.getEnrichedAll();
    const active = items.filter((c) => c.status === 'active');
    const totalDebt = roundMoney(sumBy(active, (c) => c.current_balance));
    const monthly = roundMoney(sumBy(active, (c) => c.monthly_payment));
    const totalInitial = roundMoney(sumBy(items, (c) => c.initial_amount));
    const totalPaid = roundMoney(sumBy(items, (c) => c.paid));
    const totalOverpayment = roundMoney(sumBy(items, (c) => c.overpayment));
    const avgProgress = active.length
      ? roundMoney(sumBy(active, (c) => c.progress) / active.length)
      : (items.length ? roundMoney(sumBy(items, (c) => c.progress) / items.length) : 0);

    const upcoming = active
      .filter((c) => c.nextPayment)
      .sort((a, b) => String(a.nextPayment).localeCompare(String(b.nextPayment)));
    const nearest = upcoming[0] || null;

    return {
      totalDebt,
      monthly,
      count: active.length,
      totalCount: items.length,
      totalInitial,
      totalPaid,
      totalOverpayment,
      avgProgress: Number.isFinite(avgProgress) ? avgProgress : 0,
      avgProgressTone: progressTone(avgProgress),
      nearestPayment: nearest ? nearest.nextPayment : null,
      nearestTitle: nearest ? `${nearest.bank} · ${nearest.title}` : null,
      nearestAmount: nearest ? nearest.monthly_payment : 0,
      items,
      active
    };
  }

  validate(data) {
    const base = validateRequired(data, ['bank', 'title', 'initial_amount', 'current_balance', 'monthly_payment', 'payment_day']);
    const errors = { ...base.errors };
    if (!(parseAmount(data.initial_amount) >= 0)) errors.initial_amount = 'Некорректная сумма';
    if (!(parseAmount(data.current_balance) >= 0)) errors.current_balance = 'Некорректный остаток';
    const day = Number(data.payment_day);
    if (!(day >= 1 && day <= 31)) errors.payment_day = 'День платежа 1–31';
    return { valid: Object.keys(errors).length === 0, errors };
  }

  add(data) {
    const validation = this.validate(data);
    if (!validation.valid) return { success: false, errors: validation.errors, message: 'Проверьте форму' };

    const row = {
      id: generateId(),
      bank: String(data.bank).trim(),
      title: String(data.title).trim(),
      initial_amount: roundMoney(parseAmount(data.initial_amount)),
      current_balance: roundMoney(parseAmount(data.current_balance)),
      monthly_payment: roundMoney(parseAmount(data.monthly_payment)),
      interest_rate: roundMoney(parseAmount(data.interest_rate || 0)),
      payment_day: Number(data.payment_day),
      start_date: data.start_date || todayISO(),
      end_date: data.end_date || '',
      status: 'active',
      notes: String(data.notes || '').trim()
    };

    storage.batch((db) => {
      db.add('credits', row);
      db.add('history', {
        id: generateId(),
        type: 'credit',
        title: `Добавлен кредит: ${row.title}`,
        amount: row.current_balance,
        description: row.bank,
        icon: '💳',
        date: new Date().toISOString()
      });
    });

    return { success: true, data: row };
  }

  update(id, data) {
    const existing = this.getById(id);
    if (!existing) return { success: false, message: 'Кредит не найден' };
    const merged = { ...existing, ...data };
    const validation = this.validate(merged);
    if (!validation.valid) return { success: false, errors: validation.errors, message: 'Проверьте форму' };

    const updated = storage.update('credits', id, {
      bank: String(merged.bank).trim(),
      title: String(merged.title).trim(),
      initial_amount: roundMoney(parseAmount(merged.initial_amount)),
      current_balance: roundMoney(parseAmount(merged.current_balance)),
      monthly_payment: roundMoney(parseAmount(merged.monthly_payment)),
      interest_rate: roundMoney(parseAmount(merged.interest_rate || 0)),
      payment_day: Number(merged.payment_day),
      start_date: merged.start_date || existing.start_date,
      end_date: merged.end_date || '',
      notes: String(merged.notes || '').trim(),
      status: merged.status || existing.status
    });
    return { success: true, data: updated };
  }

  pay(creditId, amountValue, budgetCategoryId, date = todayISO(), comment = '') {
    const credit = this.getById(creditId);
    if (!credit) return { success: false, message: 'Кредит не найден' };
    if (credit.status !== 'active') return { success: false, message: 'Кредит не активен' };

    const amount = roundMoney(parseAmount(amountValue));
    if (!(amount > 0)) return { success: false, message: 'Сумма должна быть больше нуля' };

    const category = budgetService.getCategoryById(budgetCategoryId);
    if (!category) return { success: false, message: 'Конверт не найден' };
    const balance = budgetService.getCategoryBalance(category.id).balance;
    if (amount > balance) {
      return { success: false, message: `Недостаточно средств в «${category.name}»` };
    }

    const newBalance = roundMoney(Math.max(0, Number(credit.current_balance) - amount));
    const closed = newBalance <= 0;

    storage.batch((db) => {
      db.add('creditPayments', {
        id: generateId(),
        credit_id: creditId,
        amount,
        date,
        budget_category: budgetCategoryId,
        comment: comment || `Платёж по кредиту «${credit.title}»`
      });
      db.add('budgetTransactions', {
        id: generateId(),
        category_id: budgetCategoryId,
        amount: -amount,
        type: 'credit_payment',
        date,
        comment: `Кредит: ${credit.title}`,
        credit_id: creditId
      });
      db.update('credits', creditId, {
        current_balance: newBalance,
        status: closed ? 'closed' : 'active'
      });
      db.add('history', {
        id: generateId(),
        type: 'credit_payment',
        title: closed ? `Кредит закрыт: ${credit.title}` : `Платёж по кредиту: ${credit.title}`,
        amount,
        description: category.name,
        icon: closed ? '✅' : '💳',
        date: new Date().toISOString()
      });
    });

    return { success: true, closed };
  }

  remove(id) {
    const existing = this.getById(id);
    if (!existing) return { success: false, message: 'Кредит не найден' };
    if (this.getPayments(id).length) {
      return { success: false, message: 'Нельзя удалить кредит с платежами' };
    }
    storage.remove('credits', id);
    return { success: true };
  }
}

export const creditsService = new CreditsService();
export default creditsService;
