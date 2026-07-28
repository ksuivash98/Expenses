/**
 * services/ExpenseService.js
 */
import { TABLES } from '../config.js';
import { databaseService } from './DatabaseService.js';
import { budgetService } from './BudgetService.js';
import {
  generateId, groupBy, parseAmount, roundMoney, sortByDate, sumBy,
  todayISO, validateRequired
} from '../helpers/utils.js';

export const EXPENSE_CATEGORIES = [
  { id: 'Продукты', name: 'Продукты', icon: '🛒' },
  { id: 'Дом', name: 'Дом', icon: '🏠' },
  { id: 'Красота', name: 'Красота', icon: '💄' },
  { id: 'Одежда', name: 'Одежда', icon: '👕' },
  { id: 'Аптека', name: 'Аптека', icon: '💊' },
  { id: 'Транспорт', name: 'Транспорт', icon: '🚌' },
  { id: 'Развлечения', name: 'Развлечения', icon: '🎬' },
  { id: 'Прочее', name: 'Прочее', icon: '📦' }
];

export class ExpenseService {
  getCategories() {
    return EXPENSE_CATEGORIES;
  }

  getAll() {
    return sortByDate(databaseService.list(TABLES.expenses), (e) => e.date, true);
  }

  getById(id) {
    return databaseService.find(TABLES.expenses, id);
  }

  getAllEnriched() {
    const envelopes = budgetService.getCategories();
    return this.getAll().map((expense) => {
      const envelope = envelopes.find((e) => e.id === expense.budget_category);
      const cat = EXPENSE_CATEGORIES.find((c) => c.id === expense.category);
      return {
        ...expense,
        categoryName: expense.category,
        categoryIcon: cat?.icon || '🛒',
        envelopeName: envelope?.name || '—',
        envelopeIcon: envelope?.icon || '📦'
      };
    });
  }

  getTotalSpent() {
    return sumBy(this.getAll(), (e) => Number(e.amount) || 0);
  }

  getStructureByCategory() {
    const enriched = this.getAllEnriched();
    const grouped = groupBy(enriched, (i) => i.category || 'Прочее');
    return Object.values(grouped).map((items) => ({
      name: items[0].categoryName,
      icon: items[0].categoryIcon,
      amount: sumBy(items, (i) => Number(i.amount) || 0)
    })).sort((a, b) => b.amount - a.amount);
  }

  getSummary() {
    return {
      totalSpent: this.getTotalSpent(),
      count: this.getAll().length,
      recent: this.getAllEnriched().slice(0, 5),
      byCategory: this.getStructureByCategory()
    };
  }

  async add(data) {
    const validation = validateRequired(data, ['name', 'category', 'budget_category', 'amount', 'date']);
    if (!validation.valid) return { success: false, errors: validation.errors, message: 'Проверьте форму' };
    const amount = roundMoney(parseAmount(data.amount));
    if (!(amount > 0)) return { success: false, message: 'Сумма должна быть больше нуля' };

    const envelope = budgetService.getCategoryById(data.budget_category);
    if (!envelope) return { success: false, message: 'Конверт не найден' };
    if (amount > budgetService.getCategoryBalance(data.budget_category).balance) {
      return { success: false, message: `Недостаточно средств в «${envelope.name}»` };
    }

    const row = {
      id: generateId(),
      name: String(data.name).trim(),
      category: String(data.category).trim(),
      budget_category: data.budget_category,
      amount,
      date: data.date || todayISO(),
      store: String(data.store || '').trim(),
      comment: String(data.comment || '').trim()
    };

    await databaseService.batch(async (db) => {
      await db.insert(TABLES.budgetTransactions, {
        id: generateId(),
        category_id: row.budget_category,
        amount: -amount,
        type: 'expense',
        date: row.date,
        comment: `Покупка: ${row.name}`,
        meta: { expenseId: row.id }
      });
      await db.insert(TABLES.expenses, row);
      await db.insert(TABLES.history, {
        id: generateId(),
        type: 'expense',
        title: `Покупка: ${row.name}`,
        amount,
        description: `${row.category} · ${envelope.name}`,
        icon: '🛒',
        date: new Date().toISOString()
      });
    });

    return { success: true, data: row };
  }

  async remove(id) {
    const expense = this.getById(id);
    if (!expense) return { success: false, message: 'Расход не найден' };

    await databaseService.batch(async (db) => {
      if (expense.budget_category) {
        await db.insert(TABLES.budgetTransactions, {
          id: generateId(),
          category_id: expense.budget_category,
          amount: Number(expense.amount),
          type: 'expense_refund',
          date: todayISO(),
          comment: `Отмена покупки: ${expense.name || expense.category}`
        });
      }
      await db.remove(TABLES.expenses, id);
    });

    return { success: true };
  }
}

export const expenseService = new ExpenseService();
export default expenseService;
