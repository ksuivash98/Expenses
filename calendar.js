/**
 * calendar.js
 * Календарь платежей: кредиты, коммуналка, цели, регулярные события.
 */

import { creditsService } from './credits.js';
import { utilitiesService } from './utilities.js';
import { goalsService } from './goals.js';
import {
  daysInMonth,
  getMonthName,
  getWeekdayShort,
  toISODate
} from './utils.js';

/**
 * Сервис финансового календаря.
 */
export class CalendarService {
  /**
   * Собирает все события на указанный месяц.
   * @param {number} year
   * @param {number} month Индекс 0–11.
   * @returns {Array<object>}
   */
  getEventsForMonth(year, month) {
    const days = daysInMonth(year, month);
    const start = toISODate(new Date(year, month, 1));
    const end = toISODate(new Date(year, month, days));
    const events = [];

    creditsService.getActive().forEach((credit) => {
      const paymentDay = Math.min(Number(credit.paymentDay) || 1, days);
      const date = toISODate(new Date(year, month, paymentDay));

      if (credit.startDate && date < credit.startDate) return;
      if (credit.endDate && date > credit.endDate) return;

      events.push({
        id: `credit_${credit.id}_${date}`,
        date,
        type: 'credit',
        title: credit.name,
        subtitle: credit.bank || 'Кредит',
        amount: Number(credit.monthlyPayment) || 0,
        icon: '💳',
        color: '#F31260',
        link: 'credits',
        refId: credit.id
      });
    });

    utilitiesService.getAllEnriched().forEach((item) => {
      if (!item.dueDate) return;
      if (item.dueDate < start || item.dueDate > end) return;

      events.push({
        id: `utility_${item.id}`,
        date: item.dueDate,
        type: 'utility',
        title: item.typeName || item.name,
        subtitle: item.status === 'paid' ? 'Оплачено' : 'К оплате',
        amount: Number(item.amount) || 0,
        icon: item.typeIcon || '🏠',
        color: item.typeColor || '#5B8DEF',
        status: item.status,
        link: 'utilities',
        refId: item.id
      });
    });

    goalsService.getActive().forEach((goal) => {
      if (!goal.deadline) return;
      if (goal.deadline < start || goal.deadline > end) return;

      const enriched = goalsService.enrich(goal);
      events.push({
        id: `goal_${goal.id}`,
        date: goal.deadline,
        type: 'goal',
        title: goal.name,
        subtitle: `Осталось накопить`,
        amount: enriched.remaining,
        icon: goal.icon || '🎯',
        color: '#36C6A0',
        link: 'goals',
        refId: goal.id
      });
    });

    return events.sort((a, b) => {
      const byDate = String(a.date).localeCompare(String(b.date));
      if (byDate !== 0) return byDate;
      return String(a.title).localeCompare(String(b.title), 'ru');
    });
  }

  /**
   * События на конкретную дату.
   * @param {string} dateISO
   * @returns {Array<object>}
   */
  getEventsForDate(dateISO) {
    const date = new Date(dateISO);
    return this.getEventsForMonth(date.getFullYear(), date.getMonth())
      .filter((event) => event.date === dateISO);
  }

  /**
   * Строит сетку календаря на месяц (включая дни соседних месяцев).
   * @param {number} year
   * @param {number} month
   * @returns {object}
   */
  buildMonthGrid(year, month) {
    const totalDays = daysInMonth(year, month);
    const firstWeekday = new Date(year, month, 1).getDay();
    const startOffset = firstWeekday === 0 ? 6 : firstWeekday - 1;
    const events = this.getEventsForMonth(year, month);
    const eventsByDate = events.reduce((acc, event) => {
      if (!acc[event.date]) acc[event.date] = [];
      acc[event.date].push(event);
      return acc;
    }, {});

    const cells = [];

    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const prevDays = daysInMonth(prevYear, prevMonth);

    for (let i = startOffset; i > 0; i -= 1) {
      const day = prevDays - i + 1;
      cells.push({
        day,
        date: toISODate(new Date(prevYear, prevMonth, day)),
        inMonth: false,
        events: []
      });
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const date = toISODate(new Date(year, month, day));
      cells.push({
        day,
        date,
        inMonth: true,
        events: eventsByDate[date] || []
      });
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
      year,
      month,
      title: `${getMonthName(month)} ${year}`,
      weekdays: [1, 2, 3, 4, 5, 6, 0].map((d) => getWeekdayShort(d)),
      cells,
      events,
      totalAmount: events.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
    };
  }

  /**
   * Все ближайшие события от сегодня на N дней вперёд.
   * @param {number} [daysAhead=30]
   * @returns {Array<object>}
   */
  getUpcoming(daysAhead = 30) {
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + daysAhead);

    const result = [];
    let cursor = new Date(today.getFullYear(), today.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

    while (cursor <= endMonth) {
      const monthEvents = this.getEventsForMonth(cursor.getFullYear(), cursor.getMonth());
      monthEvents.forEach((event) => {
        const d = new Date(event.date);
        if (d >= new Date(toISODate(today)) && d <= end) {
          result.push(event);
        }
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    return result.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  /**
   * Сводка ближайших платежей для Dashboard.
   * @param {number} [limit=8]
   * @returns {Array<object>}
   */
  getDashboardPayments(limit = 8) {
    return this.getUpcoming(45).slice(0, limit);
  }
}

/** Единственный экземпляр сервиса календаря. */
export const calendarService = new CalendarService();

export default calendarService;
