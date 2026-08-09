/**
 * analytics.js — аналитика
 */
import { incomeService } from './income.js';
import { budgetService } from './budget.js';
import { expensesService } from './expenses.js';
import { creditsService } from './credits.js';
import { utilitiesService } from './utilities.js';
import { goalsService } from './goals.js';
import { storage } from './storage.js';
import { getMonthName, percent, roundMoney } from './utils.js';

export class AnalyticsService {
  getDashboard() {
    const income = incomeService.getSummary();
    const budget = budgetService.getSummary();
    const expenses = expensesService.getSummary();
    const credits = creditsService.getSummary();
    const utilities = utilitiesService.getSummary();
    const goals = goalsService.getSummary();
    const period = storage.getCurrentPeriod();

    return {
      period,
      income,
      budget,
      expenses,
      credits,
      utilities,
      goals,
      freeMoney: income.freeMoney,
      savings: budget.savings,
      net: roundMoney(income.totalIncome - expenses.total - credits.monthly - utilities.pending)
    };
  }

  getUtilityStructure() {
    return utilitiesService.getStructure();
  }

  getUtilitiesAnalytics() {
    return utilitiesService.getAnalytics();
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

  updatePlan(patch) {
    const period = storage.getCurrentPeriod();
    if (!period) return { success: false, message: 'Период не найден' };
    let plan = storage.list('periodPlans', { allPeriods: true })
      .find((p) => p.period_id === period.id);
    if (!plan) {
      plan = storage.add('periodPlans', {
        period_id: period.id,
        year: period.year,
        month: period.month,
        planned_income: 0,
        planned_expense: 0,
        planned_savings: 0,
        planned_credits: 0,
        actual_income: 0,
        actual_expense: 0,
        actual_savings: 0,
        actual_credits: 0
      }, { skipPeriod: true });
    }
    const updated = storage.update('periodPlans', plan.id, {
      planned_income: Number(patch.planned_income ?? plan.planned_income) || 0,
      planned_expense: Number(patch.planned_expense ?? plan.planned_expense) || 0,
      planned_savings: Number(patch.planned_savings ?? plan.planned_savings) || 0,
      planned_credits: Number(patch.planned_credits ?? plan.planned_credits) || 0
    });
    return { success: true, data: updated };
  }

  getYearlyOverview(year) {
    const periods = budgetService.getAllPeriods().filter((p) => p.year === year);
    return periods.map((period) => {
      const summary = budgetService.buildPeriodSummary(period.id);
      return {
        ...period,
        title: `${getMonthName(period.month - 1)}`,
        ...summary
      };
    }).sort((a, b) => a.month - b.month);
  }

  comparePeriods(periodIdA, periodIdB) {
    const a = storage.find('financialPeriods', periodIdA);
    const b = storage.find('financialPeriods', periodIdB);
    if (!a || !b) return { success: false, message: 'Периоды не найдены' };
    const sa = budgetService.buildPeriodSummary(periodIdA);
    const sb = budgetService.buildPeriodSummary(periodIdB);
    return {
      success: true,
      a: { period: a, title: budgetService.formatPeriodTitle(a), summary: sa },
      b: { period: b, title: budgetService.formatPeriodTitle(b), summary: sb },
      delta: {
        income: roundMoney(sa.income - sb.income),
        expenses: roundMoney(sa.expenses - sb.expenses),
        savings: roundMoney(sa.savings - sb.savings)
      }
    };
  }

  getArchive() {
    return budgetService.getArchive();
  }
}

export const analyticsService = new AnalyticsService();
export default analyticsService;
