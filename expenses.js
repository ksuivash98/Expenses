/**
 * expenses.js
 * Покупки и расходы: списание только из выбранного конверта.
 */

import { storage } from './storage.js';
import { historyService } from './history.js';
import { budgetService } from './budget.js';
import {
  generateId,
  parseAmount,
  roundMoney,
  sortByDate,
  sumBy,
  todayISO,
  validateRequired,
  groupBy
} from './utils.js';

/**
 * Сервис расходов и покупок.
 */
export class ExpensesService {
  /**
   * @param {import('./storage.js').Storage} [store]
   */
  constructor(store = storage) {
    this.store = store;
  }

  /**
   * Категории покупок.
   * @returns {Array<object>}
   */
  getCategories() {
    return this.store.getCollection('expenseCategories');
  }

  /**
   * Все расходы (новые сверху).
   * @returns {Array<object>}
   */
  getAll() {
    return sortByDate(
      this.store.getCollection('expenses'),
      (item) => item.date || item.createdAt,
      true
    );
  }

  /**
   * Расход по ID.
   * @param {string} id
   * @returns {object|null}
   */
  getById(id) {
    return this.store.findById('expenses', id);
  }

  /**
   * Обогащённый список расходов с названиями категорий и конвертов.
   * @returns {Array<object>}
   */
  getAllEnriched() {
    const categories = this.getCategories();
    const envelopes = budgetService.getCategories();

    return this.getAll().map((expense) => {
      const category = categories.find((c) => c.id === expense.categoryId);
      const envelope = envelopes.find((e) => e.id === expense.envelopeId);
      return {
        ...expense,
        categoryName: category?.name || expense.categoryName || 'Прочее',
        categoryIcon: category?.icon || '🛒',
        envelopeName: envelope?.name || '—',
        envelopeIcon: envelope?.icon || '📦'
      };
    });
  }

  /**
   * Общая сумма расходов.
   * @returns {number}
   */
  getTotalSpent() {
    return sumBy(this.getAll(), (item) => Number(item.amount) || 0);
  }

  /**
   * Валидация расхода.
   * @param {object} data
   * @returns {{ valid: boolean, errors: Object.<string, string> }}
   */
  validate(data) {
    const base = validateRequired(data, ['name', 'categoryId', 'envelopeId', 'amount', 'date']);
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
   * Добавляет покупку/расход и списывает сумму с конверта.
   * @param {object} data
   * @returns {{ success: boolean, data?: object, errors?: object, message?: string }}
   */
  add(data) {
    const validation = this.validate(data);
    if (!validation.valid) {
      return { success: false, errors: validation.errors, message: 'Проверьте заполнение формы' };
    }

    const amount = roundMoney(parseAmount(data.amount));
    const category = this.getCategories().find((c) => c.id === data.categoryId);
    const envelope = budgetService.getCategoryById(data.envelopeId);

    if (!category) {
      return { success: false, message: 'Категория покупки не найдена' };
    }
    if (!envelope) {
      return { success: false, message: 'Конверт не найден' };
    }

    const balance = budgetService.getCategoryBalance(data.envelopeId).balance;
    if (amount > balance) {
      return {
        success: false,
        message: `Недостаточно средств в конверте «${envelope.name}» (доступно ${balance})`
      };
    }

    const record = {
      id: generateId(),
      name: String(data.name).trim(),
      categoryId: data.categoryId,
      categoryName: category.name,
      envelopeId: data.envelopeId,
      amount,
      date: data.date || todayISO(),
      comment: String(data.comment || '').trim(),
      createdAt: new Date().toISOString()
    };

    this.store.batch((store) => {
      const spendResult = budgetService.spendFromEnvelope({
        categoryId: record.envelopeId,
        amount: record.amount,
        type: 'expense',
        comment: `Покупка: ${record.name}`,
        date: record.date,
        meta: { expenseId: record.id },
        autoSave: false
      });

      if (!spendResult.success) {
        throw new Error(spendResult.message || 'Ошибка списания');
      }

      record.transactionId = spendResult.transaction.id;
      store.add('expenses', record, false);

      historyService.add({
        type: 'expense',
        title: `Покупка: ${record.name}`,
        description: `${category.name} · конверт «${envelope.name}»${record.comment ? ` — ${record.comment}` : ''}`,
        amount: record.amount,
        meta: { expenseId: record.id, envelopeId: record.envelopeId },
        icon: category.icon || '🛒'
      }, false);
    });

    return { success: true, data: this.getById(record.id) };
  }

  /**
   * Удаляет расход и возвращает средства в конверт.
   * @param {string} id
   * @returns {{ success: boolean, message?: string }}
   */
  remove(id) {
    const expense = this.getById(id);
    if (!expense) {
      return { success: false, message: 'Расход не найден' };
    }

    this.store.batch((store) => {
      // Возвращаем средства отдельной транзакцией, исходное списание оставляем в истории конверта.
      budgetService.addToEnvelope({
        categoryId: expense.envelopeId,
        amount: expense.amount,
        type: 'expense_refund',
        comment: `Отмена покупки: ${expense.name}`,
        date: todayISO(),
        meta: { expenseId: id },
        autoSave: false
      });

      store.remove('expenses', id, false);

      historyService.add({
        type: 'expense',
        title: `Удалена покупка: ${expense.name}`,
        description: 'Средства возвращены в конверт',
        amount: expense.amount,
        meta: { expenseId: id },
        icon: '🛒'
      }, false);
    });

    return { success: true };
  }

  /**
   * Структура расходов по категориям покупок.
   * @returns {Array<{ name: string, amount: number, icon: string }>}
   */
  getStructureByCategory() {
    const enriched = this.getAllEnriched();
    const grouped = groupBy(enriched, (item) => item.categoryId || 'other');

    return Object.values(grouped).map((items) => ({
      name: items[0].categoryName,
      icon: items[0].categoryIcon,
      amount: sumBy(items, (i) => Number(i.amount) || 0)
    })).sort((a, b) => b.amount - a.amount);
  }

  /**
   * Структура расходов по конвертам.
   * @returns {Array<{ name: string, amount: number }>}
   */
  getStructureByEnvelope() {
    const enriched = this.getAllEnriched();
    const grouped = groupBy(enriched, (item) => item.envelopeId || 'other');

    return Object.values(grouped).map((items) => ({
      name: items[0].envelopeName,
      amount: sumBy(items, (i) => Number(i.amount) || 0)
    })).sort((a, b) => b.amount - a.amount);
  }

  /**
   * Расходы за указанный месяц.
   * @param {number} year
   * @param {number} month Индекс 0–11.
   * @returns {Array<object>}
   */
  getByMonth(year, month) {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    return this.getAllEnriched().filter((item) => String(item.date).startsWith(prefix));
  }

  /**
   * Сводка для Dashboard.
   * @returns {object}
   */
  getSummary() {
    return {
      totalSpent: this.getTotalSpent(),
      count: this.getAll().length,
      recent: this.getAllEnriched().slice(0, 5),
      byCategory: this.getStructureByCategory()
    };
  }
}

/** Единственный экземпляр сервиса расходов. */
export const expensesService = new ExpensesService();

export default expensesService;
