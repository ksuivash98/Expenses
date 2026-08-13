/**
 * requiredExpenses.js — обязательные расходы (не кредиты, не КУслуги)
 *
 * Шаблоны хранятся глобально (requiredExpenses).
 * Оплата за месяц — в requiredExpensePayments (свой статус на каждый период).
 * Неоплаченное обязательство НЕ списывает конверты и НЕ влияет на распределение дохода.
 */
import { storage } from './storage.js';
import { budgetService } from './budget.js';
import {
  daysInMonth, generateId, parseAmount, percent, roundMoney, sortByDate, sumBy, todayISO, validateRequired
} from './utils.js';

export const REQUIRED_EXPENSE_CATEGORIES = [
  'Детский сад',
  'Школа',
  'Интернет',
  'Телефон',
  'Страховка',
  'Обучение',
  'Транспорт',
  'Подписки',
  'Другое'
];

function periodYm(period) {
  if (!period) return todayISO().slice(0, 7);
  return `${period.year}-${String(period.month).padStart(2, '0')}`;
}

function dueDateForPeriod(period, paymentDay) {
  if (!period) return todayISO();
  const maxDay = daysInMonth(period.year, period.month - 1);
  const day = Math.min(Math.max(1, Number(paymentDay) || 1), maxDay);
  return `${periodYm(period)}-${String(day).padStart(2, '0')}`;
}

function asBool(value, fallback = true) {
  if (value === true || value === false) return value;
  if (value == null || value === '') return fallback;
  const s = String(value).toLowerCase();
  if (['1', 'true', 'yes', 'да', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'нет', 'off'].includes(s)) return false;
  return fallback;
}

export class RequiredExpensesService {
  getCategories() {
    const custom = storage.getSettings()?.requiredExpenseCategories || [];
    const set = new Set([...REQUIRED_EXPENSE_CATEGORIES, ...custom]);
    storage.list('requiredExpenses', { allPeriods: true }).forEach((row) => {
      if (row.category) set.add(String(row.category));
    });
    return [...set];
  }

  addCustomCategory(name) {
    const title = String(name || '').trim();
    if (!title) return { success: false, message: 'Пустое название категории' };
    const settings = storage.getSettings();
    const list = [...(settings.requiredExpenseCategories || [])];
    if (!list.includes(title) && !REQUIRED_EXPENSE_CATEGORIES.includes(title)) {
      list.push(title);
      storage.updateSettings({ requiredExpenseCategories: list });
    }
    return { success: true, data: title };
  }

  getAllTemplates() {
    return sortByDate(
      storage.list('requiredExpenses', { allPeriods: true }),
      (r) => r.created_at,
      true
    );
  }

  getById(id) {
    return storage.find('requiredExpenses', id);
  }

  getPayments(expenseId = null) {
    const rows = storage.list('requiredExpensePayments', { allPeriods: true });
    if (!expenseId) return rows;
    return rows.filter((p) => p.required_expense_id === expenseId);
  }

  getPaymentForPeriod(expenseId, periodId = storage.getCurrentPeriodId()) {
    if (!periodId) return null;
    return this.getPayments(expenseId).find((p) => p.period_id === periodId) || null;
  }

  /**
   * Активные шаблоны, видимые в текущем (или указанном) периоде.
   */
  getVisibleTemplates(period = storage.getCurrentPeriod()) {
    if (!period) return [];
    return this.getAllTemplates().filter((item) => {
      if (item.active === false) return false;
      if (item.recurring !== false) return true;
      return item.start_period_id === period.id
        || (item.start_year === period.year && item.start_month === period.month);
    });
  }

  enrichForPeriod(item, period = storage.getCurrentPeriod()) {
    if (!item || !period) return null;
    const payment = this.getPaymentForPeriod(item.id, period.id);
    const dueDate = dueDateForPeriod(period, item.payment_day);
    const today = todayISO();
    const paid = Boolean(payment);
    let payStatus = 'pending';
    if (paid) payStatus = 'paid';
    else if (dueDate < today) payStatus = 'overdue';
    else if (dueDate === today) payStatus = 'today';

    return {
      ...item,
      amount: roundMoney(Number(item.amount) || 0),
      payment_day: Number(item.payment_day) || 1,
      recurring: item.recurring !== false,
      active: item.active !== false,
      due_date: dueDate,
      status: paid ? 'paid' : 'pending',
      payStatus,
      paid,
      payment,
      paid_date: payment?.date || null,
      paid_amount: payment ? roundMoney(Number(payment.amount) || 0) : 0,
      budget_category: payment?.budget_category || null
    };
  }

  getPeriodItems(period = storage.getCurrentPeriod()) {
    return this.getVisibleTemplates(period)
      .map((item) => this.enrichForPeriod(item, period))
      .filter(Boolean)
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
  }

  getPending(period) {
    return this.getPeriodItems(period).filter((i) => i.status !== 'paid');
  }

  getPaid(period) {
    return this.getPeriodItems(period).filter((i) => i.status === 'paid');
  }

  getOverdue(period) {
    return this.getPending(period).filter((i) => i.payStatus === 'overdue');
  }

  getDueToday(period) {
    return this.getPending(period).filter((i) => i.payStatus === 'today');
  }

  getTotalPending(period) {
    return roundMoney(sumBy(this.getPending(period), (i) => Number(i.amount) || 0));
  }

  getTotalPaid(period) {
    return roundMoney(sumBy(this.getPaid(period), (i) => Number(i.paid_amount || i.amount) || 0));
  }

  getOverdueTotal(period) {
    return roundMoney(sumBy(this.getOverdue(period), (i) => Number(i.amount) || 0));
  }

  getTodayTotal(period) {
    return roundMoney(sumBy(this.getDueToday(period), (i) => Number(i.amount) || 0));
  }

  /**
   * Статус для карточки Dashboard.
   */
  getObligationCard(period = storage.getCurrentPeriod()) {
    const remaining = this.getTotalPending(period);
    const overdue = this.getOverdueTotal(period);
    const today = this.getTodayTotal(period);
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

  getAnalytics(period = storage.getCurrentPeriod()) {
    const items = this.getPeriodItems(period);
    const pending = this.getPending(period);
    const paid = this.getPaid(period);
    const overdue = this.getOverdue(period);
    const total = roundMoney(sumBy(items, (i) => Number(i.amount) || 0));
    const pendingTotal = this.getTotalPending(period);
    const paidTotal = this.getTotalPaid(period);
    const overdueTotal = this.getOverdueTotal(period);

    const map = new Map();
    items.forEach((item) => {
      const key = item.category || 'Другое';
      map.set(key, roundMoney((map.get(key) || 0) + (Number(item.amount) || 0)));
    });
    const structure = [...map.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    const chartItems = structure.map((row, i) => ({
      name: row.category,
      amount: row.amount,
      color: `hsl(${(i * 47 + 160) % 360} 65% 55%)`
    }));

    const statusBars = [
      { label: 'К оплате', amount: pendingTotal, color: '#f5a524' },
      { label: 'Оплачено', amount: paidTotal, color: '#2dd4bf' },
      { label: 'Просрочено', amount: overdueTotal, color: '#ff4d6d' }
    ].filter((row) => row.amount > 0);

    const nearest = [...pending]
      .filter((u) => u.due_date)
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0] || null;

    return {
      pending: pendingTotal,
      paid: paidTotal,
      total,
      pendingCount: pending.length,
      paidCount: paid.length,
      totalCount: items.length,
      overdueCount: overdue.length,
      overdueTotal,
      todayTotal: this.getTodayTotal(period),
      progress: percent(paidTotal, total),
      nearestDue: nearest?.due_date || null,
      nearestTitle: nearest?.title || null,
      nearestAmount: nearest ? Number(nearest.amount) || 0 : 0,
      structure,
      chartItems,
      statusBars,
      card: this.getObligationCard(period),
      items
    };
  }

  getSummary(period) {
    return this.getAnalytics(period);
  }

  validate(data) {
    const base = validateRequired(data, ['title', 'category', 'amount', 'payment_day']);
    const errors = { ...base.errors };
    if (!(parseAmount(data.amount) >= 0)) errors.amount = 'Некорректная сумма';
    const day = Number(data.payment_day);
    if (!(day >= 1 && day <= 31)) errors.payment_day = 'День платежа: 1–31';
    return { valid: Object.keys(errors).length === 0, errors };
  }

  add(data) {
    const validation = this.validate(data);
    if (!validation.valid) return { success: false, errors: validation.errors, message: 'Проверьте форму' };

    const period = storage.getCurrentPeriod();
    const category = String(data.category).trim() || 'Другое';
    if (category && !REQUIRED_EXPENSE_CATEGORIES.includes(category)) {
      this.addCustomCategory(category);
    }

    const row = {
      id: generateId(),
      title: String(data.title).trim(),
      category,
      amount: roundMoney(parseAmount(data.amount)),
      payment_day: Number(data.payment_day),
      recurring: asBool(data.recurring, true),
      active: asBool(data.active, true),
      comment: String(data.comment || '').trim(),
      start_period_id: period?.id || null,
      start_year: period?.year || null,
      start_month: period?.month || null
    };

    storage.add('requiredExpenses', row, { skipPeriod: true });
    return { success: true, data: row };
  }

  update(id, data) {
    const existing = this.getById(id);
    if (!existing) return { success: false, message: 'Запись не найдена' };

    const period = storage.getCurrentPeriod();
    const payment = period ? this.getPaymentForPeriod(id, period.id) : null;
    if (payment) {
      return { success: false, message: 'Сначала отмените оплату за этот месяц' };
    }

    const merged = { ...existing, ...data };
    const validation = this.validate(merged);
    if (!validation.valid) return { success: false, errors: validation.errors, message: 'Проверьте форму' };

    const category = String(merged.category).trim() || 'Другое';
    if (category && !REQUIRED_EXPENSE_CATEGORIES.includes(category)) {
      this.addCustomCategory(category);
    }

    const updated = storage.update('requiredExpenses', id, {
      title: String(merged.title).trim(),
      category,
      amount: roundMoney(parseAmount(merged.amount)),
      payment_day: Number(merged.payment_day),
      recurring: asBool(merged.recurring, existing.recurring !== false),
      active: asBool(merged.active, existing.active !== false),
      comment: String(merged.comment || '').trim()
    });
    return { success: true, data: updated };
  }

  pay(id, budgetCategoryId, date = todayISO(), amountValue = null) {
    const item = this.getById(id);
    if (!item) return { success: false, message: 'Запись не найдена' };
    if (item.active === false) return { success: false, message: 'Расход неактивен' };

    const period = storage.getCurrentPeriod();
    if (!period) return { success: false, message: 'Период не выбран' };

    const existingPayment = this.getPaymentForPeriod(id, period.id);
    if (existingPayment) return { success: false, message: 'Уже оплачено в этом месяце' };

    const amount = roundMoney(amountValue != null && amountValue !== ''
      ? parseAmount(amountValue)
      : Number(item.amount) || 0);
    if (!(amount > 0)) return { success: false, message: 'Сумма должна быть больше нуля' };

    const category = budgetService.getCategoryById(budgetCategoryId);
    if (!category) return { success: false, message: 'Конверт не найден' };
    const balance = budgetService.getCategoryBalance(category.id).balance;
    if (amount > balance) {
      return { success: false, message: `Недостаточно средств в «${category.name}»` };
    }

    const paymentId = generateId();
    storage.batch((db) => {
      db.add('requiredExpensePayments', {
        id: paymentId,
        required_expense_id: id,
        amount,
        date,
        budget_category: budgetCategoryId
      });
      db.add('budgetTransactions', {
        id: generateId(),
        category_id: budgetCategoryId,
        amount: -amount,
        type: 'required_expense_payment',
        date,
        comment: `Обязательный расход: ${item.title}`,
        required_expense_id: id,
        payment_id: paymentId
      });
      db.add('history', {
        id: generateId(),
        type: 'required_expense',
        title: `Оплачено: ${item.title}`,
        amount,
        description: category.name,
        icon: '📌',
        date: new Date().toISOString(),
        required_expense_id: id,
        payment_id: paymentId
      });
    });

    return { success: true };
  }

  unpay(id) {
    const item = this.getById(id);
    if (!item) return { success: false, message: 'Запись не найдена' };

    const period = storage.getCurrentPeriod();
    if (!period) return { success: false, message: 'Период не выбран' };

    const payment = this.getPaymentForPeriod(id, period.id);
    if (!payment) return { success: false, message: 'В этом месяце оплата не найдена' };

    const amount = roundMoney(Number(payment.amount) || 0);
    const categoryId = payment.budget_category;

    storage.batch((db) => {
      db.remove('requiredExpensePayments', payment.id);

      storage.list('budgetTransactions', { allPeriods: true })
        .filter((tx) => tx.payment_id === payment.id || (
          tx.type === 'required_expense_payment'
          && tx.required_expense_id === id
          && tx.period_id === period.id
        ))
        .forEach((tx) => db.remove('budgetTransactions', tx.id));

      db.add('history', {
        id: generateId(),
        type: 'required_expense',
        title: `Отмена оплаты: ${item.title}`,
        amount,
        description: categoryId ? 'Возврат в конверт' : 'Отмена оплаты',
        icon: '↩️',
        date: new Date().toISOString(),
        required_expense_id: id
      });
    });

    return { success: true };
  }

  remove(id) {
    const existing = this.getById(id);
    if (!existing) return { success: false, message: 'Запись не найдена' };

    const period = storage.getCurrentPeriod();
    if (period && this.getPaymentForPeriod(id, period.id)) {
      return { success: false, message: 'Сначала отмените оплату за этот месяц' };
    }

    const hasAnyPayments = storage.list('requiredExpensePayments', { allPeriods: true })
      .some((p) => p.required_expense_id === id);
    if (hasAnyPayments) {
      // Деактивируем, чтобы не ломать историю прошлых месяцев
      storage.update('requiredExpenses', id, { active: false });
      return { success: true, message: 'Расход скрыт (есть оплаты в других месяцах)' };
    }

    storage.remove('requiredExpenses', id);
    return { success: true };
  }
}

export const requiredExpensesService = new RequiredExpensesService();
export default requiredExpensesService;
