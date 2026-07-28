/**
 * credits.js
 * Управление кредитами, платежами и историей погашения.
 */

import { storage } from './storage.js';
import { historyService } from './history.js';
import { budgetService } from './budget.js';
import {
  addMonths,
  generateId,
  parseAmount,
  percent,
  roundMoney,
  sortByDate,
  sumBy,
  todayISO,
  toISODate,
  validateRequired
} from './utils.js';

/**
 * Сервис кредитов.
 */
export class CreditsService {
  /**
   * @param {import('./storage.js').Storage} [store]
   */
  constructor(store = storage) {
    this.store = store;
  }

  /**
   * Все кредиты.
   * @returns {Array<object>}
   */
  getAll() {
    return sortByDate(
      this.store.getCollection('credits'),
      (item) => item.createdAt || item.startDate,
      true
    );
  }

  /**
   * Кредит по ID.
   * @param {string} id
   * @returns {object|null}
   */
  getById(id) {
    return this.store.findById('credits', id);
  }

  /**
   * Активные кредиты.
   * @returns {Array<object>}
   */
  getActive() {
    return this.getAll().filter((credit) => credit.status === 'active');
  }

  /**
   * Все платежи по кредитам.
   * @returns {Array<object>}
   */
  getPayments() {
    return sortByDate(
      this.store.getCollection('creditPayments'),
      (item) => item.date || item.createdAt,
      true
    );
  }

  /**
   * Платежи конкретного кредита.
   * @param {string} creditId
   * @returns {Array<object>}
   */
  getPaymentsForCredit(creditId) {
    return this.getPayments().filter((payment) => payment.creditId === creditId);
  }

  /**
   * Сумма выплаченного по кредиту.
   * @param {string} creditId
   * @returns {number}
   */
  getPaidAmount(creditId) {
    return sumBy(this.getPaymentsForCredit(creditId), (p) => Number(p.amount) || 0);
  }

  /**
   * Обогащённые данные кредита.
   * @param {object} credit
   * @returns {object}
   */
  enrich(credit) {
    const paid = this.getPaidAmount(credit.id);
    const initial = Number(credit.initialAmount) || 0;
    const remaining = Number(credit.remainingAmount) || 0;
    const monthly = Number(credit.monthlyPayment) || 0;

    return {
      ...credit,
      paidAmount: paid,
      progress: percent(initial - remaining, initial),
      nextPaymentDate: this.getNextPaymentDate(credit),
      paymentsCount: this.getPaymentsForCredit(credit.id).length,
      monthlyPayment: monthly
    };
  }

  /**
   * Список кредитов с доп. полями.
   * @returns {Array<object>}
   */
  getAllEnriched() {
    return this.getAll().map((credit) => this.enrich(credit));
  }

  /**
   * Дата следующего платежа.
   * @param {object} credit
   * @returns {string|null}
   */
  getNextPaymentDate(credit) {
    if (credit.status !== 'active') return null;

    const paymentDay = Number(credit.paymentDay || 1);
    const today = new Date();
    let year = today.getFullYear();
    let month = today.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let candidate = new Date(year, month, Math.min(paymentDay, daysInMonth));

    if (toISODate(candidate) < todayISO()) {
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
      const daysNext = new Date(year, month + 1, 0).getDate();
      candidate = new Date(year, month, Math.min(paymentDay, daysNext));
    }

    if (credit.endDate && toISODate(candidate) > credit.endDate) {
      return credit.endDate;
    }

    return toISODate(candidate);
  }

  /**
   * Ближайшие платежи по активным кредитам.
   * @param {number} [limit=5]
   * @returns {Array<object>}
   */
  getUpcomingPayments(limit = 5) {
    return this.getActive()
      .map((credit) => {
        const enriched = this.enrich(credit);
        return {
          id: credit.id,
          type: 'credit',
          title: credit.name,
          subtitle: credit.bank || 'Кредит',
          amount: Number(credit.monthlyPayment) || 0,
          date: enriched.nextPaymentDate,
          icon: '💳'
        };
      })
      .filter((item) => item.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(0, limit);
  }

  /**
   * Общий остаток долга по активным кредитам.
   * @returns {number}
   */
  getTotalDebt() {
    return sumBy(this.getActive(), (c) => Number(c.remainingAmount) || 0);
  }

  /**
   * Сумма ежемесячных платежей.
   * @returns {number}
   */
  getTotalMonthlyPayments() {
    return sumBy(this.getActive(), (c) => Number(c.monthlyPayment) || 0);
  }

  /**
   * Валидация кредита.
   * @param {object} data
   * @returns {{ valid: boolean, errors: Object.<string, string> }}
   */
  validate(data) {
    const base = validateRequired(data, [
      'name',
      'initialAmount',
      'remainingAmount',
      'monthlyPayment',
      'paymentDay',
      'startDate'
    ]);
    const errors = { ...base.errors };

    const initial = parseAmount(data.initialAmount);
    const remaining = parseAmount(data.remainingAmount);
    const monthly = parseAmount(data.monthlyPayment);
    const rate = parseAmount(data.interestRate);
    const paymentDay = Number(data.paymentDay);

    if (!(initial > 0)) errors.initialAmount = 'Укажите первоначальную сумму';
    if (remaining < 0) errors.remainingAmount = 'Остаток не может быть отрицательным';
    if (remaining > initial) errors.remainingAmount = 'Остаток не может превышать первоначальную сумму';
    if (!(monthly > 0)) errors.monthlyPayment = 'Укажите ежемесячный платёж';
    if (!(paymentDay >= 1 && paymentDay <= 31)) errors.paymentDay = 'День платежа: 1–31';
    if (rate < 0) errors.interestRate = 'Ставка не может быть отрицательной';

    return {
      valid: Object.keys(errors).length === 0,
      errors
    };
  }

  /**
   * Добавляет кредит.
   * @param {object} data
   * @returns {{ success: boolean, data?: object, errors?: object, message?: string }}
   */
  add(data) {
    const validation = this.validate(data);
    if (!validation.valid) {
      return { success: false, errors: validation.errors, message: 'Проверьте заполнение формы' };
    }

    const startDate = data.startDate || todayISO();
    const months = Number(data.months) || 0;
    let endDate = data.endDate || '';

    if (!endDate && months > 0) {
      endDate = addMonths(startDate, months);
    }

    const record = {
      id: generateId(),
      name: String(data.name).trim(),
      bank: String(data.bank || '').trim(),
      initialAmount: roundMoney(parseAmount(data.initialAmount)),
      remainingAmount: roundMoney(parseAmount(data.remainingAmount)),
      monthlyPayment: roundMoney(parseAmount(data.monthlyPayment)),
      interestRate: roundMoney(parseAmount(data.interestRate)),
      paymentDay: Number(data.paymentDay),
      startDate,
      endDate,
      months: months || null,
      comment: String(data.comment || '').trim(),
      status: 'active',
      createdAt: new Date().toISOString()
    };

    this.store.batch((store) => {
      store.add('credits', record, false);
      historyService.add({
        type: 'credit_add',
        title: `Добавлен кредит: ${record.name}`,
        description: record.bank || 'Без указания банка',
        amount: record.remainingAmount,
        meta: { creditId: record.id },
        icon: '💳'
      }, false);
    });

    return { success: true, data: record };
  }

  /**
   * Редактирует кредит.
   * @param {string} id
   * @param {object} data
   * @returns {{ success: boolean, data?: object, errors?: object, message?: string }}
   */
  update(id, data) {
    const existing = this.getById(id);
    if (!existing) {
      return { success: false, message: 'Кредит не найден' };
    }

    const validation = this.validate({ ...existing, ...data });
    if (!validation.valid) {
      return { success: false, errors: validation.errors, message: 'Проверьте заполнение формы' };
    }

    const startDate = data.startDate || existing.startDate;
    const months = data.months !== undefined ? Number(data.months) || 0 : existing.months;
    let endDate = data.endDate !== undefined ? data.endDate : existing.endDate;

    if ((!endDate || data.months !== undefined) && months > 0) {
      endDate = addMonths(startDate, months);
    }

    const updated = this.store.update('credits', id, {
      name: String(data.name).trim(),
      bank: String(data.bank || '').trim(),
      initialAmount: roundMoney(parseAmount(data.initialAmount)),
      remainingAmount: roundMoney(parseAmount(data.remainingAmount)),
      monthlyPayment: roundMoney(parseAmount(data.monthlyPayment)),
      interestRate: roundMoney(parseAmount(data.interestRate)),
      paymentDay: Number(data.paymentDay),
      startDate,
      endDate,
      months: months || null,
      comment: String(data.comment || '').trim()
    });

    historyService.add({
      type: 'credit_add',
      title: `Изменён кредит: ${updated.name}`,
      description: 'Параметры кредита обновлены',
      amount: updated.remainingAmount,
      meta: { creditId: id },
      icon: '💳'
    });

    return { success: true, data: updated };
  }

  /**
   * Отмечает платёж по кредиту с опциональным списанием из конверта.
   * @param {string} creditId
   * @param {object} data
   * @returns {{ success: boolean, data?: object, message?: string }}
   */
  makePayment(creditId, data = {}) {
    const credit = this.getById(creditId);
    if (!credit) {
      return { success: false, message: 'Кредит не найден' };
    }
    if (credit.status !== 'active') {
      return { success: false, message: 'Кредит уже закрыт' };
    }

    const amount = roundMoney(parseAmount(data.amount ?? credit.monthlyPayment));
    if (!(amount > 0)) {
      return { success: false, message: 'Сумма платежа должна быть больше нуля' };
    }

    const envelopeId = data.envelopeId || null;
    if (envelopeId) {
      const balance = budgetService.getCategoryBalance(envelopeId).balance;
      if (amount > balance) {
        const envelope = budgetService.getCategoryById(envelopeId);
        return {
          success: false,
          message: `Недостаточно средств в конверте «${envelope?.name || ''}»`
        };
      }
    }

    const paymentAmount = Math.min(amount, Number(credit.remainingAmount));
    const date = data.date || todayISO();
    const paymentId = generateId();

    this.store.batch((store) => {
      if (envelopeId) {
        const spend = budgetService.spendFromEnvelope({
          categoryId: envelopeId,
          amount: paymentAmount,
          type: 'credit_payment',
          comment: `Платёж по кредиту «${credit.name}»`,
          date,
          meta: { creditId, paymentId },
          autoSave: false
        });
        if (!spend.success) {
          throw new Error(spend.message);
        }
      }

      store.add('creditPayments', {
        id: paymentId,
        creditId,
        amount: paymentAmount,
        date,
        envelopeId,
        comment: String(data.comment || '').trim(),
        createdAt: new Date().toISOString()
      }, false);

      const newRemaining = roundMoney(Number(credit.remainingAmount) - paymentAmount);
      const patch = {
        remainingAmount: Math.max(0, newRemaining)
      };

      if (newRemaining <= 0.009) {
        patch.status = 'closed';
        patch.closedAt = new Date().toISOString();
      }

      store.update('credits', creditId, patch, false);

      historyService.add({
        type: 'credit_payment',
        title: `Оплачен кредит: ${credit.name}`,
        description: data.comment || `Платёж ${paymentAmount}`,
        amount: paymentAmount,
        meta: { creditId, paymentId },
        icon: '💳'
      }, false);

      if (newRemaining <= 0.009) {
        historyService.add({
          type: 'credit_close',
          title: `Кредит закрыт: ${credit.name}`,
          description: 'Долг полностью погашен',
          amount: 0,
          meta: { creditId },
          icon: '✅'
        }, false);
      }
    });

    return { success: true, data: this.enrich(this.getById(creditId)) };
  }

  /**
   * Закрывает кредит вручную.
   * @param {string} id
   * @returns {{ success: boolean, message?: string }}
   */
  close(id) {
    const credit = this.getById(id);
    if (!credit) {
      return { success: false, message: 'Кредит не найден' };
    }
    if (credit.status === 'closed') {
      return { success: false, message: 'Кредит уже закрыт' };
    }

    this.store.batch((store) => {
      store.update('credits', id, {
        status: 'closed',
        remainingAmount: 0,
        closedAt: new Date().toISOString()
      }, false);

      historyService.add({
        type: 'credit_close',
        title: `Кредит закрыт: ${credit.name}`,
        description: 'Закрыт вручную',
        amount: Number(credit.remainingAmount) || 0,
        meta: { creditId: id },
        icon: '✅'
      }, false);
    });

    return { success: true };
  }

  /**
   * Удаляет кредит и его платежи.
   * @param {string} id
   * @returns {{ success: boolean, message?: string }}
   */
  remove(id) {
    const credit = this.getById(id);
    if (!credit) {
      return { success: false, message: 'Кредит не найден' };
    }

    this.store.batch((store) => {
      store.removeWhere('creditPayments', (p) => p.creditId === id, false);
      store.remove('credits', id, false);
      historyService.add({
        type: 'credit_add',
        title: `Удалён кредит: ${credit.name}`,
        description: credit.bank || '',
        amount: Number(credit.remainingAmount) || 0,
        meta: { creditId: id },
        icon: '💳'
      }, false);
    });

    return { success: true };
  }

  /**
   * Сводка для Dashboard.
   * @returns {object}
   */
  getSummary() {
    return {
      totalDebt: this.getTotalDebt(),
      monthlyPayments: this.getTotalMonthlyPayments(),
      activeCount: this.getActive().length,
      credits: this.getAllEnriched(),
      upcoming: this.getUpcomingPayments()
    };
  }
}

/** Единственный экземпляр сервиса кредитов. */
export const creditsService = new CreditsService();

export default creditsService;
