/**
 * services/AnalyticsService.js
 */
import { incomeService } from './IncomeService.js';
import { budgetService } from './BudgetService.js';
import { expenseService } from './ExpenseService.js';
import { creditService } from './CreditService.js';
import { utilityService } from './UtilityService.js';
import { goalsService } from './GoalsService.js';
import { periodService } from './PeriodService.js';
import {
  getMonthBounds, getMonthName, isDateInRange, percent, roundMoney, sumBy
} from '../helpers/utils.js';

export class AnalyticsService {
  getIncomeStructure() {
    return incomeService.getStructureBySource().map((item) => ({
      label: item.source, value: item.amount
    }));
  }

  getExpenseStructure() {
    return expenseService.getStructureByCategory().map((item) => ({
      label: item.name, value: item.amount, icon: item.icon
    }));
  }

  getEnvelopeStructure() {
    return budgetService.getEnvelopes().map((env) => ({
      label: env.name, value: Math.max(0, env.balance), color: env.color, icon: env.icon
    }));
  }

  getCreditsAnalytics() {
    return {
      totalDebt: creditService.getTotalDebt(),
      monthlyLoad: creditService.getTotalMonthlyPayments(),
      items: creditService.getActive().map((c) => ({
        label: c.title,
        value: Number(c.current_balance) || 0,
        monthly: Number(c.monthly_payment) || 0
      }))
    };
  }

  getUtilitiesAnalytics() {
    const stats = utilityService.getStats();
    return {
      ...stats,
      items: stats.byType.filter((t) => t.total > 0).map((t) => ({
        label: t.name, value: t.total, color: t.color, icon: t.icon
      }))
    };
  }

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
      goals: goalsService.getAllEnriched().map((g) => ({
        label: g.title, value: g.saved, target: g.target, progress: g.progress, icon: g.icon
      }))
    };
  }

  estimateMonthlyIncome() {
    const incomes = incomeService.getAll();
    if (!incomes.length) return 0;
    const now = new Date();
    let total = 0;
    let months = 0;
    for (let i = 0; i < 3; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const bounds = getMonthBounds(d.getFullYear(), d.getMonth());
      const monthSum = sumBy(
        incomes.filter((item) => isDateInRange(item.date, bounds.start, bounds.end)),
        (item) => Number(item.amount) || 0
      );
      if (monthSum > 0) { total += monthSum; months += 1; }
    }
    return months ? roundMoney(total / months) : incomeService.getTotalIncome();
  }

  getFinancialLoad() {
    const monthlyIncome = this.estimateMonthlyIncome();
    const creditLoad = creditService.getTotalMonthlyPayments();
    const utilityLoad = utilityService.getStats().monthTotal || utilityService.getStats().monthPending;
    const totalLoad = roundMoney(creditLoad + utilityLoad);
    return {
      monthlyIncome, creditLoad, utilityLoad, totalLoad,
      loadPercent: percent(totalLoad, monthlyIncome || 1),
      freeAfterLoad: roundMoney(Math.max(0, monthlyIncome - totalLoad))
    };
  }

  getMonthlyDynamics(year = new Date().getFullYear()) {
    const result = [];
    for (let month = 0; month < 12; month += 1) {
      const bounds = getMonthBounds(year, month);
      const income = sumBy(
        incomeService.getAll().filter((i) => isDateInRange(i.date, bounds.start, bounds.end)),
        (i) => Number(i.amount) || 0
      );
      const expense = sumBy(
        expenseService.getAll().filter((e) => isDateInRange(e.date, bounds.start, bounds.end)),
        (e) => Number(e.amount) || 0
      );
      result.push({
        month, label: getMonthName(month).slice(0, 3), income, expense,
        balance: roundMoney(income - expense)
      });
    }
    return result;
  }

  getDashboardAnalytics() {
    return {
      income: incomeService.getSummary(),
      budget: budgetService.getSummary(),
      expenses: expenseService.getSummary(),
      credits: this.getCreditsAnalytics(),
      utilities: this.getUtilitiesAnalytics(),
      savings: this.getSavingsAnalytics(),
      load: this.getFinancialLoad(),
      incomeStructure: this.getIncomeStructure(),
      expenseStructure: this.getExpenseStructure(),
      envelopeStructure: this.getEnvelopeStructure(),
      monthlyDynamics: this.getMonthlyDynamics(),
      yearAnalytics: this.getYearAnalytics(),
      plan: this.getPlanFact()
    };
  }

  getYearAnalytics(year = new Date().getFullYear()) {
    return periodService.getYearAnalytics(year);
  }

  getPlanFact(periodId) {
    return periodService.getPlan(periodId);
  }

  comparePeriods(mode, params) {
    return periodService.compare(mode, params);
  }
}

export const analyticsService = new AnalyticsService();
export default analyticsService;
