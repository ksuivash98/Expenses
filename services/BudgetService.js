/**
 * services/BudgetService.js — конверты и распределение
 */
import { TABLES } from '../config.js';
import { databaseService } from './DatabaseService.js';
import { incomeService } from './IncomeService.js';
import {
  colorByIndex, generateId, moneyEquals, parseAmount, percent,
  roundMoney, sortByDate, sumBy, todayISO, validateRequired
} from '../helpers/utils.js';

export class BudgetService {
  getCategories() {
    return [...databaseService.list(TABLES.budgetCategories)]
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));
  }

  getCategoryById(id) {
    return databaseService.find(TABLES.budgetCategories, id);
  }

  getTransactions() {
    return sortByDate(databaseService.list(TABLES.budgetTransactions), (t) => t.date, true);
  }

  getCategoryTransactions(categoryId) {
    return this.getTransactions().filter((tx) => tx.category_id === categoryId);
  }

  getCategoryBalance(categoryId) {
    let received = 0;
    let spent = 0;
    this.getCategoryTransactions(categoryId).forEach((tx) => {
      const amount = Number(tx.amount) || 0;
      if (amount >= 0) received += amount;
      else spent += Math.abs(amount);
    });
    received = roundMoney(received);
    spent = roundMoney(spent);
    return { balance: roundMoney(received - spent), received, spent };
  }

  getEnvelopes() {
    return this.getCategories().map((category) => {
      const stats = this.getCategoryBalance(category.id);
      return { ...category, ...stats, remaining: stats.balance };
    });
  }

  getSavingsEnvelope() {
    return this.getEnvelopes().find((e) => e.name === 'Накопления') || null;
  }

  getSavingsTotal() {
    return this.getSavingsEnvelope()?.balance || 0;
  }

  getTotalAllocatedBalance() {
    return sumBy(this.getEnvelopes(), (e) => e.balance);
  }

  getSummary() {
    const envelopes = this.getEnvelopes();
    return {
      envelopes,
      totalBalance: sumBy(envelopes, (e) => e.balance),
      totalReceived: sumBy(envelopes, (e) => e.received),
      totalSpent: sumBy(envelopes, (e) => e.spent),
      savings: this.getSavingsTotal(),
      freeMoney: incomeService.getFreeMoney(),
      totalIncome: incomeService.getTotalIncome(),
      totalDistributed: incomeService.getTotalDistributed(),
      distributionProgress: percent(incomeService.getTotalDistributed(), incomeService.getTotalIncome())
    };
  }

  async createCategory(data) {
    const validation = validateRequired(data, ['name']);
    if (!validation.valid) return { success: false, errors: validation.errors, message: 'Укажите название' };
    const name = String(data.name).trim();
    if (this.getCategories().some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return { success: false, message: 'Категория уже существует' };
    }
    const row = {
      id: generateId(),
      name,
      icon: String(data.icon || '📦').trim() || '📦',
      color: data.color || colorByIndex(this.getCategories().length),
      sort: this.getCategories().length + 1,
      carry_rule: data.carry_rule || 'balance',
      carry_max: data.carry_max != null ? roundMoney(parseAmount(data.carry_max)) : null
    };
    await databaseService.insert(TABLES.budgetCategories, row);
    return { success: true, data: row };
  }

  async updateCategory(id, data) {
    const existing = this.getCategoryById(id);
    if (!existing) return { success: false, message: 'Категория не найдена' };
    const name = String(data.name ?? existing.name).trim();
    if (!name) return { success: false, message: 'Название пустое' };
    if (this.getCategories().some((c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase())) {
      return { success: false, message: 'Категория уже существует' };
    }
    const updated = await databaseService.update(TABLES.budgetCategories, id, {
      name,
      icon: String(data.icon ?? existing.icon).trim() || existing.icon,
      color: data.color || existing.color,
      carry_rule: data.carry_rule || existing.carry_rule || 'balance',
      carry_max: data.carry_rule === 'max' || existing.carry_rule === 'max'
        ? roundMoney(parseAmount(data.carry_max ?? existing.carry_max))
        : null
    });
    return { success: true, data: updated };
  }

  isCategoryUsed(id) {
    const hasTx = databaseService.list(TABLES.budgetTransactions).some((t) => t.category_id === id);
    const hasExp = databaseService.list(TABLES.expenses).some((e) => e.budget_category === id);
    return hasTx || hasExp;
  }

  async deleteCategory(id) {
    const existing = this.getCategoryById(id);
    if (!existing) return { success: false, message: 'Категория не найдена' };
    if (this.isCategoryUsed(id)) return { success: false, message: 'Категория используется' };
    if (!moneyEquals(this.getCategoryBalance(id).balance, 0)) {
      return { success: false, message: 'Конверт не пуст' };
    }
    await databaseService.remove(TABLES.budgetCategories, id);
    return { success: true };
  }

  async distribute(incomeId, allocations) {
    const income = incomeService.getById(incomeId);
    if (!income) return { success: false, message: 'Доход не найден' };
    const remaining = incomeService.getRemainingForIncome(incomeId);
    if (remaining <= 0) return { success: false, message: 'Доход уже распределён' };

    const cleaned = (allocations || [])
      .map((item) => ({ categoryId: item.categoryId, amount: roundMoney(parseAmount(item.amount)) }))
      .filter((item) => item.amount > 0);

    if (!cleaned.length) return { success: false, message: 'Укажите суммы' };
    for (const item of cleaned) {
      if (!this.getCategoryById(item.categoryId)) return { success: false, message: 'Категория не найдена' };
    }

    const totalAllocated = roundMoney(sumBy(cleaned, (i) => i.amount));
    if (totalAllocated > remaining) {
      return { success: false, message: `Нельзя распределить больше остатка (${remaining})` };
    }
    if (!moneyEquals(totalAllocated, remaining)) {
      return {
        success: false,
        message: `Распределено ${totalAllocated}, осталось ${roundMoney(remaining - totalAllocated)}. Суммы должны совпадать.`
      };
    }

    const date = todayISO();
    await databaseService.batch(async (db) => {
      for (const item of cleaned) {
        const category = this.getCategoryById(item.categoryId);
        await db.insert(TABLES.budgetTransactions, {
          id: generateId(),
          category_id: item.categoryId,
          amount: item.amount,
          type: 'distribution',
          date,
          comment: `Распределение дохода «${income.title}»`,
          income_id: incomeId
        });
        await db.insert(TABLES.history, {
          id: generateId(),
          type: 'distribution',
          title: `В конверт «${category.name}»`,
          amount: item.amount,
          description: `Из дохода «${income.title}»`,
          icon: '📦',
          date: new Date().toISOString()
        });
      }
      await db.insert(TABLES.history, {
        id: generateId(),
        type: 'distribution',
        title: `Распределены деньги: ${income.title}`,
        amount: totalAllocated,
        icon: '📦',
        date: new Date().toISOString()
      });
    });

    return { success: true, data: { totalAllocated } };
  }

  async transfer(fromId, toId, amountValue, comment = '') {
    if (fromId === toId) return { success: false, message: 'Выберите разные конверты' };
    const from = this.getCategoryById(fromId);
    const to = this.getCategoryById(toId);
    if (!from || !to) return { success: false, message: 'Конверт не найден' };
    const amount = roundMoney(parseAmount(amountValue));
    if (!(amount > 0)) return { success: false, message: 'Сумма должна быть больше нуля' };
    if (amount > this.getCategoryBalance(fromId).balance) {
      return { success: false, message: `Недостаточно средств в «${from.name}»` };
    }

    const date = todayISO();
    await databaseService.batch(async (db) => {
      await db.insert(TABLES.budgetTransactions, {
        id: generateId(), category_id: fromId, amount: -amount, type: 'transfer_out',
        date, comment: comment || `Перевод в «${to.name}»`
      });
      await db.insert(TABLES.budgetTransactions, {
        id: generateId(), category_id: toId, amount, type: 'transfer_in',
        date, comment: comment || `Перевод из «${from.name}»`
      });
      await db.insert(TABLES.history, {
        id: generateId(), type: 'transfer', title: `Перевод: ${from.name} → ${to.name}`,
        amount, icon: '🔄', date: new Date().toISOString()
      });
    });
    return { success: true };
  }

  async spendFromEnvelope({ categoryId, amount: amountValue, type, comment = '', date = todayISO(), meta = {} }) {
    const category = this.getCategoryById(categoryId);
    if (!category) return { success: false, message: 'Конверт не найден' };
    const amount = roundMoney(parseAmount(amountValue));
    if (!(amount > 0)) return { success: false, message: 'Сумма должна быть больше нуля' };
    if (amount > this.getCategoryBalance(categoryId).balance) {
      return { success: false, message: `Недостаточно средств в «${category.name}»` };
    }
    const transaction = {
      id: generateId(),
      category_id: categoryId,
      amount: -amount,
      type: type || 'expense',
      date,
      comment,
      meta
    };
    await databaseService.insert(TABLES.budgetTransactions, transaction);
    return { success: true, transaction };
  }

  async addToEnvelope({ categoryId, amount: amountValue, type, comment = '', date = todayISO(), meta = {} }) {
    const category = this.getCategoryById(categoryId);
    if (!category) return { success: false, message: 'Конверт не найден' };
    const amount = roundMoney(parseAmount(amountValue));
    if (!(amount > 0)) return { success: false, message: 'Сумма должна быть больше нуля' };
    const transaction = {
      id: generateId(), category_id: categoryId, amount, type: type || 'refund', date, comment, meta
    };
    await databaseService.insert(TABLES.budgetTransactions, transaction);
    return { success: true, transaction };
  }
}

export const budgetService = new BudgetService();
export default budgetService;
