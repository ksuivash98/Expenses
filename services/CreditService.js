/**
 * services/CreditService.js
 */
import { TABLES } from '../config.js';
import { databaseService } from './DatabaseService.js';
import { budgetService } from './BudgetService.js';
import {
  addMonths, generateId, parseAmount, percent, roundMoney,
  sortByDate, sumBy, todayISO, toISODate, validateRequired
} from '../helpers/utils.js';

export class CreditService {
  getAll() {
    return sortByDate(databaseService.list(TABLES.credits), (c) => c.created_at || c.start_date, true);
  }

  getById(id) {
    return databaseService.find(TABLES.credits, id);
  }

  getActive() {
    return this.getAll().filter((c) => c.status === 'active');
  }

  getPayments() {
    return sortByDate(databaseService.list(TABLES.creditPayments), (p) => p.payment_date, true);
  }

  getPaymentsForCredit(creditId) {
    return this.getPayments().filter((p) => p.credit_id === creditId);
  }

  getPaidAmount(creditId) {
    return sumBy(this.getPaymentsForCredit(creditId), (p) => Number(p.amount) || 0);
  }

  getNextPaymentDate(credit) {
    if (credit.status !== 'active') return null;
    const paymentDay = Number(credit.payment_day || 1);
    const today = new Date();
    let year = today.getFullYear();
    let month = today.getMonth();
    let candidate = new Date(year, month, Math.min(paymentDay, new Date(year, month + 1, 0).getDate()));
    if (toISODate(candidate) < todayISO()) {
      month += 1;
      if (month > 11) { month = 0; year += 1; }
      candidate = new Date(year, month, Math.min(paymentDay, new Date(year, month + 1, 0).getDate()));
    }
    if (credit.end_date && toISODate(candidate) > credit.end_date) return credit.end_date;
    return toISODate(candidate);
  }

  enrich(credit) {
    const initial = Number(credit.initial_amount) || 0;
    const remaining = Number(credit.current_balance) || 0;
    return {
      ...credit,
      paidAmount: this.getPaidAmount(credit.id),
      progress: percent(initial - remaining, initial),
      nextPaymentDate: this.getNextPaymentDate(credit),
      paymentsCount: this.getPaymentsForCredit(credit.id).length
    };
  }

  getAllEnriched() {
    return this.getAll().map((c) => this.enrich(c));
  }

  getTotalDebt() {
    return sumBy(this.getActive(), (c) => Number(c.current_balance) || 0);
  }

  getTotalMonthlyPayments() {
    return sumBy(this.getActive(), (c) => Number(c.monthly_payment) || 0);
  }

  getUpcomingPayments(limit = 5) {
    return this.getActive()
      .map((credit) => ({
        id: credit.id,
        type: 'credit',
        title: credit.title,
        subtitle: credit.bank || 'Кредит',
        amount: Number(credit.monthly_payment) || 0,
        date: this.getNextPaymentDate(credit),
        icon: '💳'
      }))
      .filter((i) => i.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(0, limit);
  }

  getSummary() {
    return {
      totalDebt: this.getTotalDebt(),
      monthlyPayments: this.getTotalMonthlyPayments(),
      activeCount: this.getActive().length,
      credits: this.getAllEnriched(),
      upcoming: this.getUpcomingPayments()
    };
  }

  validate(data) {
    const base = validateRequired(data, ['title', 'initial_amount', 'current_balance', 'monthly_payment', 'payment_day', 'start_date']);
    const errors = { ...base.errors };
    const initial = parseAmount(data.initial_amount);
    const remaining = parseAmount(data.current_balance);
    if (!(initial > 0)) errors.initial_amount = 'Укажите сумму';
    if (remaining < 0 || remaining > initial) errors.current_balance = 'Некорректный остаток';
    if (!(parseAmount(data.monthly_payment) > 0)) errors.monthly_payment = 'Укажите платёж';
    const day = Number(data.payment_day);
    if (!(day >= 1 && day <= 31)) errors.payment_day = 'День 1–31';
    return { valid: Object.keys(errors).length === 0, errors };
  }

  async add(data) {
    const validation = this.validate(data);
    if (!validation.valid) return { success: false, errors: validation.errors, message: 'Проверьте форму' };
    const startDate = data.start_date || todayISO();
    const months = Number(data.months) || 0;
    let endDate = data.end_date || '';
    if (!endDate && months > 0) endDate = addMonths(startDate, months);

    const row = {
      id: generateId(),
      title: String(data.title).trim(),
      bank: String(data.bank || '').trim(),
      initial_amount: roundMoney(parseAmount(data.initial_amount)),
      current_balance: roundMoney(parseAmount(data.current_balance)),
      monthly_payment: roundMoney(parseAmount(data.monthly_payment)),
      interest_rate: roundMoney(parseAmount(data.interest_rate)),
      payment_day: Number(data.payment_day),
      start_date: startDate,
      end_date: endDate || null,
      status: 'active',
      notes: String(data.notes || data.comment || '').trim()
    };

    await databaseService.insert(TABLES.credits, row);
    await databaseService.insert(TABLES.history, {
      id: generateId(), type: 'credit_add', title: `Добавлен кредит: ${row.title}`,
      amount: row.current_balance, icon: '💳', date: new Date().toISOString()
    });
    return { success: true, data: row };
  }

  async update(id, data) {
    const existing = this.getById(id);
    if (!existing) return { success: false, message: 'Кредит не найден' };
    const validation = this.validate({ ...existing, ...data });
    if (!validation.valid) return { success: false, errors: validation.errors, message: 'Проверьте форму' };

    const updated = await databaseService.update(TABLES.credits, id, {
      title: String(data.title).trim(),
      bank: String(data.bank || '').trim(),
      initial_amount: roundMoney(parseAmount(data.initial_amount)),
      current_balance: roundMoney(parseAmount(data.current_balance)),
      monthly_payment: roundMoney(parseAmount(data.monthly_payment)),
      interest_rate: roundMoney(parseAmount(data.interest_rate)),
      payment_day: Number(data.payment_day),
      start_date: data.start_date || existing.start_date,
      end_date: data.end_date !== undefined ? data.end_date : existing.end_date,
      notes: String(data.notes || data.comment || '').trim()
    });
    return { success: true, data: updated };
  }

  async makePayment(creditId, data = {}) {
    const credit = this.getById(creditId);
    if (!credit) return { success: false, message: 'Кредит не найден' };
    if (credit.status !== 'active') return { success: false, message: 'Кредит закрыт' };

    const amount = roundMoney(parseAmount(data.amount ?? credit.monthly_payment));
    if (!(amount > 0)) return { success: false, message: 'Сумма должна быть больше нуля' };
    const envelopeId = data.envelopeId || data.budget_category || null;
    if (envelopeId) {
      const balance = budgetService.getCategoryBalance(envelopeId).balance;
      if (amount > balance) return { success: false, message: 'Недостаточно средств в конверте' };
    }

    const paymentAmount = Math.min(amount, Number(credit.current_balance));
    const date = data.payment_date || data.date || todayISO();
    const paymentId = generateId();
    const newRemaining = roundMoney(Number(credit.current_balance) - paymentAmount);

    await databaseService.batch(async (db) => {
      if (envelopeId) {
        await db.insert(TABLES.budgetTransactions, {
          id: generateId(), category_id: envelopeId, amount: -paymentAmount,
          type: 'credit_payment', date, comment: `Платёж по кредиту «${credit.title}»`
        });
      }
      await db.insert(TABLES.creditPayments, {
        id: paymentId, credit_id: creditId, amount: paymentAmount,
        payment_date: date, comment: String(data.comment || '').trim()
      });
      const patch = { current_balance: Math.max(0, newRemaining) };
      if (newRemaining <= 0.009) patch.status = 'closed';
      await db.update(TABLES.credits, creditId, patch);
      await db.insert(TABLES.history, {
        id: generateId(), type: 'credit_payment', title: `Оплачен кредит: ${credit.title}`,
        amount: paymentAmount, icon: '💳', date: new Date().toISOString()
      });
    });

    return { success: true, data: this.enrich(this.getById(creditId)) };
  }

  async close(id) {
    const credit = this.getById(id);
    if (!credit) return { success: false, message: 'Кредит не найден' };
    await databaseService.update(TABLES.credits, id, { status: 'closed', current_balance: 0 });
    await databaseService.insert(TABLES.history, {
      id: generateId(), type: 'credit_close', title: `Кредит закрыт: ${credit.title}`,
      icon: '✅', date: new Date().toISOString()
    });
    return { success: true };
  }

  async remove(id) {
    const credit = this.getById(id);
    if (!credit) return { success: false, message: 'Кредит не найден' };
    await databaseService.batch(async (db) => {
      for (const p of this.getPaymentsForCredit(id)) {
        await db.remove(TABLES.creditPayments, p.id);
      }
      await db.remove(TABLES.credits, id);
    });
    return { success: true };
  }
}

export const creditService = new CreditService();
export default creditService;
