/**
 * calendar.js — календарь платежей
 */
import { creditsService } from './credits.js';
import { utilitiesService } from './utilities.js';
import { requiredExpensesService } from './requiredExpenses.js';
import { goalsService } from './goals.js';
import { storage } from './storage.js';
import {
  daysInMonth, getMonthName, getWeekdayShort, toISODate
} from './utils.js';

export class CalendarService {
  getMonthGrid(year, monthIndex) {
    const total = daysInMonth(year, monthIndex);
    const firstWeekday = new Date(year, monthIndex, 1).getDay();
    const offset = (firstWeekday + 6) % 7; // Monday-first
    const cells = [];

    for (let i = 0; i < offset; i += 1) cells.push(null);
    for (let day = 1; day <= total; day += 1) {
      cells.push({
        day,
        date: toISODate(new Date(year, monthIndex, day)),
        weekday: getWeekdayShort(new Date(year, monthIndex, day).getDay())
      });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }

  getEventsForMonth(year, monthIndex) {
    const month = monthIndex + 1;
    const events = [];

    creditsService.getActive().forEach((credit) => {
      const day = Math.min(Number(credit.payment_day) || 1, daysInMonth(year, monthIndex));
      events.push({
        id: `credit-${credit.id}`,
        date: toISODate(new Date(year, monthIndex, day)),
        title: `Кредит: ${credit.title}`,
        amount: Number(credit.monthly_payment) || 0,
        type: 'credit',
        icon: '💳'
      });
    });

    utilitiesService.getPending().forEach((util) => {
      if (!util.due_date) return;
      const d = new Date(util.due_date);
      if (d.getFullYear() === year && d.getMonth() === monthIndex) {
        events.push({
          id: `util-${util.id}`,
          date: util.due_date,
          title: util.service,
          amount: Number(util.amount) || 0,
          type: 'utility',
          icon: '🏠'
        });
      }
    });

    requiredExpensesService.getPending().forEach((item) => {
      if (!item.due_date) return;
      const d = new Date(item.due_date);
      if (d.getFullYear() === year && d.getMonth() === monthIndex) {
        events.push({
          id: `req-${item.id}`,
          date: item.due_date,
          title: item.title,
          amount: Number(item.amount) || 0,
          type: 'required',
          icon: '📌'
        });
      }
    });

    goalsService.getActive().forEach((goal) => {
      if (!goal.deadline) return;
      const d = new Date(goal.deadline);
      if (d.getFullYear() === year && d.getMonth() === monthIndex) {
        events.push({
          id: `goal-${goal.id}`,
          date: goal.deadline,
          title: `Цель: ${goal.title}`,
          amount: Math.max(0, Number(goal.target) - Number(goal.saved)),
          type: 'goal',
          icon: goal.icon || '🎯'
        });
      }
    });

    return events.sort((a, b) => a.date.localeCompare(b.date));
  }

  getView(year, monthIndex) {
    const period = storage.getCurrentPeriod();
    const y = year ?? period?.year ?? new Date().getFullYear();
    const m = monthIndex ?? ((period?.month || 1) - 1);
    const events = this.getEventsForMonth(y, m);
    const byDate = {};
    events.forEach((ev) => {
      if (!byDate[ev.date]) byDate[ev.date] = [];
      byDate[ev.date].push(ev);
    });

    return {
      year: y,
      monthIndex: m,
      title: `${getMonthName(m)} ${y}`,
      cells: this.getMonthGrid(y, m),
      events,
      byDate
    };
  }
}

export const calendarService = new CalendarService();
export default calendarService;
