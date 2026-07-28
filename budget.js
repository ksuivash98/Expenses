/**
 * budget.js — конверты и распределение + периоды
 */
import { storage } from './storage.js';
import { incomeService } from './income.js';
import {
  CARRY_RULE_LABELS, colorByIndex, generateId, getMonthName, moneyEquals,
  parseAmount, percent, roundMoney, sortByDate, sumBy, todayISO, validateRequired
} from './utils.js';

export class BudgetService {
  getCategories() {
    return [...storage.list('budgetCategories')].sort((a, b) => (a.sort || 0) - (b.sort || 0));
  }

  getCategoryById(id) {
    return storage.find('budgetCategories', id);
  }

  getTransactions() {
    return sortByDate(storage.list('budgetTransactions'), (t) => t.date, true);
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
      return {
        ...category,
        ...stats,
        remaining: stats.balance,
        carryLabel: CARRY_RULE_LABELS[category.carry_rule] || CARRY_RULE_LABELS.balance
      };
    });
  }

  getSavingsTotal() {
    const savings = this.getEnvelopes().find((e) => e.name === 'Накопления');
    return savings ? savings.balance : 0;
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

  createCategory(data) {
    const validation = validateRequired(data, ['name']);
    if (!validation.valid) return { success: false, errors: validation.errors, message: 'Укажите название' };
    const name = String(data.name).trim();
    if (this.getCategories().some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return { success: false, message: 'Категория уже существует' };
    }
    const row = storage.add('budgetCategories', {
      id: generateId(),
      name,
      icon: String(data.icon || '📦').trim() || '📦',
      color: data.color || colorByIndex(this.getCategories().length),
      sort: this.getCategories().length + 1,
      carry_rule: data.carry_rule || 'balance',
      carry_max: data.carry_max != null ? roundMoney(parseAmount(data.carry_max)) : null
    });
    return { success: true, data: row };
  }

  updateCategory(id, data) {
    const existing = this.getCategoryById(id);
    if (!existing) return { success: false, message: 'Категория не найдена' };
    const name = String(data.name ?? existing.name).trim();
    if (!name) return { success: false, message: 'Название пустое' };
    const updated = storage.update('budgetCategories', id, {
      name,
      icon: String(data.icon ?? existing.icon).trim() || existing.icon,
      color: data.color || existing.color,
      carry_rule: data.carry_rule || existing.carry_rule || 'balance',
      carry_max: (data.carry_rule || existing.carry_rule) === 'max'
        ? roundMoney(parseAmount(data.carry_max ?? existing.carry_max))
        : null
    });
    return { success: true, data: updated };
  }

  isCategoryUsed(id) {
    return storage.list('budgetTransactions').some((t) => t.category_id === id)
      || storage.list('expenses').some((e) => e.budget_category === id);
  }

  deleteCategory(id) {
    const existing = this.getCategoryById(id);
    if (!existing) return { success: false, message: 'Категория не найдена' };
    if (this.isCategoryUsed(id)) return { success: false, message: 'Категория используется' };
    if (!moneyEquals(this.getCategoryBalance(id).balance, 0)) {
      return { success: false, message: 'Конверт не пуст' };
    }
    storage.remove('budgetCategories', id);
    return { success: true };
  }

  distribute(incomeId, allocations) {
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
    storage.batch((db) => {
      cleaned.forEach((item) => {
        const category = this.getCategoryById(item.categoryId);
        db.add('budgetTransactions', {
          id: generateId(),
          category_id: item.categoryId,
          amount: item.amount,
          type: 'distribution',
          date,
          comment: `Распределение дохода «${income.title}»`,
          income_id: incomeId
        });
        db.add('history', {
          id: generateId(),
          type: 'distribution',
          title: `В конверт «${category.name}»`,
          amount: item.amount,
          description: `Из дохода «${income.title}»`,
          icon: '📦',
          date: new Date().toISOString()
        });
      });
      db.add('history', {
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

  transfer(fromId, toId, amountValue, comment = '') {
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
    storage.batch((db) => {
      db.add('budgetTransactions', {
        id: generateId(), category_id: fromId, amount: -amount, type: 'transfer_out',
        date, comment: comment || `Перевод в «${to.name}»`
      });
      db.add('budgetTransactions', {
        id: generateId(), category_id: toId, amount, type: 'transfer_in',
        date, comment: comment || `Перевод из «${from.name}»`
      });
      db.add('history', {
        id: generateId(), type: 'transfer', title: `Перевод: ${from.name} → ${to.name}`,
        amount, icon: '🔄', date: new Date().toISOString()
      });
    });
    return { success: true };
  }

  /* ---------- периоды ---------- */

  getAllPeriods() {
    return [...storage.list('financialPeriods', { allPeriods: true })]
      .sort((a, b) => (b.year - a.year) || (b.month - a.month));
  }

  formatPeriodTitle(period) {
    if (!period) return 'Период не выбран';
    return `${getMonthName(Number(period.month) - 1)} ${period.year}`;
  }

  switchPeriod(periodId) {
    try {
      const period = storage.setCurrentPeriod(periodId);
      return { success: true, data: period };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  _categoryBalanceInPeriod(periodId, categoryId) {
    const txs = storage.listByPeriod('budgetTransactions', periodId)
      .filter((tx) => tx.category_id === categoryId);
    let received = 0;
    let spent = 0;
    txs.forEach((tx) => {
      const amount = Number(tx.amount) || 0;
      if (amount >= 0) received += amount;
      else spent += Math.abs(amount);
    });
    return roundMoney(received - spent);
  }

  _applyCarryRule(category, balance) {
    const positive = Math.max(0, balance);
    const rule = category?.carry_rule || 'balance';
    if (rule === 'never' || rule === 'zero') return 0;
    if (rule === 'max') return roundMoney(Math.min(positive, Number(category.carry_max) || 0));
    return positive;
  }

  openPeriod(year, month, options = {}) {
    const {
      fromPeriodId = storage.getCurrentPeriodId(),
      transferBalances = true,
      copyCategories = true,
      copyCredits = true,
      copyUtilities = true,
      copyGoals = true,
      switchTo = true
    } = options;

    let target = this.getAllPeriods().find((p) => p.year === year && p.month === month);
    if (!target) {
      target = storage.add('financialPeriods', {
        id: generateId(),
        year,
        month,
        status: 'future',
        carry_over_mode: 'ask',
        unlock_edit: false,
        closed_at: null
      }, { skipPeriod: true });
      storage.add('periodPlans', {
        id: generateId(),
        period_id: target.id,
        year,
        month,
        planned_income: 0,
        actual_income: 0,
        planned_expense: 0,
        actual_expense: 0,
        planned_savings: 0,
        actual_savings: 0,
        planned_credits: 0,
        actual_credits: 0
      }, { skipPeriod: true });
    }

    const source = fromPeriodId ? storage.find('financialPeriods', fromPeriodId) : null;
    if (!source || source.id === target.id) {
      if (switchTo) storage.setCurrentPeriod(target.id);
      return { success: true, data: target };
    }

    if (storage.listByPeriod('budgetCategories', target.id).length) {
      if (switchTo) storage.setCurrentPeriod(target.id);
      return { success: true, data: target, message: 'Период уже заполнен' };
    }

    const categoryIdMap = new Map();
    const targetMeta = { period_id: target.id, year: target.year, month: target.month };

    storage.batch((db) => {
      if (copyCategories || transferBalances) {
        storage.listByPeriod('budgetCategories', source.id).forEach((cat) => {
          const newId = generateId();
          categoryIdMap.set(cat.id, newId);
          db.add('budgetCategories', {
            id: newId,
            ...targetMeta,
            name: cat.name,
            icon: cat.icon,
            color: cat.color,
            sort: cat.sort,
            carry_rule: cat.carry_rule || 'balance',
            carry_max: cat.carry_max
          }, { skipPeriod: true });
        });
      }

      if (transferBalances) {
        categoryIdMap.forEach((newId, oldId) => {
          const cat = storage.find('budgetCategories', oldId);
          const carryAmount = this._applyCarryRule(cat, this._categoryBalanceInPeriod(source.id, oldId));
          if (carryAmount > 0) {
            db.add('budgetTransactions', {
              id: generateId(),
              ...targetMeta,
              category_id: newId,
              amount: carryAmount,
              type: 'carry_over',
              date: `${year}-${String(month).padStart(2, '0')}-01`,
              comment: `Перенос из ${this.formatPeriodTitle(source)}`
            }, { skipPeriod: true });
          }
        });
      }

      if (copyCredits) {
        storage.listByPeriod('credits', source.id).filter((c) => c.status === 'active').forEach((credit) => {
          db.add('credits', {
            id: generateId(),
            ...targetMeta,
            bank: credit.bank,
            title: credit.title,
            initial_amount: credit.initial_amount,
            current_balance: credit.current_balance,
            monthly_payment: credit.monthly_payment,
            interest_rate: credit.interest_rate,
            payment_day: credit.payment_day,
            start_date: credit.start_date,
            end_date: credit.end_date,
            status: 'active',
            notes: credit.notes
          }, { skipPeriod: true });
        });
      }

      if (copyUtilities) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const unique = [...new Map(storage.listByPeriod('utilities', source.id).map((u) => [u.service, u])).values()];
        unique.forEach((util) => {
          db.add('utilities', {
            id: generateId(),
            ...targetMeta,
            service: util.service,
            amount: 0,
            month_key: monthKey,
            status: 'pending',
            due_date: `${monthKey}-10`,
            receipt: '',
            comment: ''
          }, { skipPeriod: true });
        });
      }

      if (copyGoals) {
        storage.listByPeriod('goals', source.id).filter((g) => g.status === 'active').forEach((goal) => {
          db.add('goals', {
            id: generateId(),
            ...targetMeta,
            title: goal.title,
            target: goal.target,
            saved: goal.saved,
            deadline: goal.deadline,
            icon: goal.icon,
            status: 'active',
            comment: goal.comment,
            contributions: []
          }, { skipPeriod: true });
        });
      }

      db.add('history', {
        id: generateId(),
        ...targetMeta,
        type: 'period',
        title: `Открыт период ${this.formatPeriodTitle(target)}`,
        description: `На основе ${this.formatPeriodTitle(source)}`,
        icon: '📅',
        date: new Date().toISOString()
      }, { skipPeriod: true });
    });

    if (switchTo) storage.setCurrentPeriod(target.id);
    return { success: true, data: storage.find('financialPeriods', target.id), message: 'Период открыт' };
  }

  closePeriod(options = {}) {
    const period = storage.getCurrentPeriod();
    if (!period) return { success: false, message: 'Период не найден' };
    if (period.status === 'closed' || period.status === 'archive') {
      return { success: false, message: 'Период уже закрыт' };
    }

    const summary = this.buildPeriodSummary(period.id);
    storage.add('periodReports', {
      id: generateId(),
      period_id: period.id,
      year: period.year,
      month: period.month,
      title: this.formatPeriodTitle(period),
      summary
    }, { skipPeriod: true });

    storage.update('financialPeriods', period.id, {
      status: 'closed',
      closed_at: new Date().toISOString(),
      unlock_edit: false
    });

    let nextYear = period.year;
    let nextMonth = period.month + 1;
    if (nextMonth > 12) { nextMonth = 1; nextYear += 1; }

    const opened = this.openPeriod(nextYear, nextMonth, {
      fromPeriodId: period.id,
      transferBalances: options.transferBalances !== false,
      copyCategories: options.copyCategories !== false,
      copyCredits: options.copyCredits !== false,
      copyUtilities: options.copyUtilities !== false,
      copyGoals: options.copyGoals !== false,
      switchTo: true
    });

    if (opened.data) {
      storage.update('financialPeriods', opened.data.id, { status: 'current' });
      storage.setCurrentPeriod(opened.data.id);
    }

    return {
      success: true,
      report: { title: this.formatPeriodTitle(period), summary },
      nextPeriod: opened.data,
      message: `Месяц ${this.formatPeriodTitle(period)} закрыт`
    };
  }

  buildPeriodSummary(periodId) {
    const income = storage.listByPeriod('income', periodId);
    const expenses = storage.listByPeriod('expenses', periodId);
    const utilities = storage.listByPeriod('utilities', periodId).filter((u) => u.status === 'paid');
    const creditPayments = storage.listByPeriod('creditPayments', periodId);
    const categories = storage.listByPeriod('budgetCategories', periodId);
    const totalIncome = sumBy(income, (i) => Number(i.amount) || 0);
    const totalExpense = sumBy(expenses, (e) => Number(e.amount) || 0);
    const savingsCat = categories.find((c) => c.name === 'Накопления');
    const savings = savingsCat ? this._categoryBalanceInPeriod(periodId, savingsCat.id) : 0;
    const expenseByCat = new Map();
    expenses.forEach((e) => {
      const key = e.category || 'Прочее';
      expenseByCat.set(key, roundMoney((expenseByCat.get(key) || 0) + Number(e.amount)));
    });
    const topExpense = [...expenseByCat.entries()].sort((a, b) => b[1] - a[1])[0] || ['—', 0];
    const topIncome = [...income].sort((a, b) => Number(b.amount) - Number(a.amount))[0];
    return {
      income: totalIncome,
      expenses: totalExpense,
      savings: Math.max(0, savings),
      remainder: roundMoney(totalIncome - totalExpense),
      utilities: sumBy(utilities, (u) => Number(u.amount) || 0),
      credits: sumBy(creditPayments, (p) => Number(p.amount) || 0),
      topExpenseCategory: topExpense[0],
      topExpenseAmount: topExpense[1],
      topIncomeTitle: topIncome?.title || '—',
      topIncomeAmount: Number(topIncome?.amount) || 0
    };
  }

  unlockPeriod(periodId) {
    const updated = storage.update('financialPeriods', periodId, { unlock_edit: true });
    return { success: true, data: updated };
  }

  getArchive() {
    return this.getAllPeriods()
      .filter((p) => p.status === 'closed' || p.status === 'archive')
      .map((period) => ({
        ...period,
        title: this.formatPeriodTitle(period),
        summary: this.buildPeriodSummary(period.id),
        report: storage.list('periodReports', { allPeriods: true }).find((r) => r.period_id === period.id)
      }));
  }
}

export const budgetService = new BudgetService();
export default budgetService;
