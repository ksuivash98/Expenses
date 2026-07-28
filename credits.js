/**
 * credits.js — кредиты и платежи
 */
import { storage } from './storage.js';
import { budgetService } from './budget.js';
import {
  generateId, parseAmount, roundMoney, sortByDate, sumBy, todayISO, validateRequired
} from './utils.js';

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
    return sumBy(this.getActive(), (c) => Number(c.current_balance) || 0);
  }

  getMonthlyPayments() {
    return sumBy(this.getActive(), (c) => Number(c.monthly_payment) || 0);
  }

  getSummary() {
    return {
      totalDebt: this.getTotalDebt(),
      monthly: this.getMonthlyPayments(),
      count: this.getActive().length,
      items: this.getActive()
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
