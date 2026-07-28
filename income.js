/**
 * income.js
 * Бизнес-логика доходов.
 * Доход увеличивает «свободные деньги», без автоматического распределения.
 */

import { storage } from './storage.js';
import { historyService } from './history.js';
import {
  generateId,
  parseAmount,
  roundMoney,
  sortByDate,
  sumBy,
  todayISO,
  validateRequired
} from './utils.js';

/**
 * Сервис управления доходами.
 */
export class IncomeService {
  /**
   * @param {import('./storage.js').Storage} [store]
   */
  constructor(store = storage) {
    this.store = store;
  }

  /**
   * Возвращает список источников дохода.
   * @returns {string[]}
   */
  getSources() {
    return this.store.getCollection('incomeSources');
  }

  /**
   * Возвращает все доходы (новые сверху).
   * @returns {Array<object>}
   */
  getAll() {
    return sortByDate(this.store.getCollection('income'), (item) => item.date || item.createdAt, true);
  }

  /**
   * Возвращает доход по ID.
   * @param {string} id
   * @returns {object|null}
   */
  getById(id) {
    return this.store.findById('income', id);
  }

  /**
   * Сумма всех доходов.
   * @returns {number}
   */
  getTotalIncome() {
    return sumBy(this.getAll(), (item) => Number(item.amount) || 0);
  }

  /**
   * Сумма уже распределённых средств по всем доходам.
   * Считается из транзакций типа distribution.
   * @returns {number}
   */
  getTotalDistributed() {
    const transactions = this.store.getCollection('budgetTransactions')
      .filter((tx) => tx.type === 'distribution' && tx.amount > 0);

    return sumBy(transactions, (tx) => Number(tx.amount) || 0);
  }

  /**
   * Сколько уже распределено с конкретного дохода.
   * @param {string} incomeId
   * @returns {number}
   */
  getDistributedForIncome(incomeId) {
    const transactions = this.store.getCollection('budgetTransactions')
      .filter((tx) => tx.type === 'distribution' && tx.incomeId === incomeId && tx.amount > 0);

    return sumBy(transactions, (tx) => Number(tx.amount) || 0);
  }

  /**
   * Свободные (ещё не распределённые) деньги.
   * @returns {number}
   */
  getFreeMoney() {
    return roundMoney(this.getTotalIncome() - this.getTotalDistributed());
  }

  /**
   * Остаток к распределению по конкретному доходу.
   * @param {string} incomeId
   * @returns {number}
   */
  getRemainingForIncome(incomeId) {
    const income = this.getById(incomeId);
    if (!income) return 0;
    return roundMoney(Number(income.amount) - this.getDistributedForIncome(incomeId));
  }

  /**
   * Доходы, у которых ещё есть нераспределённый остаток.
   * @returns {Array<object>}
   */
  getUndistributed() {
    return this.getAll()
      .map((income) => {
        const distributed = this.getDistributedForIncome(income.id);
        const remaining = roundMoney(Number(income.amount) - distributed);
        return {
          ...income,
          distributed,
          remaining
        };
      })
      .filter((income) => income.remaining > 0.009);
  }

  /**
   * Валидирует данные дохода.
   * @param {object} data
   * @returns {{ valid: boolean, errors: Object.<string, string> }}
   */
  validate(data) {
    const base = validateRequired(data, ['name', 'source', 'amount', 'date']);
    const errors = { ...base.errors };
    const amount = parseAmount(data.amount);

    if (!(amount > 0)) {
      errors.amount = 'Сумма должна быть больше нуля';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors
    };
  }

  /**
   * Добавляет новый доход.
   * @param {object} data
   * @returns {{ success: boolean, data?: object, errors?: object, message?: string }}
   */
  add(data) {
    const validation = this.validate(data);
    if (!validation.valid) {
      return { success: false, errors: validation.errors, message: 'Проверьте заполнение формы' };
    }

    const amount = roundMoney(parseAmount(data.amount));
    const record = {
      id: generateId(),
      name: String(data.name).trim(),
      source: String(data.source).trim(),
      amount,
      date: data.date || todayISO(),
      comment: String(data.comment || '').trim(),
      createdAt: new Date().toISOString()
    };

    this.store.batch((store) => {
      store.add('income', record, false);
      historyService.add({
        type: 'income',
        title: `Получен доход: ${record.name}`,
        description: `${record.source}${record.comment ? ` — ${record.comment}` : ''}`,
        amount: record.amount,
        meta: { incomeId: record.id },
        icon: '💰'
      }, false);
    });

    return { success: true, data: record };
  }

  /**
   * Обновляет существующий доход.
   * Нельзя уменьшить сумму ниже уже распределённой.
   * @param {string} id
   * @param {object} data
   * @returns {{ success: boolean, data?: object, errors?: object, message?: string }}
   */
  update(id, data) {
    const existing = this.getById(id);
    if (!existing) {
      return { success: false, message: 'Доход не найден' };
    }

    const validation = this.validate(data);
    if (!validation.valid) {
      return { success: false, errors: validation.errors, message: 'Проверьте заполнение формы' };
    }

    const amount = roundMoney(parseAmount(data.amount));
    const distributed = this.getDistributedForIncome(id);

    if (amount < distributed) {
      return {
        success: false,
        message: `Нельзя уменьшить сумму ниже уже распределённой (${distributed})`
      };
    }

    const updated = this.store.update('income', id, {
      name: String(data.name).trim(),
      source: String(data.source).trim(),
      amount,
      date: data.date || existing.date,
      comment: String(data.comment || '').trim()
    });

    historyService.add({
      type: 'income',
      title: `Изменён доход: ${updated.name}`,
      description: 'Параметры дохода обновлены',
      amount: updated.amount,
      meta: { incomeId: id },
      icon: '💰'
    });

    return { success: true, data: updated };
  }

  /**
   * Удаляет доход, если с него ничего не распределено.
   * @param {string} id
   * @returns {{ success: boolean, message?: string }}
   */
  remove(id) {
    const existing = this.getById(id);
    if (!existing) {
      return { success: false, message: 'Доход не найден' };
    }

    const distributed = this.getDistributedForIncome(id);
    if (distributed > 0) {
      return {
        success: false,
        message: 'Нельзя удалить доход, с которого уже распределены средства'
      };
    }

    this.store.batch((store) => {
      store.remove('income', id, false);
      historyService.add({
        type: 'income',
        title: `Удалён доход: ${existing.name}`,
        description: existing.source,
        amount: existing.amount,
        meta: { incomeId: id },
        icon: '💰'
      }, false);
    });

    return { success: true };
  }

  /**
   * Статистика доходов по источникам.
   * @returns {Array<{ source: string, amount: number }>}
   */
  getStructureBySource() {
    const map = new Map();
    this.getAll().forEach((item) => {
      const key = item.source || 'Другое';
      map.set(key, roundMoney((map.get(key) || 0) + Number(item.amount)));
    });

    return [...map.entries()]
      .map(([source, amount]) => ({ source, amount }))
      .sort((a, b) => b.amount - a.amount);
  }

  /**
   * Сводка по доходам для Dashboard.
   * @returns {object}
   */
  getSummary() {
    return {
      totalIncome: this.getTotalIncome(),
      totalDistributed: this.getTotalDistributed(),
      freeMoney: this.getFreeMoney(),
      count: this.getAll().length,
      undistributedCount: this.getUndistributed().length
    };
  }
}

/** Единственный экземпляр сервиса доходов. */
export const incomeService = new IncomeService();

export default incomeService;
