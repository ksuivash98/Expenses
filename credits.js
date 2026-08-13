/**
 * credits.js — кредиты и платежи
 */
import { storage } from './storage.js';
import { budgetService } from './budget.js';
import {
  addMonths, daysInMonth, downloadText, generateId, parseAmount, roundMoney,
  sortByDate, sumBy, todayISO, toISODate, validateRequired
} from './utils.js';

const STATUS_LABELS = {
  active: 'Активен',
  closed: 'Закрыт',
  paid: 'Закрыт'
};

export const CREDIT_SORT_OPTIONS = [
  { value: 'title', label: 'Название' },
  { value: 'bank', label: 'Банк' },
  { value: 'balance', label: 'Остаток' },
  { value: 'initial_amount', label: 'Начальная сумма' },
  { value: 'monthly_payment', label: 'Платеж' },
  { value: 'interest_rate', label: '%' },
  { value: 'overpayment', label: 'Переплата' },
  { value: 'payment_day', label: 'Дата платежа' },
  { value: 'months_left', label: 'Осталось месяцев' },
  { value: 'end_date', label: 'Дата окончания' },
  { value: 'status', label: 'Статус' }
];

export const CREDIT_FILTER_OPTIONS = [
  { value: 'all', label: 'Все' },
  { value: 'active', label: 'Активные' },
  { value: 'closed', label: 'Закрытые' },
  { value: 'overdue', label: 'Просроченные' },
  { value: 'ending_month', label: 'Заканчиваются в этом месяце' }
];

export const CREDIT_TABS = [
  { id: 'list', label: '🏦 Кредиты' },
  { id: 'summary', label: '📊 Сводная' },
  { id: 'calendar', label: '📅 Календарь' },
  { id: 'analytics', label: '📈 Аналитика' },
  { id: 'history', label: '📜 История' }
];

const DEFAULT_PREFS = {
  tab: 'list',
  sortBy: 'title',
  sortDir: 'asc',
  filter: 'all',
  search: ''
};

function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function safePct(part, total) {
  const t = safeNum(total);
  if (!(t > 0)) return 0;
  const p = (safeNum(part) / t) * 100;
  if (!Number.isFinite(p)) return 0;
  return Math.max(0, Math.min(100, roundMoney(p)));
}

function progressTone(percent) {
  const p = safeNum(percent);
  if (p <= 30) return 'red';
  if (p <= 70) return 'yellow';
  return 'green';
}

function nextPaymentDate(paymentDay, from = new Date()) {
  const day = Math.min(31, Math.max(1, Math.round(safeNum(paymentDay)) || 1));
  let year = from.getFullYear();
  let month = from.getMonth();
  if (from.getDate() > day) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  const d = Math.min(day, daysInMonth(year, month));
  return toISODate(new Date(year, month, d));
}

function monthsUntil(dateISO) {
  if (!dateISO) return null;
  const end = new Date(dateISO);
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  if (target <= today) return 0;
  let months = (target.getFullYear() - today.getFullYear()) * 12
    + (target.getMonth() - today.getMonth());
  if (target.getDate() < today.getDate()) months -= 1;
  return Math.max(0, months);
}

function daysUntil(dateISO) {
  if (!dateISO) return null;
  const end = new Date(dateISO);
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const diff = Math.round((target - today) / 86400000);
  return Number.isFinite(diff) ? Math.max(0, diff) : null;
}

export class CreditsService {
  getAll() {
    return sortByDate(storage.list('credits'), (c) => c.start_date || c.created_at, true);
  }

  getActive() {
    return this.getAll().filter((c) => c.status === 'active');
  }

  getById(id) {
    return storage.find('credits', id);
  }

  getPayments(creditId) {
    return sortByDate(
      storage.list('creditPayments').filter((p) => p.credit_id === creditId),
      (p) => p.date,
      true
    );
  }

  /**
   * Есть ли платёж по кредиту в указанном периоде (по дате YYYY-MM).
   */
  isPaidInPeriod(creditId, period = storage.getCurrentPeriod()) {
    if (!period) return false;
    const ym = `${period.year}-${String(period.month).padStart(2, '0')}`;
    return this.getPayments(creditId).some((p) => String(p.date || '').startsWith(ym));
  }

  dueDateForPeriod(credit, period = storage.getCurrentPeriod()) {
    if (!credit || !period) return null;
    const maxDay = daysInMonth(period.year, period.month - 1);
    const day = Math.min(Math.max(1, Number(credit.payment_day) || 1), maxDay);
    return `${period.year}-${String(period.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  /**
   * Сумма ежемесячных платежей активных кредитов, ещё НЕ оплаченных в текущем периоде.
   */
  getMonthlyRemaining(period = storage.getCurrentPeriod()) {
    return roundMoney(sumBy(
      this.getActive().filter((c) => !this.isPaidInPeriod(c.id, period)),
      (c) => safeNum(c.monthly_payment)
    ));
  }

  getMonthlyOverdue(period = storage.getCurrentPeriod()) {
    const today = todayISO();
    return roundMoney(sumBy(
      this.getActive().filter((c) => {
        if (this.isPaidInPeriod(c.id, period)) return false;
        const due = this.dueDateForPeriod(c, period);
        return due && due < today;
      }),
      (c) => safeNum(c.monthly_payment)
    ));
  }

  getMonthlyDueToday(period = storage.getCurrentPeriod()) {
    const today = todayISO();
    return roundMoney(sumBy(
      this.getActive().filter((c) => {
        if (this.isPaidInPeriod(c.id, period)) return false;
        return this.dueDateForPeriod(c, period) === today;
      }),
      (c) => safeNum(c.monthly_payment)
    ));
  }

  getObligationCard(period = storage.getCurrentPeriod()) {
    const remaining = this.getMonthlyRemaining(period);
    const overdue = this.getMonthlyOverdue(period);
    const today = this.getMonthlyDueToday(period);
    let status = 'paid';
    let statusLabel = '✓ Всё оплачено';
    let tone = 'green';
    if (overdue > 0) {
      status = 'overdue';
      statusLabel = `🔴 Просрочено`;
      tone = 'red';
    } else if (today > 0) {
      status = 'today';
      statusLabel = '🟠 Сегодня';
      tone = 'orange';
    } else if (remaining > 0) {
      status = 'pending';
      statusLabel = '🟡 Осталось оплатить';
      tone = 'yellow';
    }
    return { remaining, overdue, today, status, statusLabel, tone };
  }

  getTotalDebt() {
    return sumBy(this.getActive(), (c) => safeNum(c.current_balance));
  }

  getMonthlyPayments() {
    return sumBy(this.getActive(), (c) => safeNum(c.monthly_payment));
  }

  /**
   * Аналитика по одному кредиту (считается на лету, не хранится).
   */
  enrich(credit) {
    if (!credit) return null;

    const initialAmount = Math.max(0, safeNum(credit.initial_amount));
    const currentBalance = Math.max(0, safeNum(credit.current_balance));
    const monthlyPayment = Math.max(0, safeNum(credit.monthly_payment));
    const interestRate = Math.max(0, safeNum(credit.interest_rate));
    const paymentDay = Math.min(31, Math.max(1, Math.round(safeNum(credit.payment_day)) || 1));

    const remaining = currentBalance;
    const paid = roundMoney(Math.max(0, initialAmount - currentBalance));
    const progress = safePct(paid, initialAmount);
    const payments = this.getPayments(credit.id);
    const paidFromPayments = roundMoney(sumBy(payments, (p) => safeNum(p.amount)));
    const overpayment = roundMoney(Math.max(0, paidFromPayments - paid));

    const status = credit.status === 'active' ? 'active' : 'closed';
    const nextPayment = status === 'active' ? nextPaymentDate(paymentDay) : null;
    const daysUntilPayment = status === 'active' && nextPayment != null
      ? daysUntil(nextPayment)
      : null;

    let monthsLeft = null;
    let daysLeft = null;
    let estimatedCloseDate = null;

    if (status === 'closed' || currentBalance <= 0) {
      monthsLeft = 0;
      daysLeft = 0;
      estimatedCloseDate = credit.end_date || todayISO();
    } else if (credit.end_date) {
      monthsLeft = monthsUntil(credit.end_date);
      daysLeft = daysUntil(credit.end_date);
      estimatedCloseDate = credit.end_date;
      if (monthsLeft == null && monthlyPayment > 0) {
        monthsLeft = Math.ceil(currentBalance / monthlyPayment);
      }
    } else if (monthlyPayment > 0) {
      monthsLeft = Math.ceil(currentBalance / monthlyPayment);
      if (Number.isFinite(monthsLeft) && monthsLeft > 0) {
        estimatedCloseDate = addMonths(nextPayment || todayISO(), Math.max(0, monthsLeft - 1));
        daysLeft = daysUntil(estimatedCloseDate);
      } else {
        monthsLeft = 0;
      }
    }

    if (monthsLeft != null && !Number.isFinite(monthsLeft)) monthsLeft = null;
    if (daysLeft != null && !Number.isFinite(daysLeft)) daysLeft = null;

    const overdue = status === 'active' && this._isOverdue(credit.id, paymentDay);
    let urgency = 'gray';
    let urgencyIcon = '✔';
    let urgencyLabel = 'Закрыт';
    if (status === 'active') {
      if (overdue || (daysUntilPayment != null && daysUntilPayment < 5)) {
        urgency = 'red';
        urgencyIcon = '🔴';
        urgencyLabel = overdue ? 'Просрочен' : 'Скоро платёж';
      } else if (daysUntilPayment != null && daysUntilPayment <= 10) {
        urgency = 'yellow';
        urgencyIcon = '🟡';
        urgencyLabel = 'Скоро';
      } else {
        urgency = 'green';
        urgencyIcon = '🟢';
        urgencyLabel = 'В графике';
      }
    }

    return {
      ...credit,
      bank: credit.bank || '—',
      title: credit.title || '—',
      initial_amount: initialAmount,
      current_balance: currentBalance,
      monthly_payment: monthlyPayment,
      interest_rate: interestRate,
      payment_day: paymentDay,
      status,
      statusLabel: STATUS_LABELS[status] || '—',
      remaining,
      paid,
      overpayment,
      progress,
      progressTone: progressTone(progress),
      nextPayment,
      daysUntilPayment,
      monthsLeft,
      daysLeft,
      estimatedCloseDate,
      paidFromPayments,
      overdue,
      urgency,
      urgencyIcon,
      urgencyLabel
    };
  }

  _isOverdue(creditId, paymentDay) {
    const now = new Date();
    if (now.getDate() <= paymentDay) return false;
    const payments = this.getPayments(creditId);
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return !payments.some((p) => String(p.date || '').startsWith(ym));
  }

  getEnrichedAll() {
    return this.getAll().map((c) => this.enrich(c)).filter(Boolean);
  }

  getEnrichedActive() {
    return this.getEnrichedAll().filter((c) => c.status === 'active');
  }

  /**
   * Значение для сравнения при сортировке.
   */
  _sortValue(item, sortBy) {
    switch (sortBy) {
      case 'payment_date':
      case 'payment_day':
        return sortBy === 'payment_day'
          ? safeNum(item.payment_day)
          : (item.nextPayment || null);
      case 'balance':
        return safeNum(item.current_balance);
      case 'monthly_payment':
        return safeNum(item.monthly_payment);
      case 'interest_rate':
        return safeNum(item.interest_rate);
      case 'title':
        return String(item.title || '').toLocaleLowerCase('ru');
      case 'bank':
        return String(item.bank || '').toLocaleLowerCase('ru');
      case 'end_date':
        return item.end_date || item.estimatedCloseDate || null;
      case 'months_left':
        return item.monthsLeft;
      case 'overpayment':
        return safeNum(item.overpayment);
      case 'status':
        return item.status === 'active' ? 0 : 1;
      case 'initial_amount':
        return safeNum(item.initial_amount);
      default:
        return String(item.title || '').toLocaleLowerCase('ru');
    }
  }

  /**
   * Сортировка: закрытые всегда внизу, внутри групп — по выбранному полю.
   */
  sortItems(items, sortBy = DEFAULT_PREFS.sortBy, sortDir = DEFAULT_PREFS.sortDir) {
    const dir = sortDir === 'desc' ? -1 : 1;
    const key = (CREDIT_SORT_OPTIONS.some((o) => o.value === sortBy) || sortBy === 'payment_date')
      ? sortBy
      : DEFAULT_PREFS.sortBy;

    return [...(items || [])].sort((a, b) => {
      const aClosed = a.status === 'active' ? 0 : 1;
      const bClosed = b.status === 'active' ? 0 : 1;
      if (aClosed !== bClosed) return aClosed - bClosed;

      const av = this._sortValue(a, key);
      const bv = this._sortValue(b, key);

      const aEmpty = av == null || av === '';
      const bEmpty = bv == null || bv === '';
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;

      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv), 'ru', { numeric: true }) * dir;
      }
      return (safeNum(av) - safeNum(bv)) * dir;
    });
  }

  filterItems(items, filter = 'all', search = '') {
    const q = String(search || '').trim().toLocaleLowerCase('ru');
    const now = new Date();
    return (items || []).filter((item) => {
      if (filter === 'active' && item.status !== 'active') return false;
      if (filter === 'closed' && item.status === 'active') return false;
      if (filter === 'overdue' && !item.overdue) return false;
      if (filter === 'ending_month') {
        const end = item.end_date || item.estimatedCloseDate;
        if (!end) return false;
        const d = new Date(end);
        if (Number.isNaN(d.getTime())) return false;
        if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) return false;
      }
      if (!q) return true;
      const hay = `${item.title || ''} ${item.bank || ''}`.toLocaleLowerCase('ru');
      return hay.includes(q);
    });
  }

  getViewPreferences() {
    const settings = storage.getSettings() || {};
    const sortBy = CREDIT_SORT_OPTIONS.some((o) => o.value === settings.creditsSortBy)
      ? settings.creditsSortBy
      : DEFAULT_PREFS.sortBy;
    const sortDir = settings.creditsSortDir === 'desc' ? 'desc' : 'asc';
    const filter = CREDIT_FILTER_OPTIONS.some((o) => o.value === settings.creditsFilter)
      ? settings.creditsFilter
      : DEFAULT_PREFS.filter;
    const tab = CREDIT_TABS.some((t) => t.id === settings.creditsTab)
      ? settings.creditsTab
      : DEFAULT_PREFS.tab;
    const search = String(settings.creditsSearch || '');
    return { tab, sortBy, sortDir, filter, search };
  }

  /** @deprecated use getViewPreferences */
  getSortPreferences() {
    const p = this.getViewPreferences();
    return { sortBy: p.sortBy, sortDir: p.sortDir };
  }

  setViewPreferences(patch = {}) {
    const current = this.getViewPreferences();
    const next = {
      creditsTab: CREDIT_TABS.some((t) => t.id === patch.tab) ? patch.tab : current.tab,
      creditsSortBy: CREDIT_SORT_OPTIONS.some((o) => o.value === patch.sortBy)
        ? patch.sortBy
        : current.sortBy,
      creditsSortDir: patch.sortDir === 'desc' || patch.sortDir === 'asc'
        ? patch.sortDir
        : current.sortDir,
      creditsFilter: CREDIT_FILTER_OPTIONS.some((o) => o.value === patch.filter)
        ? patch.filter
        : current.filter,
      creditsSearch: patch.search != null ? String(patch.search) : current.search
    };
    storage.updateSettings(next);
    return this.getViewPreferences();
  }

  setSortPreferences(sortBy, sortDir) {
    return this.setViewPreferences({ sortBy, sortDir });
  }

  toggleSort(column) {
    const prefs = this.getViewPreferences();
    if (prefs.sortBy === column) {
      return this.setViewPreferences({ sortDir: prefs.sortDir === 'asc' ? 'desc' : 'asc' });
    }
    return this.setViewPreferences({ sortBy: column, sortDir: 'asc' });
  }

  getOperations(creditId = null) {
    const credits = this.getAll();
    const byId = new Map(credits.map((c) => [c.id, c]));
    const payments = storage.list('creditPayments', { allPeriods: true });
    const ops = payments
      .filter((p) => !creditId || p.credit_id === creditId)
      .map((p) => {
        const credit = byId.get(p.credit_id);
        const comment = String(p.comment || '');
        const isEarly = /досроч/i.test(comment) || p.kind === 'early';
        return {
          id: p.id,
          date: p.date || p.created_at,
          credit_id: p.credit_id,
          creditTitle: credit?.title || '—',
          bank: credit?.bank || '—',
          type: isEarly ? 'early' : 'payment',
          typeLabel: isEarly ? 'Досрочное погашение' : 'Платеж',
          amount: safeNum(p.amount),
          comment: comment || '—'
        };
      });

    const created = credits
      .filter((c) => !creditId || c.id === creditId)
      .map((c) => ({
        id: `created-${c.id}`,
        date: c.start_date || c.created_at,
        credit_id: c.id,
        creditTitle: c.title || '—',
        bank: c.bank || '—',
        type: 'create',
        typeLabel: 'Добавление',
        amount: safeNum(c.initial_amount),
        comment: 'Кредит добавлен'
      }));

    return sortByDate([...ops, ...created], (o) => o.date, true);
  }

  getReminders() {
    return this.getEnrichedActive().map((c) => {
      const days = c.overdue ? 0 : c.daysUntilPayment;
      let level = null;
      if (c.overdue) level = 'overdue';
      else if (days != null && days <= 1) level = 'day1';
      else if (days != null && days <= 3) level = 'day3';
      else if (days != null && days <= 7) level = 'day7';
      if (!level) return null;
      return {
        id: c.id,
        bank: c.bank,
        title: c.title,
        days: days ?? 0,
        amount: c.monthly_payment,
        nextPayment: c.nextPayment,
        level,
        overdue: Boolean(c.overdue)
      };
    }).filter(Boolean)
      .sort((a, b) => a.days - b.days);
  }

  getDebtTrend() {
    const payments = sortByDate(
      storage.list('creditPayments', { allPeriods: true }),
      (p) => p.date,
      false
    );
    const active = this.getEnrichedActive();
    let debt = roundMoney(sumBy(active, (c) => c.current_balance)
      + sumBy(payments, (p) => safeNum(p.amount)));
    const points = [{ label: 'Старт', amount: debt }];
    payments.forEach((p) => {
      debt = roundMoney(Math.max(0, debt - safeNum(p.amount)));
      points.push({
        label: String(p.date || '').slice(5, 10) || '—',
        amount: debt
      });
    });
    if (points.length === 1) {
      points.push({ label: 'Сейчас', amount: roundMoney(sumBy(active, (c) => c.current_balance)) });
    }
    return points.slice(-12);
  }

  exportJSON() {
    const data = {
      exported_at: new Date().toISOString(),
      credits: this.getEnrichedAll(),
      payments: storage.list('creditPayments', { allPeriods: true }),
      operations: this.getOperations()
    };
    downloadText(`credits-export-${todayISO()}.json`, JSON.stringify(data, null, 2));
    return { success: true, message: 'JSON экспортирован' };
  }

  exportExcel() {
    const rows = this.getEnrichedAll();
    const header = [
      'Название', 'Банк', 'Остаток', 'Начальная сумма', 'Платеж', '%',
      'Переплата', 'День платежа', 'Осталось месяцев', 'Дата окончания', 'Статус'
    ];
    const lines = [header.join(';')];
    rows.forEach((r) => {
      lines.push([
        r.title, r.bank, r.current_balance, r.initial_amount, r.monthly_payment,
        r.interest_rate, r.overpayment, r.payment_day, r.monthsLeft ?? '',
        r.end_date || r.estimatedCloseDate || '', r.statusLabel
      ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'));
    });
    downloadText(`credits-export-${todayISO()}.csv`, `\uFEFF${lines.join('\n')}`, 'text/csv;charset=utf-8');
    return { success: true, message: 'Excel/CSV экспортирован' };
  }

  exportPDF() {
    const rows = this.getEnrichedAll();
    const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Кредиты</title>
      <style>body{font-family:sans-serif;padding:24px}table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #ccc;padding:8px;text-align:left}h1{margin-bottom:16px}</style></head><body>
      <h1>Кредиты — экспорт ${todayISO()}</h1>
      <table><thead><tr>
        <th>Название</th><th>Банк</th><th>Остаток</th><th>Платеж</th><th>%</th><th>Статус</th>
      </tr></thead><tbody>
      ${rows.map((r) => `<tr>
        <td>${r.title}</td><td>${r.bank}</td><td>${r.current_balance}</td>
        <td>${r.monthly_payment}</td><td>${r.interest_rate}</td><td>${r.statusLabel}</td>
      </tr>`).join('')}
      </tbody></table>
      <script>window.onload=()=>window.print()</script>
      </body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      downloadText(`credits-export-${todayISO()}.html`, html, 'text/html');
    }
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return { success: true, message: 'PDF/печать открыты' };
  }

  getSummary(override = null) {
    const prefs = { ...this.getViewPreferences(), ...(override || {}) };
    const enriched = this.getEnrichedAll();
    const filtered = this.filterItems(enriched, prefs.filter, prefs.search);
    const items = this.sortItems(filtered, prefs.sortBy, prefs.sortDir);
    const cards = this.sortItems(enriched, 'payment_date', 'asc');
    const active = enriched.filter((c) => c.status === 'active');
    const closed = enriched.filter((c) => c.status !== 'active');
    const totalDebt = roundMoney(sumBy(active, (c) => c.current_balance));
    const monthly = roundMoney(sumBy(active, (c) => c.monthly_payment));
    const monthlyRemaining = this.getMonthlyRemaining();
    const obligation = this.getObligationCard();
    const totalInitial = roundMoney(sumBy(enriched, (c) => c.initial_amount));
    const totalPaid = roundMoney(sumBy(enriched, (c) => c.paid));
    const totalOverpayment = roundMoney(sumBy(enriched, (c) => c.overpayment));
    const avgRate = active.length
      ? roundMoney(sumBy(active, (c) => c.interest_rate) / active.length)
      : 0;
    const avgOverpayment = enriched.length
      ? roundMoney(sumBy(enriched, (c) => c.overpayment) / enriched.length)
      : 0;
    const avgProgress = active.length
      ? roundMoney(sumBy(active, (c) => c.progress) / active.length)
      : (enriched.length ? roundMoney(sumBy(enriched, (c) => c.progress) / enriched.length) : 0);

    const upcoming = active
      .filter((c) => c.nextPayment)
      .sort((a, b) => String(a.nextPayment).localeCompare(String(b.nextPayment)));

    const nearest = upcoming[0] || null;
    const daysToNext = nearest
      ? (nearest.overdue ? 0 : (nearest.daysUntilPayment ?? null))
      : null;

    const chartItems = active
      .filter((c) => c.current_balance > 0)
      .map((c, i) => ({
        name: c.title,
        amount: c.current_balance,
        color: `hsl(${(i * 47) % 360} 70% 55%)`
      }));

    const monthlyBars = active.map((c, i) => ({
      label: c.title,
      amount: c.monthly_payment,
      color: `hsl(${(i * 47 + 20) % 360} 70% 55%)`
    }));

    return {
      totalDebt,
      monthly,
      monthlyRemaining,
      obligation,
      count: active.length,
      closedCount: closed.length,
      totalCount: enriched.length,
      filteredCount: items.length,
      totalInitial,
      totalPaid,
      totalOverpayment,
      avgRate: Number.isFinite(avgRate) ? avgRate : 0,
      avgOverpayment: Number.isFinite(avgOverpayment) ? avgOverpayment : 0,
      avgProgress: Number.isFinite(avgProgress) ? avgProgress : 0,
      avgProgressTone: progressTone(avgProgress),
      nearestPayment: nearest ? nearest.nextPayment : null,
      nearestTitle: nearest ? `${nearest.bank} · ${nearest.title}` : null,
      nearestAmount: nearest ? nearest.monthly_payment : 0,
      daysToNext,
      upcoming: upcoming.slice(0, 12),
      widgetUpcoming: upcoming.slice(0, 5),
      chartItems,
      monthlyBars,
      debtTrend: this.getDebtTrend(),
      operations: this.getOperations(),
      reminders: this.getReminders(),
      tabs: CREDIT_TABS,
      tab: prefs.tab,
      sortBy: prefs.sortBy,
      sortDir: prefs.sortDir,
      filter: prefs.filter,
      search: prefs.search,
      sortOptions: CREDIT_SORT_OPTIONS,
      filterOptions: CREDIT_FILTER_OPTIONS,
      items,
      cards,
      active
    };
  }

  validate(data) {
    const base = validateRequired(data, ['bank', 'title', 'initial_amount', 'current_balance', 'monthly_payment', 'payment_day']);
    const errors = { ...base.errors };
    if (!(parseAmount(data.initial_amount) >= 0)) errors.initial_amount = 'Некорректная сумма';
    if (!(parseAmount(data.current_balance) >= 0)) errors.current_balance = 'Некорректный остаток';
    const day = Number(data.payment_day);
    if (!(day >= 1 && day <= 31)) errors.payment_day = 'День платежа 1–31';
    return { valid: Object.keys(errors).length === 0, errors };
  }

  add(data) {
    const validation = this.validate(data);
    if (!validation.valid) return { success: false, errors: validation.errors, message: 'Проверьте форму' };

    const row = {
      id: generateId(),
      bank: String(data.bank).trim(),
      title: String(data.title).trim(),
      initial_amount: roundMoney(parseAmount(data.initial_amount)),
      current_balance: roundMoney(parseAmount(data.current_balance)),
      monthly_payment: roundMoney(parseAmount(data.monthly_payment)),
      interest_rate: roundMoney(parseAmount(data.interest_rate || 0)),
      payment_day: Number(data.payment_day),
      start_date: data.start_date || todayISO(),
      end_date: data.end_date || '',
      status: 'active',
      notes: String(data.notes || '').trim()
    };

    storage.batch((db) => {
      db.add('credits', row);
      db.add('history', {
        id: generateId(),
        type: 'credit',
        title: `Добавлен кредит: ${row.title}`,
        amount: row.current_balance,
        description: row.bank,
        icon: '💳',
        date: new Date().toISOString()
      });
    });

    return { success: true, data: row };
  }

  update(id, data) {
    const existing = this.getById(id);
    if (!existing) return { success: false, message: 'Кредит не найден' };
    const merged = { ...existing, ...data };
    const validation = this.validate(merged);
    if (!validation.valid) return { success: false, errors: validation.errors, message: 'Проверьте форму' };

    const updated = storage.update('credits', id, {
      bank: String(merged.bank).trim(),
      title: String(merged.title).trim(),
      initial_amount: roundMoney(parseAmount(merged.initial_amount)),
      current_balance: roundMoney(parseAmount(merged.current_balance)),
      monthly_payment: roundMoney(parseAmount(merged.monthly_payment)),
      interest_rate: roundMoney(parseAmount(merged.interest_rate || 0)),
      payment_day: Number(merged.payment_day),
      start_date: merged.start_date || existing.start_date,
      end_date: merged.end_date || '',
      notes: String(merged.notes || '').trim(),
      status: merged.status || existing.status
    });
    return { success: true, data: updated };
  }

  pay(creditId, amountValue, budgetCategoryId, date = todayISO(), comment = '', kind = 'payment') {
    const credit = this.getById(creditId);
    if (!credit) return { success: false, message: 'Кредит не найден' };
    if (credit.status !== 'active') return { success: false, message: 'Кредит не активен' };

    const amount = roundMoney(parseAmount(amountValue));
    if (!(amount > 0)) return { success: false, message: 'Сумма должна быть больше нуля' };

    const category = budgetService.getCategoryById(budgetCategoryId);
    if (!category) return { success: false, message: 'Конверт не найден' };
    const balance = budgetService.getCategoryBalance(category.id).balance;
    if (amount > balance) {
      return { success: false, message: `Недостаточно средств в «${category.name}»` };
    }

    const newBalance = roundMoney(Math.max(0, Number(credit.current_balance) - amount));
    const closed = newBalance <= 0;
    const isEarly = kind === 'early' || /досроч/i.test(String(comment || ''));

    storage.batch((db) => {
      db.add('creditPayments', {
        id: generateId(),
        credit_id: creditId,
        amount,
        date,
        budget_category: budgetCategoryId,
        kind: isEarly ? 'early' : 'payment',
        comment: comment || (isEarly
          ? `Досрочное погашение «${credit.title}»`
          : `Платёж по кредиту «${credit.title}»`)
      });
      db.add('budgetTransactions', {
        id: generateId(),
        category_id: budgetCategoryId,
        amount: -amount,
        type: 'credit_payment',
        date,
        comment: `Кредит: ${credit.title}`,
        credit_id: creditId
      });
      db.update('credits', creditId, {
        current_balance: newBalance,
        status: closed ? 'closed' : 'active'
      });
      db.add('history', {
        id: generateId(),
        type: 'credit_payment',
        title: closed
          ? `Кредит закрыт: ${credit.title}`
          : (isEarly ? `Досрочное погашение: ${credit.title}` : `Платёж по кредиту: ${credit.title}`),
        amount,
        description: category.name,
        icon: closed ? '✅' : (isEarly ? '⚡' : '💳'),
        date: new Date().toISOString()
      });
    });

    return { success: true, closed };
  }

  remove(id) {
    const existing = this.getById(id);
    if (!existing) return { success: false, message: 'Кредит не найден' };
    if (this.getPayments(id).length) {
      return { success: false, message: 'Нельзя удалить кредит с платежами' };
    }
    storage.remove('credits', id);
    return { success: true };
  }
}

export const creditsService = new CreditsService();
export default creditsService;
