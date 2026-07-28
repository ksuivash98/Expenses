/**
 * expenses.js — расходы и покупки
 */
import { storage } from './storage.js';
import { budgetService } from './budget.js';
import {
  generateId, groupBy, parseAmount, roundMoney, sortByDate, sumBy, todayISO, validateRequired
} from './utils.js';

export const EXPENSE_CATEGORIES = [
  'Продукты', 'Транспорт', 'Кафе', 'Здоровье', 'Образование',
  'Развлечения', 'Дом', 'Подарки', 'Связь', 'Прочее'
];

export class ExpensesService {
  getAll() {
    return sortByDate(storage.list('expenses'), (e) => e.date, true);
  }

  getById(id) {
    return storage.find('expenses', id);
  }

  getCategories() {
    return EXPENSE_CATEGORIES;
  }

  getTotal() {
    return sumBy(this.getAll(), (e) => Number(e.amount) || 0);
  }

  getStructure() {
    const map = new Map();
    this.getAll().forEach((item) => {
      const key = item.category || 'Прочее';
      map.set(key, roundMoney((map.get(key) || 0) + Number(item.amount)));
    });
    return [...map.entries()].map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }

  getSummary() {
    return {
      total: this.getTotal(),
      count: this.getAll().length,
      structure: this.getStructure(),
      byShop: Object.entries(groupBy(this.getAll(), (e) => e.shop || 'Без магазина'))
        .map(([shop, items]) => ({ shop, amount: sumBy(items, (i) => Number(i.amount) || 0) }))
        .sort((a, b) => b.amount - a.amount)
    };
  }

  validate(data) {
    const base = validateRequired(data, ['title', 'amount', 'date', 'budget_category', 'category']);
    const errors = { ...base.errors };
    if (!(parseAmount(data.amount) > 0)) errors.amount = 'Сумма должна быть больше нуля';
    return { valid: Object.keys(errors).length === 0, errors };
  }

  add(data) {
    const validation = this.validate(data);
    if (!validation.valid) return { success: false, errors: validation.errors, message: 'Проверьте форму' };

    const category = budgetService.getCategoryById(data.budget_category);
    if (!category) return { success: false, message: 'Конверт не найден' };

    const amount = roundMoney(parseAmount(data.amount));
    const balance = budgetService.getCategoryBalance(category.id).balance;
    if (amount > balance) {
      return { success: false, message: `Недостаточно средств в «${category.name}» (доступно ${balance})` };
    }

    const row = {
      id: generateId(),
      title: String(data.title).trim(),
      amount,
      date: data.date || todayISO(),
      category: String(data.category).trim(),
      shop: String(data.shop || '').trim(),
      budget_category: category.id,
      comment: String(data.comment || '').trim()
    };

    storage.batch((db) => {
      db.add('expenses', row);
      db.add('budgetTransactions', {
        id: generateId(),
        category_id: category.id,
        amount: -amount,
        type: 'expense',
        date: row.date,
        comment: row.title,
        expense_id: row.id
      });
      db.add('history', {
        id: generateId(),
        type: 'expense',
        title: `Покупка: ${row.title}`,
        amount,
        description: `${category.name}${row.shop ? ` · ${row.shop}` : ''}`,
        icon: '🛒',
        date: new Date().toISOString()
      });
    });

    return { success: true, data: row };
  }

  remove(id) {
    const existing = this.getById(id);
    if (!existing) return { success: false, message: 'Расход не найден' };

    storage.batch((db) => {
      db.remove('expenses', id);
      storage.list('budgetTransactions')
        .filter((tx) => tx.expense_id === id)
        .forEach((tx) => db.remove('budgetTransactions', tx.id));
    });
    return { success: true };
  }
}

export const expensesService = new ExpensesService();
export default expensesService;
