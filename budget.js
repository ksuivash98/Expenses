/**
 * budget.js
 * Конверты бюджета: категории, ручное распределение, переводы, балансы.
 * Главный модуль финансового менеджера.
 */

import { storage } from './storage.js';
import { historyService } from './history.js';
import { incomeService } from './income.js';
import {
  colorByIndex,
  generateId,
  moneyEquals,
  parseAmount,
  percent,
  roundMoney,
  sortByDate,
  sumBy,
  todayISO,
  validateRequired
} from './utils.js';

/**
 * Сервис бюджетных конвертов.
 */
export class BudgetService {
  /**
   * @param {import('./storage.js').Storage} [store]
   */
  constructor(store = storage) {
    this.store = store;
  }

  /**
   * Возвращает все категории (конверты).
   * @returns {Array<object>}
   */
  getCategories() {
    return this.store.getCollection('budgetCategories');
  }

  /**
   * Возвращает категорию по ID.
   * @param {string} id
   * @returns {object|null}
   */
  getCategoryById(id) {
    return this.store.findById('budgetCategories', id);
  }

  /**
   * Все транзакции конвертов.
   * @returns {Array<object>}
   */
  getTransactions() {
    return sortByDate(
      this.store.getCollection('budgetTransactions'),
      (item) => item.date || item.createdAt,
      true
    );
  }

  /**
   * Транзакции конкретного конверта.
   * @param {string} categoryId
   * @returns {Array<object>}
   */
  getCategoryTransactions(categoryId) {
    return this.getTransactions().filter((tx) => tx.categoryId === categoryId);
  }

  /**
   * Вычисляет баланс конверта динамически из транзакций.
   * @param {string} categoryId
   * @returns {{ balance: number, received: number, spent: number }}
   */
  getCategoryBalance(categoryId) {
    const txs = this.getCategoryTransactions(categoryId);
    let received = 0;
    let spent = 0;

    txs.forEach((tx) => {
      const amount = Number(tx.amount) || 0;
      if (amount >= 0) {
        received += amount;
      } else {
        spent += Math.abs(amount);
      }
    });

    received = roundMoney(received);
    spent = roundMoney(spent);

    return {
      balance: roundMoney(received - spent),
      received,
      spent
    };
  }

  /**
   * Обогащённый список конвертов с балансами.
   * @returns {Array<object>}
   */
  getEnvelopes() {
    return this.getCategories().map((category) => {
      const stats = this.getCategoryBalance(category.id);
      return {
        ...category,
        ...stats,
        remaining: stats.balance
      };
    });
  }

  /**
   * Конверт «Накопления», если есть.
   * @returns {object|null}
   */
  getSavingsEnvelope() {
    const envelopes = this.getEnvelopes();
    return envelopes.find((item) => item.id === 'cat_savings' || item.name === 'Накопления') || null;
  }

  /**
   * Общая сумма на всех конвертах.
   * @returns {number}
   */
  getTotalAllocatedBalance() {
    return sumBy(this.getEnvelopes(), (item) => item.balance);
  }

  /**
   * Сумма накоплений.
   * @returns {number}
   */
  getSavingsTotal() {
    const savings = this.getSavingsEnvelope();
    return savings ? savings.balance : 0;
  }

  /**
   * Создаёт новую категорию (конверт).
   * @param {object} data
   * @returns {{ success: boolean, data?: object, errors?: object, message?: string }}
   */
  createCategory(data) {
    const validation = validateRequired(data, ['name']);
    if (!validation.valid) {
      return { success: false, errors: validation.errors, message: 'Укажите название' };
    }

    const name = String(data.name).trim();
    const exists = this.getCategories().some(
      (cat) => cat.name.toLowerCase() === name.toLowerCase()
    );

    if (exists) {
      return { success: false, message: 'Категория с таким названием уже существует' };
    }

    const categories = this.getCategories();
    const record = {
      id: generateId(),
      name,
      icon: String(data.icon || '📦').trim() || '📦',
      color: data.color || colorByIndex(categories.length),
      createdAt: todayISO(),
      isDefault: false
    };

    this.store.add('budgetCategories', record);

    historyService.add({
      type: 'system',
      title: `Создан конверт «${record.name}»`,
      description: 'Новая категория бюджета',
      icon: record.icon
    });

    return { success: true, data: record };
  }

  /**
   * Обновляет название, иконку или цвет категории.
   * @param {string} id
   * @param {object} data
   * @returns {{ success: boolean, data?: object, message?: string }}
   */
  updateCategory(id, data) {
    const existing = this.getCategoryById(id);
    if (!existing) {
      return { success: false, message: 'Категория не найдена' };
    }

    const name = String(data.name ?? existing.name).trim();
    if (!name) {
      return { success: false, message: 'Название не может быть пустым' };
    }

    const duplicate = this.getCategories().some(
      (cat) => cat.id !== id && cat.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      return { success: false, message: 'Категория с таким названием уже существует' };
    }

    const updated = this.store.update('budgetCategories', id, {
      name,
      icon: String(data.icon ?? existing.icon).trim() || existing.icon,
      color: data.color || existing.color
    });

    return { success: true, data: updated };
  }

  /**
   * Проверяет, используется ли категория в транзакциях, расходах или целях.
   * @param {string} id
   * @returns {boolean}
   */
  isCategoryUsed(id) {
    const hasTx = this.store.getCollection('budgetTransactions')
      .some((tx) => tx.categoryId === id);
    const hasExpense = this.store.getCollection('expenses')
      .some((exp) => exp.envelopeId === id);
    const hasGoal = this.store.getCollection('goals')
      .some((goal) => goal.fromEnvelopeId === id);

    return hasTx || hasExpense || hasGoal;
  }

  /**
   * Удаляет категорию, если она не используется.
   * @param {string} id
   * @returns {{ success: boolean, message?: string }}
   */
  deleteCategory(id) {
    const existing = this.getCategoryById(id);
    if (!existing) {
      return { success: false, message: 'Категория не найдена' };
    }

    if (this.isCategoryUsed(id)) {
      return {
        success: false,
        message: 'Нельзя удалить категорию: она используется в операциях'
      };
    }

    const balance = this.getCategoryBalance(id);
    if (!moneyEquals(balance.balance, 0)) {
      return {
        success: false,
        message: 'Нельзя удалить конверт с ненулевым балансом'
      };
    }

    this.store.remove('budgetCategories', id);

    historyService.add({
      type: 'system',
      title: `Удалён конверт «${existing.name}»`,
      icon: existing.icon
    });

    return { success: true };
  }

  /**
   * Ручное распределение дохода по конвертам.
   * Сумма распределения должна точно равняться сумме дохода (или остатку).
   * @param {string} incomeId
   * @param {Array<{ categoryId: string, amount: number|string }>} allocations
   * @param {object} [options]
   * @param {boolean} [options.allowPartial=true] Разрешить распределять только остаток.
   * @returns {{ success: boolean, message?: string, data?: object }}
   */
  distribute(incomeId, allocations, options = {}) {
    const { allowPartial = true } = options;
    const income = incomeService.getById(incomeId);

    if (!income) {
      return { success: false, message: 'Доход не найден' };
    }

    const remaining = incomeService.getRemainingForIncome(incomeId);
    if (remaining <= 0) {
      return { success: false, message: 'Этот доход уже полностью распределён' };
    }

    const cleaned = (allocations || [])
      .map((item) => ({
        categoryId: item.categoryId,
        amount: roundMoney(parseAmount(item.amount))
      }))
      .filter((item) => item.amount > 0);

    if (!cleaned.length) {
      return { success: false, message: 'Укажите суммы для конвертов' };
    }

    for (const item of cleaned) {
      if (!this.getCategoryById(item.categoryId)) {
        return { success: false, message: 'Одна из категорий не найдена' };
      }
    }

    const totalAllocated = roundMoney(sumBy(cleaned, (item) => item.amount));
    const targetAmount = allowPartial ? remaining : Number(income.amount);

    if (!moneyEquals(totalAllocated, targetAmount) && !allowPartial) {
      return {
        success: false,
        message: `Сумма распределения (${totalAllocated}) должна равняться поступлению (${targetAmount})`
      };
    }

    if (allowPartial && !moneyEquals(totalAllocated, remaining)) {
      if (totalAllocated > remaining) {
        return {
          success: false,
          message: `Нельзя распределить больше остатка (${remaining})`
        };
      }
      return {
        success: false,
        message: `Распределено ${totalAllocated}, осталось распределить ${roundMoney(remaining - totalAllocated)}. Суммы должны совпадать.`
      };
    }

    const date = todayISO();
    const groupId = generateId();

    this.store.batch((store) => {
      cleaned.forEach((item) => {
        const category = this.getCategoryById(item.categoryId);
        store.add('budgetTransactions', {
          id: generateId(),
          type: 'distribution',
          categoryId: item.categoryId,
          incomeId,
          amount: item.amount,
          date,
          comment: `Распределение дохода «${income.name}»`,
          groupId,
          createdAt: new Date().toISOString()
        }, false);

        historyService.add({
          type: 'distribution',
          title: `В конверт «${category.name}»`,
          description: `Из дохода «${income.name}»`,
          amount: item.amount,
          meta: { incomeId, categoryId: item.categoryId, groupId },
          icon: '📦'
        }, false);
      });

      historyService.add({
        type: 'distribution',
        title: `Распределены деньги: ${income.name}`,
        description: `На ${cleaned.length} конверт(ов)`,
        amount: totalAllocated,
        meta: { incomeId, groupId },
        icon: '📦'
      }, false);
    });

    return {
      success: true,
      data: {
        incomeId,
        groupId,
        totalAllocated,
        remainingAfter: roundMoney(remaining - totalAllocated)
      }
    };
  }

  /**
   * Перевод средств между конвертами.
   * @param {string} fromId
   * @param {string} toId
   * @param {number|string} amountValue
   * @param {string} [comment]
   * @returns {{ success: boolean, message?: string }}
   */
  transfer(fromId, toId, amountValue, comment = '') {
    if (fromId === toId) {
      return { success: false, message: 'Выберите разные конверты' };
    }

    const from = this.getCategoryById(fromId);
    const to = this.getCategoryById(toId);

    if (!from || !to) {
      return { success: false, message: 'Конверт не найден' };
    }

    const amount = roundMoney(parseAmount(amountValue));
    if (!(amount > 0)) {
      return { success: false, message: 'Сумма должна быть больше нуля' };
    }

    const fromBalance = this.getCategoryBalance(fromId).balance;
    if (amount > fromBalance) {
      return {
        success: false,
        message: `Недостаточно средств в конверте «${from.name}» (доступно ${fromBalance})`
      };
    }

    const date = todayISO();
    const groupId = generateId();

    this.store.batch((store) => {
      store.add('budgetTransactions', {
        id: generateId(),
        type: 'transfer_out',
        categoryId: fromId,
        relatedCategoryId: toId,
        amount: -amount,
        date,
        comment: comment || `Перевод в «${to.name}»`,
        groupId,
        createdAt: new Date().toISOString()
      }, false);

      store.add('budgetTransactions', {
        id: generateId(),
        type: 'transfer_in',
        categoryId: toId,
        relatedCategoryId: fromId,
        amount,
        date,
        comment: comment || `Перевод из «${from.name}»`,
        groupId,
        createdAt: new Date().toISOString()
      }, false);

      historyService.add({
        type: 'transfer',
        title: `Перевод: ${from.name} → ${to.name}`,
        description: comment || 'Перемещение между конвертами',
        amount,
        meta: { fromId, toId, groupId },
        icon: '🔄'
      }, false);
    });

    return { success: true };
  }

  /**
   * Списание из конверта (используется расходами, кредитами, целями).
   * @param {object} params
   * @param {string} params.categoryId
   * @param {number} params.amount Положительная сумма списания.
   * @param {string} params.type
   * @param {string} [params.comment]
   * @param {string} [params.date]
   * @param {object} [params.meta]
   * @param {boolean} [params.autoSave=true]
   * @returns {{ success: boolean, message?: string, transaction?: object }}
   */
  spendFromEnvelope(params) {
    const {
      categoryId,
      amount: amountValue,
      type,
      comment = '',
      date = todayISO(),
      meta = {},
      autoSave = true
    } = params;

    const category = this.getCategoryById(categoryId);
    if (!category) {
      return { success: false, message: 'Конверт не найден' };
    }

    const amount = roundMoney(parseAmount(amountValue));
    if (!(amount > 0)) {
      return { success: false, message: 'Сумма должна быть больше нуля' };
    }

    const balance = this.getCategoryBalance(categoryId).balance;
    if (amount > balance) {
      return {
        success: false,
        message: `Недостаточно средств в конверте «${category.name}» (доступно ${balance})`
      };
    }

    const transaction = {
      id: generateId(),
      type: type || 'expense',
      categoryId,
      amount: -amount,
      date,
      comment,
      meta,
      createdAt: new Date().toISOString()
    };

    if (autoSave) {
      this.store.add('budgetTransactions', transaction);
    } else {
      this.store.add('budgetTransactions', transaction, false);
    }

    return { success: true, transaction };
  }

  /**
   * Возврат средств в конверт (отмена операции и т.п.).
   * @param {object} params
   * @returns {{ success: boolean, transaction?: object, message?: string }}
   */
  addToEnvelope(params) {
    const {
      categoryId,
      amount: amountValue,
      type,
      comment = '',
      date = todayISO(),
      meta = {},
      autoSave = true
    } = params;

    const category = this.getCategoryById(categoryId);
    if (!category) {
      return { success: false, message: 'Конверт не найден' };
    }

    const amount = roundMoney(parseAmount(amountValue));
    if (!(amount > 0)) {
      return { success: false, message: 'Сумма должна быть больше нуля' };
    }

    const transaction = {
      id: generateId(),
      type: type || 'refund',
      categoryId,
      amount,
      date,
      comment,
      meta,
      createdAt: new Date().toISOString()
    };

    this.store.add('budgetTransactions', transaction, autoSave);
    return { success: true, transaction };
  }

  /**
   * Сводка по конвертам для Dashboard и аналитики.
   * @returns {object}
   */
  getSummary() {
    const envelopes = this.getEnvelopes();
    const totalBalance = sumBy(envelopes, (item) => item.balance);
    const totalReceived = sumBy(envelopes, (item) => item.received);
    const totalSpent = sumBy(envelopes, (item) => item.spent);

    return {
      envelopes,
      totalBalance,
      totalReceived,
      totalSpent,
      savings: this.getSavingsTotal(),
      freeMoney: incomeService.getFreeMoney(),
      totalIncome: incomeService.getTotalIncome(),
      totalDistributed: incomeService.getTotalDistributed(),
      distributionProgress: percent(
        incomeService.getTotalDistributed(),
        incomeService.getTotalIncome()
      )
    };
  }
}

/** Единственный экземпляр сервиса бюджета. */
export const budgetService = new BudgetService();

export default budgetService;
