/**
 * analytics.js — аналитика
 */
import { incomeService } from './income.js';
import { budgetService } from './budget.js';
import { expensesService } from './expenses.js';
import { creditsService } from './credits.js';
import { utilitiesService } from './utilities.js';
import { requiredExpensesService } from './requiredExpenses.js';
import { goalsService } from './goals.js';
import { storage } from './storage.js';
import { getMonthName, percent, roundMoney, generateId } from './utils.js';

export class AnalyticsService {
  getDashboard() {
    const income = incomeService.getSummary();
    const budget = budgetService.getSummary();
    const expenses = expensesService.getSummary();
    const credits = creditsService.getSummary();
    const utilities = utilitiesService.getSummary();
    const requiredExpenses = requiredExpensesService.getSummary();
    const goals = goalsService.getSummary();
    const period = storage.getCurrentPeriod();

    // Фактический остаток: нераспределённый доход + деньги в конвертах.
    // Неоплаченные обязательства сюда НЕ входят.
    const remainingMoney = roundMoney((income.freeMoney || 0) + (budget.totalBalance || 0));

    return {
      period,
      income,
      budget,
      expenses,
      credits,
      utilities,
      requiredExpenses,
      goals,
      freeMoney: income.freeMoney,
      remainingMoney,
      savings: budget.savings,
      // Только фактические расходы — без неоплаченных обязательств
      net: roundMoney(income.totalIncome - expenses.total)
    };
  }

  getUtilityStructure() {
    return utilitiesService.getStructure();
  }

  getUtilitiesAnalytics() {
    return utilitiesService.getAnalytics();
  }

  getRequiredExpensesAnalytics() {
    return requiredExpensesService.getAnalytics();
  }

  getExpenseStructure() {
    return expensesService.getStructure();
  }

  getIncomeStructure() {
    return incomeService.getStructureBySource();
  }

  getEnvelopeStructure() {
    return budgetService.getEnvelopes().map((e) => ({
      name: e.name,
      amount: e.balance,
      color: e.color,
      icon: e.icon
    }));
  }

  getPlanFact() {
    const period = storage.getCurrentPeriod();
    if (!period) return null;
    const plan = storage.list('periodPlans', { allPeriods: true })
      .find((p) => p.period_id === period.id) || {
      planned_income: 0,
      planned_expense: 0,
      planned_savings: 0,
      planned_credits: 0
    };
    const summary = budgetService.buildPeriodSummary(period.id);
    return {
      income: {
        planned: Number(plan.planned_income) || 0,
        actual: summary.income,
        progress: percent(summary.income, Number(plan.planned_income) || 0)
      },
      expense: {
        planned: Number(plan.planned_expense) || 0,
        actual: summary.expenses,
        progress: percent(summary.expenses, Number(plan.planned_expense) || 0)
      },
      savings: {
        planned: Number(plan.planned_savings) || 0,
        actual: summary.savings,
        progress: percent(summary.savings, Number(plan.planned_savings) || 0)
      },
      credits: {
        planned: Number(plan.planned_credits) || 0,
        actual: summary.credits,
        progress: percent(summary.credits, Number(plan.planned_credits) || 0)
      }
    };
  }

  updatePlan(data) {
    const period = storage.getCurrentPeriod();
    if (!period) return { success: false, message: 'Период не выбран' };
    const plans = storage.list('periodPlans', { allPeriods: true });
    const existing = plans.find((p) => p.period_id === period.id);
    const patch = {
      planned_income: roundMoney(Number(data.planned_income) || 0),
      planned_expense: roundMoney(Number(data.planned_expense) || 0),
      planned_savings: roundMoney(Number(data.planned_savings) || 0),
      planned_credits: roundMoney(Number(data.planned_credits) || 0)
    };
    if (existing) {
      storage.update('periodPlans', existing.id, patch);
    } else {
      storage.add('periodPlans', {
        id: generateId(),
        period_id: period.id,
        year: period.year,
        month: period.month,
        ...patch,
        actual_income: 0,
        actual_expense: 0,
        actual_savings: 0,
        actual_credits: 0
      }, { skipPeriod: true });
    }
    return { success: true };
  }

  comparePeriods(periodIdA, periodIdB) {
    const a = storage.find('financialPeriods', periodIdA);
    const b = storage.find('financialPeriods', periodIdB);
    if (!a || !b) return { success: false, message: 'Период не найден' };
    const summaryA = budgetService.buildPeriodSummary(a.id);
    const summaryB = budgetService.buildPeriodSummary(b.id);
    return {
      success: true,
      a: { title: budgetService.formatPeriodTitle(a), summary: summaryA },
      b: { title: budgetService.formatPeriodTitle(b), summary: summaryB },
      delta: {
        income: roundMoney(summaryA.income - summaryB.income),
        expenses: roundMoney(summaryA.expenses - summaryB.expenses),
        savings: roundMoney(summaryA.savings - summaryB.savings)
      }
    };
  }

  getYearlyOverview(year) {
    const periods = storage.list('financialPeriods', { allPeriods: true })
      .filter((p) => p.year === year)
      .sort((a, b) => a.month - b.month);
    return periods.map((p) => {
      const summary = budgetService.buildPeriodSummary(p.id);
      return {
        month: p.month,
        title: getMonthName(p.month - 1, true),
        income: Number(summary.income) || 0,
        expenses: Number(summary.expenses) || 0,
        savings: Number(summary.savings) || 0
      };
    });
  }

  getArchive() {
    return budgetService.getArchive();
  }
}

export const analyticsService = new AnalyticsService();
export default analyticsService;
