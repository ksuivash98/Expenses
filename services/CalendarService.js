/**
 * services/CalendarService.js — события текущего финансового периода
 */
import { TABLES } from '../config.js';
import { databaseService } from './DatabaseService.js';
import { creditService } from './CreditService.js';
import { utilityService } from './UtilityService.js';
import { goalsService } from './GoalsService.js';
import { periodService } from './PeriodService.js';
import { daysInMonth, getMonthName, getWeekdayShort, toISODate } from '../helpers/utils.js';

export class CalendarService {
  /**
   * События месяца (календарный month 0–11).
   */
  getEventsForMonth(year, month) {
    const days = daysInMonth(year, month);
    const start = toISODate(new Date(year, month, 1));
    const end = toISODate(new Date(year, month, days));
    const events = [];
    const period = periodService.getAll().find((p) => p.year === year && p.month === month + 1);

    creditService.getActive().forEach((credit) => {
      const paymentDay = Math.min(Number(credit.payment_day) || 1, days);
      const date = toISODate(new Date(year, month, paymentDay));
      if (credit.start_date && date < credit.start_date) return;
      if (credit.end_date && date > credit.end_date) return;
      events.push({
        id: `credit_${credit.id}_${date}`, date, type: 'credit',
        title: credit.title, subtitle: credit.bank || 'Кредит',
        amount: Number(credit.monthly_payment) || 0, icon: '💳', color: '#F31260', link: 'credits'
      });
    });

    utilityService.getAll().forEach((item) => {
      if (!item.due_date || item.due_date < start || item.due_date > end) return;
      events.push({
        id: `utility_${item.id}`, date: item.due_date, type: 'utility',
        title: item.service, subtitle: item.status === 'paid' ? 'Оплачено' : 'К оплате',
        amount: Number(item.amount) || 0, icon: '🏠', color: '#5B8DEF',
        status: item.status, link: 'utilities'
      });
    });

    goalsService.getActive().forEach((goal) => {
      if (!goal.deadline || goal.deadline < start || goal.deadline > end) return;
      const enriched = goalsService.enrich(goal);
      events.push({
        id: `goal_${goal.id}`, date: goal.deadline, type: 'goal',
        title: goal.title, subtitle: 'Дедлайн цели', amount: enriched.remaining,
        icon: goal.icon || '🎯', color: '#36C6A0', link: 'goals'
      });
    });

    databaseService.list(TABLES.income).forEach((item) => {
      if (!item.date || item.date < start || item.date > end) return;
      events.push({
        id: `income_${item.id}`, date: item.date, type: 'income',
        title: item.title, subtitle: item.source || 'Доход',
        amount: Number(item.amount) || 0, icon: '💰', color: '#2DD4BF', link: 'income'
      });
    });

    databaseService.list(TABLES.expenses).forEach((item) => {
      if (!item.date || item.date < start || item.date > end) return;
      events.push({
        id: `expense_${item.id}`, date: item.date, type: 'expense',
        title: item.name || item.category, subtitle: 'Покупка',
        amount: Number(item.amount) || 0, icon: '🛒', color: '#F5A524', link: 'expenses'
      });
    });

    databaseService.list(TABLES.regularPayments).forEach((item) => {
      const day = Math.min(Number(item.day_of_month) || 1, days);
      const date = toISODate(new Date(year, month, day));
      events.push({
        id: `regular_${item.id}_${date}`, date, type: 'regular',
        title: item.title, subtitle: 'Регулярный платёж',
        amount: Number(item.amount) || 0, icon: '🔁', color: '#9353D3', link: 'budget'
      });
    });

    if (period?.closed_at) {
      const closeDate = String(period.closed_at).slice(0, 10);
      if (closeDate >= start && closeDate <= end) {
        events.push({
          id: `close_${period.id}`, date: closeDate, type: 'period_close',
          title: 'Закрытие периода', subtitle: periodService.formatPeriodTitle(period),
          amount: 0, icon: '📕', color: '#FF4D6D', link: 'archive'
        });
      }
    }

    return events.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  getEventsForDate(dateISO) {
    const date = new Date(dateISO);
    return this.getEventsForMonth(date.getFullYear(), date.getMonth())
      .filter((e) => e.date === dateISO);
  }

  buildMonthGrid(year, month) {
    const totalDays = daysInMonth(year, month);
    const firstWeekday = new Date(year, month, 1).getDay();
    const startOffset = firstWeekday === 0 ? 6 : firstWeekday - 1;
    const events = this.getEventsForMonth(year, month);
    const byDate = events.reduce((acc, e) => {
      if (!acc[e.date]) acc[e.date] = [];
      acc[e.date].push(e);
      return acc;
    }, {});

    const cells = [];
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const prevDays = daysInMonth(prevYear, prevMonth);

    for (let i = startOffset; i > 0; i -= 1) {
      const day = prevDays - i + 1;
      cells.push({ day, date: toISODate(new Date(prevYear, prevMonth, day)), inMonth: false, events: [] });
    }
    for (let day = 1; day <= totalDays; day += 1) {
      const date = toISODate(new Date(year, month, day));
      cells.push({ day, date, inMonth: true, events: byDate[date] || [] });
    }
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    let nextDay = 1;
    while (cells.length % 7 !== 0) {
      cells.push({
        day: nextDay,
        date: toISODate(new Date(nextYear, nextMonth, nextDay)),
        inMonth: false,
        events: []
      });
      nextDay += 1;
    }

    return {
      year, month, title: `${getMonthName(month)} ${year}`,
      weekdays: [1, 2, 3, 4, 5, 6, 0].map((d) => getWeekdayShort(d)),
      cells, events,
      totalAmount: events.reduce((s, e) => s + (Number(e.amount) || 0), 0)
    };
  }

  getUpcoming(daysAhead = 30) {
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + daysAhead);
    const result = [];
    let cursor = new Date(today.getFullYear(), today.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= endMonth) {
      this.getEventsForMonth(cursor.getFullYear(), cursor.getMonth()).forEach((event) => {
        const d = new Date(event.date);
        if (d >= new Date(toISODate(today)) && d <= end) result.push(event);
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    return result.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  getDashboardPayments(limit = 8) {
    return this.getUpcoming(45).slice(0, limit);
  }
}

export const calendarService = new CalendarService();
export default calendarService;
