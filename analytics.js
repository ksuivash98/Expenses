/**
 * analytics.js
 * Аналитика: все показатели вычисляются динамически, без хранения агрегатов.
 */

import { incomeService } from './income.js';
import { budgetService } from './budget.js';
import { expensesService } from './expenses.js';
import { creditsService } from './credits.js';
import { utilitiesService } from './utilities.js';
import { goalsService } from './goals.js';
import {
  getMonthBounds,
  getMonthName,
  isDateInRange,
  percent,
  roundMoney,
  sumBy
} from './utils.js';

/**
 * Сервис аналитики.
 */
export class AnalyticsService {
  /**
   * Структура доходов по источникам.
   * @returns {Array<{ label: string, value: number, color?: string }>}
   */
  getIncomeStructure() {
    return incomeService.getStructureBySource().map((item, index) => ({
      label: item.source,
      value: item.amount,
      color: undefined,
      index
    }));
  }

  /**
   * Структура расходов по категориям покупок.
   * @returns {Array<{ label: string, value: number }>}
   */
  getExpenseStructure() {
    return expensesService.getStructureByCategory().map((item) => ({
      label: item.name,
      value: item.amount,
      icon: item.icon
    }));
  }

  /**
   * Структура балансов конвертов.
   * @returns {Array<{ label: string, value: number, color: string, icon: string }>}
   */
  getEnvelopeStructure() {
    return budgetService.getEnvelopes().map((env) => ({
      label: env.name,
      value: Math.max(0, env.balance),
      color: env.color,
      icon: env.icon,
      received: env.received,
      spent: env.spent
    }));
  }

  /**
   * Данные по кредитам для диаграмм.
   * @returns {object}
   */
  getCreditsAnalytics() {
    const credits = creditsService.getAllEnriched();
    const active = credits.filter((c) => c.status === 'active');

    return {
      totalDebt: creditsService.getTotalDebt(),
      monthlyLoad: creditsService.getTotalMonthlyPayments(),
      items: active.map((credit) => ({
        label: credit.name,
        value: Number(credit.remainingAmount) || 0,
        monthly: Number(credit.monthlyPayment) || 0,
        progress: credit.progress
      }))
    };
  }

  /**
   * Данные по коммунальным услугам.
   * @returns {object}
   */
  getUtilitiesAnalytics() {
    const stats = utilitiesService.getStats();
    return {
      ...stats,
      items: stats.byType
        .filter((t) => t.total > 0)
        .map((t) => ({
          label: t.name,
          value: t.total,
          average: t.average,
          color: t.color,
          icon: t.icon
        }))
    };
  }

  /**
   * Накопления: конверт + цели.
   * @returns {object}
   */
  getSavingsAnalytics() {
    const envelopeSavings = budgetService.getSavingsTotal();
    const goalsSaved = goalsService.getTotalSaved();
    const goalsTarget = goalsService.getTotalTarget();

    return {
      envelopeSavings,
      goalsSaved,
      goalsTarget,
      totalSavings: roundMoney(envelopeSavings + goalsSaved),
      goalsProgress: percent(goalsSaved, goalsTarget),
      goals: goalsService.getAllEnriched().map((goal) => ({
        label: goal.name,
        value: goal.savedAmount,
        target: goal.targetAmount,
        progress: goal.progress,
        icon: goal.icon
      }))
    };
  }

  /**
   * Финансовая нагрузка: обязательные платежи относительно дохода.
   * @returns {object}
   */
  getFinancialLoad() {
    const monthlyIncome = this.estimateMonthlyIncome();
    const creditLoad = creditsService.getTotalMonthlyPayments();
    const utilityLoad = utilitiesService.getStats().monthTotal
      || utilitiesService.getStats().monthPending;
    const totalLoad = roundMoney(creditLoad + utilityLoad);

    return {
      monthlyIncome,
      creditLoad,
      utilityLoad,
      totalLoad,
      loadPercent: percent(totalLoad, monthlyIncome || 1),
      freeAfterLoad: roundMoney(Math.max(0, monthlyIncome - totalLoad))
    };
  }

  /**
   * Оценка среднемесячного дохода за последние 3 месяца (или общий / 1).
   * @returns {number}
   */
  estimateMonthlyIncome() {
    const incomes = incomeService.getAll();
    if (!incomes.length) return 0;

    const now = new Date();
    let total = 0;
    let monthsWithData = 0;

    for (let i = 0; i < 3; i += 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const bounds = getMonthBounds(date.getFullYear(), date.getMonth());
      const monthSum = sumBy(
        incomes.filter((item) => isDateInRange(item.date, bounds.start, bounds.end)),
        (item) => Number(item.amount) || 0
      );
      if (monthSum > 0) {
        total += monthSum;
        monthsWithData += 1;
      }
    }

    if (monthsWithData === 0) {
      return roundMoney(incomeService.getTotalIncome());
    }

    return roundMoney(total / monthsWithData);
  }

  /**
   * Динамика доходов и расходов по месяцам за год.
   * @param {number} [year]
   * @returns {Array<object>}
   */
  getMonthlyDynamics(year = new Date().getFullYear()) {
    const result = [];

    for (let month = 0; month < 12; month += 1) {
      const bounds = getMonthBounds(year, month);
      const income = sumBy(
        incomeService.getAll().filter((item) => isDateInRange(item.date, bounds.start, bounds.end)),
        (item) => Number(item.amount) || 0
      );
      const expense = sumBy(
        expensesService.getAll().filter((item) => isDateInRange(item.date, bounds.start, bounds.end)),
        (item) => Number(item.amount) || 0
      );

      result.push({
        month,
        label: getMonthName(month).slice(0, 3),
        income,
        expense,
        balance: roundMoney(income - expense)
      });
    }

    return result;
  }

  /**
   * Полный отчёт аналитики для экрана.
   * @returns {object}
   */
  getDashboardAnalytics() {
    const budget = budgetService.getSummary();
    const income = incomeService.getSummary();
    const expenses = expensesService.getSummary();
    const credits = this.getCreditsAnalytics();
    const utilities = this.getUtilitiesAnalytics();
    const savings = this.getSavingsAnalytics();
    const load = this.getFinancialLoad();

    return {
      income,
      budget,
      expenses,
      credits,
      utilities,
      savings,
      load,
      incomeStructure: this.getIncomeStructure(),
      expenseStructure: this.getExpenseStructure(),
      envelopeStructure: this.getEnvelopeStructure(),
      monthlyDynamics: this.getMonthlyDynamics()
    };
  }
}

/** Единственный экземпляр сервиса аналитики. */
export const analyticsService = new AnalyticsService();

export default analyticsService;
