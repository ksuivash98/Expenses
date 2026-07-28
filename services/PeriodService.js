/**
 * services/PeriodService.js
 * Финансовые периоды: создание, переключение, перенос, закрытие, отчёты, сравнение.
 */

import {
  TABLES, PERIOD_STATUSES, PERIOD_STATUS_LABELS, CARRY_RULES, CARRY_RULE_LABELS
} from '../config.js';
import { databaseService } from './DatabaseService.js';
import {
  generateId, getMonthName, roundMoney, sumBy, percent, parseAmount
} from '../helpers/utils.js';

/**
 * Сервис финансовых периодов.
 */
export class PeriodService {
  /**
   * Все периоды пользователя (новые сверху).
   * @returns {Array<object>}
   */
  getAll() {
    return [...databaseService.listAll(TABLES.financialPeriods)]
      .sort((a, b) => (b.year - a.year) || (b.month - a.month));
  }

  getById(id) {
    return databaseService.find(TABLES.financialPeriods, id);
  }

  getCurrent() {
    return databaseService.getCurrentPeriod();
  }

  getStatusLabel(status) {
    return PERIOD_STATUS_LABELS[status] || status;
  }

  getCarryRuleLabels() {
    return CARRY_RULE_LABELS;
  }

  /**
   * Заголовок периода: «Июль 2026».
   * @param {object} period
   * @returns {string}
   */
  formatPeriodTitle(period) {
    if (!period) return 'Период не выбран';
    return `${getMonthName(Number(period.month) - 1)} ${period.year}`;
  }

  /**
   * Группировка периодов по годам для переключателя.
   * @returns {Array<{ year: number, months: Array<object> }>}
   */
  getGroupedByYear() {
    const map = new Map();
    this.getAll().forEach((period) => {
      if (!map.has(period.year)) map.set(period.year, []);
      map.get(period.year).push(period);
    });
    return [...map.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, months]) => ({
        year,
        months: months.sort((a, b) => a.month - b.month)
      }));
  }

  /**
   * Переключить активный период в UI.
   * @param {string} periodId
   */
  switchPeriod(periodId) {
    const period = this.getById(periodId);
    if (!period) return { success: false, message: 'Период не найден' };
    databaseService.setCurrentPeriod(periodId);
    return { success: true, data: period };
  }

  /**
   * Создать период (или вернуть существующий).
   * @param {number} year
   * @param {number} month 1–12
   * @param {object} [options]
   */
  async ensurePeriod(year, month, options = {}) {
    const existing = this.getAll().find((p) => p.year === year && p.month === month);
    if (existing) {
      if (options.switchTo) databaseService.setCurrentPeriod(existing.id);
      return { success: true, data: existing, created: false };
    }

    const now = new Date();
    const isFuture = year > now.getFullYear()
      || (year === now.getFullYear() && month > (now.getMonth() + 1));
    const hasCurrent = this.getAll().some((p) => p.status === PERIOD_STATUSES.current);

    const row = {
      id: generateId(),
      year,
      month,
      status: options.status
        || (!hasCurrent && !isFuture ? PERIOD_STATUSES.current : (isFuture ? PERIOD_STATUSES.future : PERIOD_STATUSES.future)),
      carry_over_mode: options.carry_over_mode || 'ask',
      unlock_edit: false,
      closed_at: null
    };

    // financial_periods не period-scoped в PERIOD_SCOPED_TABLES — insert без period meta
    await databaseService.insert(TABLES.financialPeriods, row, { skipPeriod: true });

    await databaseService.insert(TABLES.periodPlans, {
      id: generateId(),
      period_id: row.id,
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
    }, {
      force: true,
      periodMeta: { period_id: row.id, year, month }
    });

    if (options.switchTo) databaseService.setCurrentPeriod(row.id);
    return { success: true, data: this.getById(row.id), created: true };
  }

  /**
   * Открыть новый месяц с опциями переноса.
   * @param {number} year
   * @param {number} month
   * @param {object} options
   */
  async openPeriod(year, month, options = {}) {
    const {
      fromPeriodId = this.getCurrent()?.id,
      transferBalances = true,
      copyCategories = true,
      copyCredits = true,
      copyUtilities = true,
      copyRegularPayments = true,
      copyGoals = true,
      switchTo = true
    } = options;

    const ensured = await this.ensurePeriod(year, month, { switchTo: false });
    const target = ensured.data;
    const source = fromPeriodId ? this.getById(fromPeriodId) : null;

    if (!source) {
      if (switchTo) databaseService.setCurrentPeriod(target.id);
      return { success: true, data: target, message: 'Период создан без переноса' };
    }

    if (source.id === target.id) {
      if (switchTo) databaseService.setCurrentPeriod(target.id);
      return { success: true, data: target, message: 'Период уже существует' };
    }

    const existingCats = databaseService.listByPeriod(TABLES.budgetCategories, target.id);
    if (existingCats.length > 0 && !options.forceRecopy) {
      if (switchTo) databaseService.setCurrentPeriod(target.id);
      return {
        success: true,
        data: target,
        message: 'Период уже заполнен — перенос пропущен'
      };
    }

    const targetMeta = { period_id: target.id, year: target.year, month: target.month };
    const categoryIdMap = new Map();

    await databaseService.batch(async (db) => {
      if (copyCategories || transferBalances) {
        const categories = databaseService.listByPeriod(TABLES.budgetCategories, source.id);
        for (const cat of categories) {
          const newId = generateId();
          categoryIdMap.set(cat.id, newId);
          await db.insert(TABLES.budgetCategories, {
            id: newId,
            name: cat.name,
            icon: cat.icon,
            color: cat.color,
            sort: cat.sort,
            carry_rule: cat.carry_rule || CARRY_RULES.balance,
            carry_max: cat.carry_max
          }, { periodMeta: targetMeta, force: true });
        }
      }

      if (transferBalances && categoryIdMap.size) {
        for (const [oldId, newId] of categoryIdMap.entries()) {
          const balance = this._categoryBalance(source.id, oldId);
          const cat = databaseService.find(TABLES.budgetCategories, oldId);
          const carryAmount = this._applyCarryRule(cat, balance);
          if (carryAmount > 0) {
            await db.insert(TABLES.budgetTransactions, {
              id: generateId(),
              category_id: newId,
              amount: carryAmount,
              type: 'carry_over',
              date: `${target.year}-${String(target.month).padStart(2, '0')}-01`,
              comment: `Перенос остатка из ${this.formatPeriodTitle(source)}`
            }, { periodMeta: targetMeta, force: true });
          }
        }
      }

      if (copyCredits) {
        const credits = databaseService.listByPeriod(TABLES.credits, source.id)
          .filter((c) => c.status === 'active');
        for (const credit of credits) {
          await db.insert(TABLES.credits, {
            id: generateId(),
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
          }, { periodMeta: targetMeta, force: true });
        }
      }

      if (copyUtilities) {
        const monthKey = `${target.year}-${String(target.month).padStart(2, '0')}`;
        const utilities = databaseService.listByPeriod(TABLES.utilities, source.id);
        const uniqueServices = [...new Map(utilities.map((u) => [u.service, u])).values()];
        for (const util of uniqueServices) {
          await db.insert(TABLES.utilities, {
            id: generateId(),
            service: util.service,
            amount: 0,
            month: monthKey,
            status: 'pending',
            receipt: '',
            due_date: `${monthKey}-10`,
            comment: ''
          }, { periodMeta: targetMeta, force: true });
        }
      }

      if (copyRegularPayments) {
        const payments = databaseService.listByPeriod(TABLES.regularPayments, source.id);
        for (const payment of payments) {
          await db.insert(TABLES.regularPayments, {
            id: generateId(),
            title: payment.title,
            amount: payment.amount,
            day_of_month: payment.day_of_month,
            category: payment.category,
            budget_category: categoryIdMap.get(payment.budget_category) || null,
            comment: payment.comment
          }, { periodMeta: targetMeta, force: true });
        }
      }

      if (copyGoals) {
        const goals = databaseService.listByPeriod(TABLES.goals, source.id)
          .filter((g) => g.status === 'active');
        for (const goal of goals) {
          await db.insert(TABLES.goals, {
            id: generateId(),
            title: goal.title,
            target: goal.target,
            saved: goal.saved,
            deadline: goal.deadline,
            icon: goal.icon,
            status: 'active',
            comment: goal.comment,
            contributions: []
          }, { periodMeta: targetMeta, force: true });
        }
      }

      await db.insert(TABLES.history, {
        id: generateId(),
        type: 'period',
        title: `Открыт период ${this.formatPeriodTitle(target)}`,
        description: `На основе ${this.formatPeriodTitle(source)}`,
        icon: '📅',
        date: new Date().toISOString()
      }, { periodMeta: targetMeta, force: true });
    });

    if (switchTo) databaseService.setCurrentPeriod(target.id);
    return {
      success: true,
      data: target,
      message: `Период ${this.formatPeriodTitle(target)} открыт`
    };
  }

  /**
   * Баланс конверта в периоде.
   * @private
   */
  _categoryBalance(periodId, categoryId) {
    const txs = databaseService.listByPeriod(TABLES.budgetTransactions, periodId)
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

  /**
   * Применить правило переноса к остатку.
   * @private
   */
  _applyCarryRule(category, balance) {
    const positive = Math.max(0, balance);
    const rule = category?.carry_rule || CARRY_RULES.balance;
    if (rule === CARRY_RULES.never || rule === CARRY_RULES.zero) return 0;
    if (rule === CARRY_RULES.max) {
      const max = Number(category.carry_max) || 0;
      return roundMoney(Math.min(positive, max));
    }
    // always | balance
    return positive;
  }

  /**
   * Обновить правило переноса категории.
   */
  async updateCarryRule(categoryId, carryRule, carryMax = null) {
    if (!Object.values(CARRY_RULES).includes(carryRule)) {
      return { success: false, message: 'Неизвестное правило' };
    }
    const updated = await databaseService.update(TABLES.budgetCategories, categoryId, {
      carry_rule: carryRule,
      carry_max: carryRule === CARRY_RULES.max ? roundMoney(parseAmount(carryMax)) : null
    });
    return { success: true, data: updated };
  }

  /**
   * Разблокировать редактирование закрытого периода.
   */
  async unlockEditing(periodId, confirm = false) {
    if (!confirm) {
      return { success: false, message: 'Требуется подтверждение пользователя' };
    }
    const period = this.getById(periodId);
    if (!period) return { success: false, message: 'Период не найден' };
    const updated = await databaseService.update(TABLES.financialPeriods, periodId, {
      unlock_edit: true
    }, { force: true });
    return { success: true, data: updated };
  }

  async lockEditing(periodId) {
    const updated = await databaseService.update(TABLES.financialPeriods, periodId, {
      unlock_edit: false
    }, { force: true });
    return { success: true, data: updated };
  }

  /**
   * Закрыть месяц: отчёт, перенос, следующий период.
   * @param {string} [periodId]
   * @param {object} [options]
   */
  async closePeriod(periodId = this.getCurrent()?.id, options = {}) {
    const period = this.getById(periodId);
    if (!period) return { success: false, message: 'Период не найден' };
    if (period.status === PERIOD_STATUSES.closed || period.status === PERIOD_STATUSES.archive) {
      return { success: false, message: 'Период уже закрыт' };
    }

    const summary = this.buildPeriodSummary(periodId);
    const report = {
      id: generateId(),
      period_id: period.id,
      year: period.year,
      month: period.month,
      title: this.formatPeriodTitle(period),
      summary
    };

    await databaseService.insert(TABLES.periodReports, report, { skipPeriod: true, force: true });

    await databaseService.update(TABLES.financialPeriods, period.id, {
      status: PERIOD_STATUSES.closed,
      closed_at: new Date().toISOString(),
      unlock_edit: false
    }, { force: true });

    // Обновить actual в плане
    await this.recalculatePlanFacts(period.id);

    let nextPeriod = null;
    if (options.createNext !== false) {
      let nextYear = period.year;
      let nextMonth = period.month + 1;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
      }

      // Снять статус current с других
      for (const p of this.getAll().filter((x) => x.status === PERIOD_STATUSES.current && x.id !== period.id)) {
        await databaseService.update(TABLES.financialPeriods, p.id, {
          status: PERIOD_STATUSES.future
        }, { force: true });
      }

      const opened = await this.openPeriod(nextYear, nextMonth, {
        fromPeriodId: period.id,
        transferBalances: options.transferBalances !== false,
        copyCategories: options.copyCategories !== false,
        copyCredits: options.copyCredits !== false,
        copyUtilities: options.copyUtilities !== false,
        copyRegularPayments: options.copyRegularPayments !== false,
        copyGoals: options.copyGoals !== false,
        switchTo: true
      });

      nextPeriod = opened.data;
      if (nextPeriod) {
        await databaseService.update(TABLES.financialPeriods, nextPeriod.id, {
          status: PERIOD_STATUSES.current
        }, { force: true });
        databaseService.setCurrentPeriod(nextPeriod.id);
      }
    }

    return {
      success: true,
      report,
      nextPeriod,
      message: `Месяц ${report.title} закрыт`
    };
  }

  /**
   * Сводка периода для отчёта.
   */
  buildPeriodSummary(periodId) {
    const income = databaseService.listByPeriod(TABLES.income, periodId);
    const expenses = databaseService.listByPeriod(TABLES.expenses, periodId);
    const utilities = databaseService.listByPeriod(TABLES.utilities, periodId)
      .filter((u) => u.status === 'paid');
    const creditPayments = databaseService.listByPeriod(TABLES.creditPayments, periodId);
    const categories = databaseService.listByPeriod(TABLES.budgetCategories, periodId);

    const totalIncome = sumBy(income, (i) => Number(i.amount) || 0);
    const totalExpense = sumBy(expenses, (e) => Number(e.amount) || 0);
    const totalUtilities = sumBy(utilities, (u) => Number(u.amount) || 0);
    const totalCredits = sumBy(creditPayments, (p) => Number(p.amount) || 0);

    const savingsCat = categories.find((c) => c.name === 'Накопления');
    const savings = savingsCat ? this._categoryBalance(periodId, savingsCat.id) : 0;
    const envelopesBalance = sumBy(categories, (c) => this._categoryBalance(periodId, c.id));

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
      utilities: totalUtilities,
      credits: totalCredits,
      envelopesBalance,
      topExpenseCategory: topExpense[0],
      topExpenseAmount: topExpense[1],
      topIncomeTitle: topIncome?.title || '—',
      topIncomeAmount: Number(topIncome?.amount) || 0,
      closedAt: new Date().toISOString()
    };
  }

  getReport(periodId) {
    return databaseService.listAll(TABLES.periodReports)
      .find((r) => r.period_id === periodId) || null;
  }

  getAllReports() {
    return [...databaseService.listAll(TABLES.periodReports)]
      .sort((a, b) => (b.year - a.year) || (b.month - a.month));
  }

  /**
   * План/факт текущего или указанного периода.
   */
  getPlan(periodId = this.getCurrent()?.id) {
    if (!periodId) return null;
    const plan = databaseService.listByPeriod(TABLES.periodPlans, periodId)[0];
    if (!plan) return null;
    return this.enrichPlan(plan);
  }

  enrichPlan(plan) {
    const deviation = (actual, planned) => {
      const a = Number(actual) || 0;
      const p = Number(planned) || 0;
      const diff = roundMoney(a - p);
      const pct = p === 0 ? (a === 0 ? 0 : 100) : percent(Math.abs(diff), Math.abs(p));
      return { diff, pct, sign: diff >= 0 ? '+' : '−' };
    };

    return {
      ...plan,
      incomeDev: deviation(plan.actual_income, plan.planned_income),
      expenseDev: deviation(plan.actual_expense, plan.planned_expense),
      savingsDev: deviation(plan.actual_savings, plan.planned_savings),
      creditsDev: deviation(plan.actual_credits, plan.planned_credits)
    };
  }

  async updatePlan(periodId, patch) {
    const plan = databaseService.listByPeriod(TABLES.periodPlans, periodId)[0];
    if (!plan) return { success: false, message: 'План не найден' };
    const updated = await databaseService.update(TABLES.periodPlans, plan.id, {
      planned_income: roundMoney(parseAmount(patch.planned_income ?? plan.planned_income)),
      planned_expense: roundMoney(parseAmount(patch.planned_expense ?? plan.planned_expense)),
      planned_savings: roundMoney(parseAmount(patch.planned_savings ?? plan.planned_savings)),
      planned_credits: roundMoney(parseAmount(patch.planned_credits ?? plan.planned_credits))
    });
    return { success: true, data: this.enrichPlan(updated) };
  }

  async recalculatePlanFacts(periodId) {
    const summary = this.buildPeriodSummary(periodId);
    const plan = databaseService.listByPeriod(TABLES.periodPlans, periodId)[0];
    if (!plan) return null;
    return databaseService.update(TABLES.periodPlans, plan.id, {
      actual_income: summary.income,
      actual_expense: summary.expenses,
      actual_savings: summary.savings,
      actual_credits: summary.credits
    }, { force: true });
  }

  /**
   * Сравнение периодов.
   * @param {'two'|'quarter'|'half'|'year'} mode
   * @param {object} params
   */
  compare(mode, params = {}) {
    let periods = [];
    if (mode === 'two') {
      const a = this.getById(params.periodA);
      const b = this.getById(params.periodB);
      periods = [a, b].filter(Boolean);
    } else {
      const year = Number(params.year) || new Date().getFullYear();
      const all = this.getAll().filter((p) => p.year === year);
      if (mode === 'quarter') {
        const q = Number(params.quarter) || 1;
        const months = [(q - 1) * 3 + 1, (q - 1) * 3 + 2, (q - 1) * 3 + 3];
        periods = all.filter((p) => months.includes(p.month));
      } else if (mode === 'half') {
        const half = Number(params.half) || 1;
        periods = all.filter((p) => (half === 1 ? p.month <= 6 : p.month > 6));
      } else {
        periods = all;
      }
    }

    const metrics = periods.map((p) => {
      const s = this.buildPeriodSummary(p.id);
      return { period: p, title: this.formatPeriodTitle(p), ...s };
    });

    const aggregate = (key) => sumBy(metrics, (m) => m[key] || 0);
    const first = metrics[0];
    const last = metrics[metrics.length - 1];
    const growth = (a, b) => {
      const base = Number(a) || 0;
      const next = Number(b) || 0;
      const diff = roundMoney(next - base);
      const pct = base === 0 ? (next === 0 ? 0 : 100) : roundMoney((diff / Math.abs(base)) * 100);
      return { diff, pct };
    };

    return {
      mode,
      items: metrics,
      totals: {
        income: aggregate('income'),
        expenses: aggregate('expenses'),
        savings: aggregate('savings'),
        credits: aggregate('credits'),
        utilities: aggregate('utilities'),
        remainder: aggregate('remainder')
      },
      growth: first && last ? {
        income: growth(first.income, last.income),
        expenses: growth(first.expenses, last.expenses),
        savings: growth(first.savings, last.savings),
        capital: growth(first.envelopesBalance, last.envelopesBalance),
        credits: growth(first.credits, last.credits),
        utilities: growth(first.utilities, last.utilities),
        freeMoney: growth(first.remainder, last.remainder)
      } : null
    };
  }

  /**
   * Годовая аналитика.
   * @param {number} year
   */
  getYearAnalytics(year = new Date().getFullYear()) {
    const periods = this.getAll().filter((p) => p.year === year);
    const summaries = periods.map((p) => ({
      period: p,
      title: this.formatPeriodTitle(p),
      ...this.buildPeriodSummary(p.id)
    }));

    const incomes = summaries.map((s) => s.income);
    const expenses = summaries.map((s) => s.expenses);
    const totalIncome = sumBy(summaries, (s) => s.income);
    const totalExpense = sumBy(summaries, (s) => s.expenses);
    const totalSavings = sumBy(summaries, (s) => s.savings);
    const closedCount = periods.filter((p) =>
      p.status === PERIOD_STATUSES.closed || p.status === PERIOD_STATUSES.archive
    ).length;

    const bestMonth = [...summaries].sort((a, b) => b.remainder - a.remainder)[0];
    const worstMonth = [...summaries].sort((a, b) => b.expenses - a.expenses)[0];

    return {
      year,
      periodsCount: periods.length,
      closedCount,
      totalIncome,
      totalExpense,
      totalSavings,
      averageIncome: periods.length ? roundMoney(totalIncome / periods.length) : 0,
      averageExpense: periods.length ? roundMoney(totalExpense / periods.length) : 0,
      maxIncome: incomes.length ? Math.max(...incomes) : 0,
      maxExpense: expenses.length ? Math.max(...expenses) : 0,
      savingsRate: percent(totalSavings, totalIncome || 1),
      bestMonth: bestMonth ? { title: bestMonth.title, remainder: bestMonth.remainder } : null,
      costliestMonth: worstMonth ? { title: worstMonth.title, expenses: worstMonth.expenses } : null,
      months: summaries
    };
  }

  /**
   * Архив периодов.
   */
  getArchive() {
    return this.getAll()
      .filter((p) => p.status === PERIOD_STATUSES.closed || p.status === PERIOD_STATUSES.archive)
      .map((period) => ({
        ...period,
        title: this.formatPeriodTitle(period),
        report: this.getReport(period.id),
        summary: this.buildPeriodSummary(period.id)
      }));
  }

  async moveToArchive(periodId) {
    const period = this.getById(periodId);
    if (!period) return { success: false, message: 'Период не найден' };
    if (period.status !== PERIOD_STATUSES.closed) {
      return { success: false, message: 'В архив можно перенести только закрытый период' };
    }
    const updated = await databaseService.update(TABLES.financialPeriods, periodId, {
      status: PERIOD_STATUSES.archive
    }, { force: true });
    return { success: true, data: updated };
  }

  async restoreFromArchive(periodId) {
    const period = this.getById(periodId);
    if (!period) return { success: false, message: 'Период не найден' };
    const updated = await databaseService.update(TABLES.financialPeriods, periodId, {
      status: PERIOD_STATUSES.closed,
      unlock_edit: false
    }, { force: true });
    databaseService.setCurrentPeriod(periodId);
    return { success: true, data: updated, message: 'Период восстановлен для просмотра' };
  }

  /**
   * Экспорт одного периода.
   */
  exportPeriodData(periodId) {
    const period = this.getById(periodId);
    if (!period) return null;
    const tables = [
      TABLES.income, TABLES.budgetCategories, TABLES.budgetTransactions,
      TABLES.expenses, TABLES.credits, TABLES.creditPayments, TABLES.utilities,
      TABLES.goals, TABLES.history, TABLES.notifications, TABLES.regularPayments,
      TABLES.periodPlans
    ];
    const data = {
      period,
      report: this.getReport(periodId),
      summary: this.buildPeriodSummary(periodId)
    };
    tables.forEach((table) => {
      data[table] = databaseService.listByPeriod(table, periodId);
    });
    return data;
  }

  /**
   * Гарантировать наличие текущего периода при старте (офлайн / без триггера).
   */
  async ensureBootstrapPeriod() {
    if (this.getAll().length) {
      if (!this.getCurrent()) {
        const current = this.getAll().find((p) => p.status === 'current') || this.getAll()[0];
        databaseService.setCurrentPeriod(current.id);
      }
      return this.getCurrent();
    }
    const now = new Date();
    const result = await this.ensurePeriod(now.getFullYear(), now.getMonth() + 1, {
      status: PERIOD_STATUSES.current,
      switchTo: true
    });

    // Базовые категории, если пусто
    if (!databaseService.list(TABLES.budgetCategories).length) {
      const defaults = [
        { name: 'Долги', icon: '💳', color: '#F31260', sort: 1, carry_rule: 'balance' },
        { name: 'Ребёнок', icon: '👶', color: '#5B8DEF', sort: 2, carry_rule: 'balance' },
        { name: 'Жизнь', icon: '🛒', color: '#36C6A0', sort: 3, carry_rule: 'zero' },
        { name: 'Квартира', icon: '🏠', color: '#F5A524', sort: 4, carry_rule: 'balance' },
        { name: 'Одежда', icon: '👕', color: '#9353D3', sort: 5, carry_rule: 'max', carry_max: 5000 },
        { name: 'Бьюти', icon: '💄', color: '#FF6B6B', sort: 6, carry_rule: 'never' },
        { name: 'Накопления', icon: '💰', color: '#7CFFB2', sort: 7, carry_rule: 'always' }
      ];
      for (const cat of defaults) {
        await databaseService.insert(TABLES.budgetCategories, { id: generateId(), ...cat }, { force: true });
      }
    }

    return result.data;
  }
}

export const periodService = new PeriodService();
export default periodService;
