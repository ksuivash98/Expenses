/**
 * components/AppUI.js
 * Complete UI controller for the personal finance application.
 */

import incomeService from '../services/IncomeService.js';
import budgetService from '../services/BudgetService.js';
import expenseService, { EXPENSE_CATEGORIES } from '../services/ExpenseService.js';
import creditService from '../services/CreditService.js';
import utilityService from '../services/UtilityService.js';
import goalsService from '../services/GoalsService.js';
import analyticsService from '../services/AnalyticsService.js';
import calendarService from '../services/CalendarService.js';
import historyService from '../services/HistoryService.js';
import notificationService from '../services/NotificationService.js';
import settingsService from '../services/SettingsService.js';
import profileService from '../services/ProfileService.js';
import databaseService from '../services/DatabaseService.js';
import syncService from '../services/SyncService.js';
import authService from '../services/AuthService.js';
import periodService from '../services/PeriodService.js';
import { PERIOD_STATUS_LABELS, CARRY_RULE_LABELS } from '../config.js';
import { escapeHtml, formatDate, formatDateTime, todayISO, animateNumber, getMonthName, downloadText } from '../helpers/utils.js';
import { formatMoney } from '../helpers/format.js';
import chartsService from './charts.js';
import toast from './toast.js';

const PAGE_TITLES = {
  dashboard: 'Главная',
  income: 'Доходы',
  budget: 'Бюджет',
  credits: 'Кредиты',
  utilities: 'Коммунальные услуги',
  expenses: 'Расходы',
  goals: 'Цели',
  calendar: 'Календарь',
  analytics: 'Аналитика',
  compare: 'Сравнение периодов',
  archive: 'Архив',
  history: 'История',
  profile: 'Профиль',
  settings: 'Настройки'
};

/**
 * UI controller for rendering pages, binding events and dispatching user actions.
 * Reads data from services and delegates mutations to FinanceApp methods when available.
 */
export class AppUI {
  /**
   * @param {object} app Finance application instance with mutation methods.
   */
  constructor(app) {
    this.app = app;
    this.currentPage = 'dashboard';
    this.calendarYear = new Date().getFullYear();
    this.calendarMonth = new Date().getMonth();
    this.selectedCalendarDate = todayISO();
    this.historyFilter = 'all';
    this.historyQuery = '';
    this.compareMode = 'two';
    this.compareYear = new Date().getFullYear();
    this.currentUser = authService.session?.user || null;
    this.pages = Object.keys(PAGE_TITLES);
  }

  /**
   * Initializes DOM references, shell controls, sync listeners and first render.
   * @returns {Promise<void>}
   */
  async init() {
    this.content = document.getElementById('page-content') || document.querySelector('[data-page-content]') || document.querySelector('main');
    this.pageTitle = document.getElementById('page-title');
    this.modalRoot = document.getElementById('modal-root') || this.createRoot('modal-root');
    this.toastRoot = document.getElementById('toast-root') || this.createRoot('toast-root');
    this.sidebar = document.getElementById('sidebar');
    this.overlay = document.getElementById('sidebar-overlay');

    await this.loadUser();
    this.bindShellEvents();
    syncService.start();
    databaseService.subscribe(() => {
      this.updateSyncBadge();
      this.updateNotificationBadge();
      this.refresh();
    });
    window.addEventListener('resize', () => {
      if (this.currentPage === 'analytics') this.refresh();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.closeModal();
    });
    await notificationService.refreshFromData();
    this.updateSyncBadge();
    this.updateNotificationBadge();
  }

  /**
   * Navigates to an application page by id.
   * @param {string} pageId
   */
  navigate(pageId) {
    this.currentPage = this.pages.includes(pageId) ? pageId : 'dashboard';
    document.querySelectorAll('[data-nav]').forEach((element) => {
      element.classList.toggle('active', element.dataset.nav === this.currentPage);
    });
    if (this.pageTitle) this.pageTitle.textContent = PAGE_TITLES[this.currentPage];
    this.closeSidebar();
    this.refresh();
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  }

  /**
   * Re-renders the current page and binds page-level interactions.
   */
  refresh() {
    if (!this.content || this._refreshing) return;
    this._refreshing = true;
    try {
      const renderer = this[`render${this.toPascal(this.currentPage)}`] || this.renderDashboard;
      this.content.innerHTML = renderer.call(this);
      this.content.classList.remove('fade-in');
      void this.content.offsetWidth;
      this.content.classList.add('fade-in');
      this.bindPageEvents();
      this.renderCharts();
      this.updateHeaderStats();
      this.updateNotificationBadge();
      this.updateSyncBadge();
      this.updatePeriodSwitcher();
    } finally {
      this._refreshing = false;
    }
  }

  /**
   * Shows a toast message.
   * @param {string} message
   * @param {string} [type='info']
   */
  toast(message, type = 'info') {
    toast.root = toast.root || this.toastRoot;
    toast.show(message, type);
  }

  /**
   * Opens a reusable modal dialog.
   * @param {string} title
   * @param {string} bodyHtml
   * @param {(data: object, form: HTMLFormElement) => Promise<void>|void} onSubmit
   * @param {object} [options]
   */
  openModal(title, bodyHtml, onSubmit, options = {}) {
    const submitText = options.submitText || 'Сохранить';
    const wide = options.wide ? ' wide' : '';
    this.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal glass${wide}" role="dialog" aria-modal="true">
          <div class="modal-head">
            <h3>${escapeHtml(title)}</h3>
            <button type="button" class="icon-btn" data-modal-close aria-label="Закрыть">x</button>
          </div>
          <form id="modal-form" class="modal-body">
            ${bodyHtml}
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" data-modal-close>Отмена</button>
              <button type="submit" class="btn btn-primary">${escapeHtml(submitText)}</button>
            </div>
          </form>
        </div>
      </div>
    `;
    this.modalRoot.querySelectorAll('[data-modal-close]').forEach((button) => {
      button.addEventListener('click', () => this.closeModal());
    });
    this.modalRoot.querySelector('.modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.classList.contains('modal-backdrop')) this.closeModal();
    });
    this.modalRoot.querySelector('#modal-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        await onSubmit(Object.fromEntries(new FormData(form).entries()), form);
      } finally {
        submit.disabled = false;
      }
    });
  }

  /**
   * Closes the active modal.
   */
  closeModal() {
    if (this.modalRoot) this.modalRoot.innerHTML = '';
  }

  /**
   * Opens a confirmation modal for destructive operations.
   * @param {string} message
   * @param {() => Promise<void>|void} onConfirm
   */
  confirmDelete(message, onConfirm) {
    this.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal glass compact" role="dialog" aria-modal="true">
          <div class="modal-head"><h3>Подтверждение</h3></div>
          <div class="modal-body">
            <p>${escapeHtml(message)}</p>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" data-modal-close>Отмена</button>
              <button type="button" class="btn btn-danger" id="confirm-action">Подтвердить</button>
            </div>
          </div>
        </div>
      </div>
    `;
    this.modalRoot.querySelector('[data-modal-close]')?.addEventListener('click', () => this.closeModal());
    this.modalRoot.querySelector('#confirm-action')?.addEventListener('click', async () => {
      this.closeModal();
      try {
        await onConfirm();
      } catch (error) {
        this.toast(error.message || 'Ошибка действия', 'error');
      }
    });
  }

  /**
   * Dispatches clicks and change events from data-action attributes.
   * @param {string} action
   * @param {string} id
   * @param {HTMLElement} el
   * @param {Event} event
   * @returns {Promise<void>}
   */
  async handleAction(action, id, el, event) {
    const actions = {
      'income-add': () => this.openIncomeModal(),
      'income-edit': () => this.openIncomeModal(id),
      'income-delete': () => this.confirmDelete('Удалить доход?', () => this.runMutation('deleteIncome', [id], () => incomeService.remove(id), 'Доход удалён')),
      'income-distribute': () => this.openDistributeModal(id),

      'budget-add-category': () => this.openCategoryModal(),
      'budget-edit-category': () => this.openCategoryModal(id),
      'budget-delete-category': () => this.confirmDelete('Удалить конверт?', () => this.runMutation('deleteCategory', [id], () => budgetService.deleteCategory(id), 'Конверт удалён')),
      'budget-transfer': () => this.openTransferModal(),
      'budget-distribute': () => this.openDistributeModal(),
      'budget-show-history': () => this.openEnvelopeHistory(id),
      'carry-rule-edit': () => this.openCarryRuleModal(id),

      'expense-add': () => this.openExpenseModal(),
      'expense-delete': () => this.confirmDelete('Удалить расход?', () => this.runMutation('deleteExpense', [id], () => expenseService.remove(id), 'Расход удалён')),

      'credit-add': () => this.openCreditModal(),
      'credit-edit': () => this.openCreditModal(id),
      'credit-pay': () => this.openCreditPayModal(id),
      'credit-history': () => this.openCreditHistory(id),
      'credit-close': () => this.confirmDelete('Закрыть кредит?', () => this.runMutation('closeCredit', [id], () => creditService.close(id), 'Кредит закрыт')),
      'credit-delete': () => this.confirmDelete('Удалить кредит?', () => this.runMutation('deleteCredit', [id], () => creditService.remove(id), 'Кредит удалён')),

      'utility-ensure-month': () => this.runMutation('ensureUtilityMonth', [], () => utilityService.ensureMonthRecords(), 'Записи месяца готовы'),
      'utility-edit': () => this.openUtilityModal(id),
      'utility-pay': () => this.openUtilityPayModal(id),
      'utility-delete': () => this.confirmDelete('Удалить коммунальную запись?', () => this.runMutation('deleteUtility', [id], () => utilityService.remove(id), 'Запись удалена')),

      'goal-add': () => this.openGoalModal(),
      'goal-edit': () => this.openGoalModal(id),
      'goal-fund': () => this.openGoalFundModal(id),
      'goal-complete': () => this.runMutation('completeGoal', [id], () => goalsService.complete(id), 'Цель выполнена'),
      'goal-delete': () => this.confirmDelete('Удалить цель?', () => this.runMutation('deleteGoal', [id], () => goalsService.remove(id), 'Цель удалена')),

      'calendar-prev': () => this.shiftCalendar(-1),
      'calendar-next': () => this.shiftCalendar(1),
      'calendar-select': () => {
        this.selectedCalendarDate = id;
        this.refresh();
      },

      'period-select': async () => {
        const result = await (typeof this.app?.switchPeriod === 'function' ? this.app.switchPeriod(id) : periodService.switchPeriod(id));
        await this.applyResult(result, 'Период переключён');
      },
      'period-open-new': () => this.openNewPeriodModal(),
      'period-close': () => this.openClosePeriodModal(),
      'period-unlock': () => this.confirmDelete('Разблокировать закрытый период для редактирования?', () => this.runMutation('unlockPeriod', [id, true], () => periodService.unlockEditing(id, true), 'Период разблокирован')),
      'plan-edit': () => this.openPlanModal(),
      'archive-open': async () => {
        const result = await (typeof this.app?.switchPeriod === 'function' ? this.app.switchPeriod(id) : periodService.switchPeriod(id));
        if (await this.applyResult(result, 'Период открыт')) this.navigate('dashboard');
      },
      'archive-export': () => this.exportPeriod(id),
      'archive-restore': () => this.runMutation('restoreArchive', [id], () => periodService.restoreFromArchive(id), 'Период восстановлен'),
      'compare-run': () => this.runCompareFromPage(),
      'report-view': () => this.showReportModal(id),

      'profile-avatar-click': () => document.getElementById('profile-avatar-input')?.click(),
      'profile-avatar-change': () => this.changeAvatar(event.target.files?.[0]),
      'profile-delete-account': () => this.confirmDelete('Удалить аккаунт и данные пользователя?', () => this.runMutation('deleteAccount', [], () => profileService.deleteAccount(), 'Аккаунт удалён')),

      'settings-theme': () => this.setTheme(el.dataset.theme),
      'settings-currency': () => this.setCurrency(el.dataset.currency),
      'settings-export-json': () => settingsService.exportJSON(),
      'settings-export-csv': () => settingsService.exportCSV(),
      'settings-export-pdf': () => settingsService.exportPDF(),
      'settings-import': () => document.getElementById('import-file')?.click(),
      'settings-import-change': () => this.importData(event.target.files?.[0]),
      'settings-sync': () => this.syncNow(),
      'settings-logout': () => this.logout(),
      'nav': () => this.navigate(id)
    };

    if (actions[action]) await actions[action]();
  }

  /**
   * Returns current currency code from settings.
   * @returns {string}
   */
  currency() {
    return settingsService.get().currency || 'RUB';
  }

  /**
   * Renders the dashboard page.
   * @returns {string}
   */
  renderDashboard() {
    const currency = this.currency();
    const income = incomeService.getSummary();
    const budget = budgetService.getSummary();
    const expenses = expenseService.getSummary();
    const credits = creditService.getSummary();
    const utilities = utilityService.getSummary();
    const goals = goalsService.getSummary();
    const recent = historyService.getRecent(8);
    const payments = calendarService.getDashboardPayments(6);
    const currentPeriod = periodService.getCurrent();
    const canEdit = databaseService.canEditCurrentPeriod();
    const plan = periodService.getPlan();
    const periodTitle = currentPeriod ? periodService.formatPeriodTitle(currentPeriod) : 'Период не выбран';
    const periodPlanCards = plan ? [
      ['Доход', plan.planned_income, plan.actual_income, plan.incomeDev],
      ['Расходы', plan.planned_expense, plan.actual_expense, plan.expenseDev],
      ['Накопления', plan.planned_savings, plan.actual_savings, plan.savingsDev],
      ['Кредиты', plan.planned_credits, plan.actual_credits, plan.creditsDev]
    ] : [];
    const cards = [
      ['Общий доход', income.totalIncome, 'money', 'blue'],
      ['Свободные деньги', income.freeMoney, 'wallet', 'green'],
      ['Распределено', income.totalDistributed, 'box', 'cyan'],
      ['Потрачено', expenses.totalSpent, 'cart', 'orange'],
      ['Конверты', budget.totalBalance, 'briefcase', 'purple'],
      ['Накопления', budget.savings + goals.totalSaved, 'gem', 'mint'],
      ['Кредиты', credits.totalDebt, 'card', 'red'],
      ['ЖКХ месяц', utilities.monthTotal || utilities.monthPending, 'home', 'yellow']
    ];

    return `
      <section class="hero-panel glass">
        <div>
          <p class="eyebrow">Личный финансовый кабинет</p>
          <h2>Финансы под контролем</h2>
          <p class="muted">Доходы, конверты, расходы, кредиты и цели синхронизируются для текущего пользователя.</p>
        </div>
        <div class="hero-actions">
          <button class="btn btn-primary" data-action="income-add">+ Доход</button>
          <button class="btn btn-ghost" data-action="budget-distribute">Распределить</button>
          <button class="btn btn-ghost" data-action="expense-add">Расход</button>
        </div>
      </section>
      ${currentPeriod ? `
        <section class="panel glass">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Финансовый период</p>
              <h3>${escapeHtml(periodTitle)} <span class="badge">${escapeHtml(PERIOD_STATUS_LABELS[currentPeriod.status] || currentPeriod.status)}</span></h3>
              ${!canEdit ? '<p class="alert-inline">Период закрыт (только просмотр)</p>' : ''}
            </div>
            <div class="btn-row wrap">
              ${!canEdit ? `<button class="btn btn-sm btn-warning" data-action="period-unlock" data-id="${currentPeriod.id}">Разблокировать</button>` : ''}
              ${['current', 'future'].includes(currentPeriod.status) ? `
                <button class="btn btn-sm btn-primary" data-action="period-close" data-id="${currentPeriod.id}">Закрыть месяц</button>
                <button class="btn btn-sm btn-ghost" data-action="period-open-new">Новый период</button>
              ` : ''}
              <button class="btn btn-sm btn-ghost" data-action="plan-edit">План месяца</button>
            </div>
          </div>
          ${periodPlanCards.length ? `
            <div class="stats-grid compact">
              ${periodPlanCards.map(([label, planned, actual, dev]) => `
                <article class="stat-card glass">
                  <p class="stat-label">${escapeHtml(label)}</p>
                  <p class="stat-value">${formatMoney(actual, currency)}</p>
                  <p class="muted">план ${formatMoney(planned, currency)} · ${dev.sign}${formatMoney(Math.abs(dev.diff), currency)} (${dev.pct}%)</p>
                </article>
              `).join('')}
            </div>
          ` : '<p class="empty">План периода пока не создан</p>'}
        </section>
      ` : ''}
      <section class="stats-grid">
        ${cards.map(([label, value, icon, tone], index) => `
          <article class="stat-card glass tone-${tone}" style="animation-delay:${index * 35}ms">
            <div class="stat-icon">${icon}</div>
            <div><p class="stat-label">${label}</p><p class="stat-value" data-raw-value="${Number(value) || 0}">${formatMoney(value, currency)}</p></div>
          </article>
        `).join('')}
      </section>
      <section class="two-col">
        <article class="panel glass">
          <div class="panel-head"><h3>Последние операции</h3><button class="link-btn" data-action="nav" data-id="history">Вся история</button></div>
          <div class="timeline">
            ${recent.length ? recent.map((item) => this.historyItemHtml(item, currency)).join('') : '<p class="empty">Операций пока нет</p>'}
          </div>
        </article>
        <article class="panel glass">
          <div class="panel-head"><h3>Ближайшие платежи</h3><button class="link-btn" data-action="nav" data-id="calendar">Календарь</button></div>
          <div class="list">
            ${payments.length ? payments.map((item) => this.paymentRowHtml(item, currency)).join('') : '<p class="empty">Ближайших платежей нет</p>'}
          </div>
        </article>
      </section>
      <section class="panel glass">
        <div class="panel-head"><h3>Конверты</h3><button class="link-btn" data-action="nav" data-id="budget">Открыть бюджет</button></div>
        <div class="envelope-mini-grid">
          ${budget.envelopes.length ? budget.envelopes.map((env) => `
            <div class="envelope-mini" style="--accent:${env.color}">
              <div class="env-top"><span>${escapeHtml(env.icon || '')}</span><strong>${escapeHtml(env.name)}</strong></div>
              <div class="env-balance">${formatMoney(env.balance, currency)}</div>
              <div class="env-meta muted">получено ${formatMoney(env.received, currency)} · расход ${formatMoney(env.spent, currency)}</div>
            </div>
          `).join('') : '<p class="empty">Создайте первый конверт бюджета</p>'}
        </div>
      </section>
    `;
  }

  /**
   * Renders the income page.
   * @returns {string}
   */
  renderIncome() {
    const currency = this.currency();
    const summary = incomeService.getSummary();
    const items = incomeService.getAll().map((item) => ({
      ...item,
      distributed: incomeService.getDistributedForIncome(item.id),
      remaining: incomeService.getRemainingForIncome(item.id)
    }));

    return `
      ${this.toolbar('Доходы', `Свободно к распределению: <strong>${formatMoney(summary.freeMoney, currency)}</strong>`, '<button class="btn btn-primary" data-action="income-add">+ Добавить доход</button>')}
      <section class="stats-grid compact">
        ${this.statCard('Всего получено', summary.totalIncome)}
        ${this.statCard('Распределено', summary.totalDistributed)}
        ${this.statCard('Свободно', summary.freeMoney)}
      </section>
      <section class="cards-stack">
        ${items.length ? items.map((item) => `
          <article class="entity-card glass">
            <div class="entity-main">
              <div class="entity-icon">money</div>
              <div>
                <h3>${escapeHtml(item.title)}</h3>
                <p class="muted">${escapeHtml(item.source)} · ${formatDate(item.date)}</p>
                ${item.comment ? `<p>${escapeHtml(item.comment)}</p>` : ''}
              </div>
            </div>
            <div class="entity-side">
              <strong class="amount">${formatMoney(item.amount, currency)}</strong>
              <p class="muted">Распределено ${formatMoney(item.distributed, currency)}</p>
              <p class="muted">Осталось ${formatMoney(item.remaining, currency)}</p>
              <div class="btn-row wrap">
                ${item.remaining > 0 ? `<button class="btn btn-sm btn-primary" data-action="income-distribute" data-id="${item.id}">Распределить</button>` : ''}
                <button class="btn btn-sm btn-ghost" data-action="income-edit" data-id="${item.id}">Изменить</button>
                <button class="btn btn-sm btn-danger" data-action="income-delete" data-id="${item.id}">Удалить</button>
              </div>
            </div>
          </article>
        `).join('') : '<p class="empty glass">Доходов пока нет</p>'}
      </section>
    `;
  }

  /**
   * Renders the budget envelopes page.
   * @returns {string}
   */
  renderBudget() {
    const currency = this.currency();
    const summary = budgetService.getSummary();
    const undistributed = incomeService.getUndistributed();
    return `
      ${this.toolbar('Конверты бюджета', `Свободно: <strong>${formatMoney(summary.freeMoney, currency)}</strong>`, `
        <div class="btn-row wrap">
          <button class="btn btn-primary" data-action="budget-distribute">Распределить</button>
          <button class="btn btn-ghost" data-action="budget-transfer">Перевод</button>
          <button class="btn btn-ghost" data-action="budget-add-category">+ Конверт</button>
        </div>
      `)}
      ${undistributed.length ? `<section class="alert glass">Нераспределённых доходов: ${undistributed.length}<button class="btn btn-sm btn-primary" data-action="budget-distribute">Распределить</button></section>` : ''}
      <section class="envelope-grid">
        ${summary.envelopes.length ? summary.envelopes.map((env) => {
          const spentPercent = Math.min(100, env.received ? (env.spent / env.received) * 100 : 0);
          return `
            <article class="envelope-card glass" style="--accent:${env.color}">
              <div class="env-head">
                <span class="env-icon">${escapeHtml(env.icon || '')}</span>
                <div>
                  <h3>${escapeHtml(env.name)}</h3>
                  <p class="muted">Текущий баланс</p>
                  <p class="muted">Перенос: ${escapeHtml(CARRY_RULE_LABELS[env.carry_rule || 'balance'] || env.carry_rule || 'Переносить остаток')}${env.carry_rule === 'max' ? ` · максимум ${formatMoney(env.carry_max, currency)}` : ''}</p>
                </div>
                <strong>${formatMoney(env.balance, currency)}</strong>
              </div>
              <div class="env-stats">
                <div><span>Получено</span><strong>${formatMoney(env.received, currency)}</strong></div>
                <div><span>Потрачено</span><strong>${formatMoney(env.spent, currency)}</strong></div>
                <div><span>Осталось</span><strong>${formatMoney(env.remaining, currency)}</strong></div>
              </div>
              <div class="progress-line"><i style="width:${spentPercent}%;background:${env.color}"></i></div>
              <div class="btn-row wrap">
                <button class="btn btn-sm btn-ghost" data-action="budget-show-history" data-id="${env.id}">История</button>
                <button class="btn btn-sm btn-ghost" data-action="carry-rule-edit" data-id="${env.id}">Правило переноса</button>
                <button class="btn btn-sm btn-ghost" data-action="budget-edit-category" data-id="${env.id}">Изменить</button>
                <button class="btn btn-sm btn-danger" data-action="budget-delete-category" data-id="${env.id}">Удалить</button>
              </div>
            </article>
          `;
        }).join('') : '<p class="empty glass">Конвертов пока нет</p>'}
      </section>
    `;
  }

  /**
   * Renders the credits page.
   * @returns {string}
   */
  renderCredits() {
    const currency = this.currency();
    const items = creditService.getAllEnriched();
    const summary = creditService.getSummary();
    return `
      ${this.toolbar('Кредиты', `Долг: <strong>${formatMoney(summary.totalDebt, currency)}</strong> · платежи/мес: ${formatMoney(summary.monthlyPayments, currency)}`, '<button class="btn btn-primary" data-action="credit-add">+ Кредит</button>')}
      <section class="cards-stack">
        ${items.length ? items.map((item) => `
          <article class="entity-card glass">
            <div class="entity-main">
              <div class="entity-icon">card</div>
              <div>
                <h3>${escapeHtml(item.title)} ${item.status === 'closed' ? '<span class="badge">Закрыт</span>' : ''}</h3>
                <p class="muted">${escapeHtml(item.bank || 'Банк не указан')} · ставка ${Number(item.interest_rate) || 0}% · платёж ${formatDate(item.nextPaymentDate)}</p>
                <div class="progress-line"><i style="width:${item.progress}%"></i></div>
                <p class="muted">Погашено ${item.progress}% · платежей ${item.paymentsCount}</p>
                ${item.notes ? `<p>${escapeHtml(item.notes)}</p>` : ''}
              </div>
            </div>
            <div class="entity-side">
              <strong class="amount">${formatMoney(item.current_balance, currency)}</strong>
              <p class="muted">из ${formatMoney(item.initial_amount, currency)}</p>
              <p class="muted">Платёж ${formatMoney(item.monthly_payment, currency)}</p>
              <div class="btn-row wrap">
                ${item.status === 'active' ? `
                  <button class="btn btn-sm btn-primary" data-action="credit-pay" data-id="${item.id}">Платёж</button>
                  <button class="btn btn-sm btn-ghost" data-action="credit-close" data-id="${item.id}">Закрыть</button>
                ` : ''}
                <button class="btn btn-sm btn-ghost" data-action="credit-history" data-id="${item.id}">История</button>
                <button class="btn btn-sm btn-ghost" data-action="credit-edit" data-id="${item.id}">Изменить</button>
                <button class="btn btn-sm btn-danger" data-action="credit-delete" data-id="${item.id}">Удалить</button>
              </div>
            </div>
          </article>
        `).join('') : '<p class="empty glass">Кредитов пока нет</p>'}
      </section>
    `;
  }

  /**
   * Renders the utilities page.
   * @returns {string}
   */
  renderUtilities() {
    const currency = this.currency();
    const monthKey = utilityService.getCurrentMonthKey();
    const items = utilityService.getByMonthKey(monthKey);
    const stats = utilityService.getStats();
    return `
      ${this.toolbar('Коммунальные услуги', `Период ${monthKey}`, '<button class="btn btn-primary" data-action="utility-ensure-month">Создать записи месяца</button>')}
      <section class="stats-grid compact">
        ${this.statCard('За месяц', stats.monthTotal)}
        ${this.statCard('Ожидает', stats.monthPending)}
        ${this.statCard('Средний за год', stats.yearAverage)}
        ${this.statCard('За год', stats.yearTotal)}
      </section>
      <section class="cards-stack">
        ${items.length ? items.map((item) => `
          <article class="entity-card glass">
            <div class="entity-main">
              <div class="entity-icon">${item.typeIcon || 'home'}</div>
              <div>
                <h3>${escapeHtml(item.service)}</h3>
                <p class="muted">Срок ${formatDate(item.due_date)} · ${item.status === 'paid' ? 'оплачено' : 'ожидает оплаты'}</p>
                ${item.paid_at ? `<p class="muted">Оплачено: ${formatDate(item.paid_at)}</p>` : ''}
                ${item.receipt ? `<p class="muted">Квитанция: ${escapeHtml(item.receipt)}</p>` : ''}
                ${item.comment ? `<p>${escapeHtml(item.comment)}</p>` : ''}
              </div>
            </div>
            <div class="entity-side">
              <strong class="amount">${formatMoney(item.amount, currency)}</strong>
              <div class="btn-row wrap">
                ${item.status !== 'paid' ? `<button class="btn btn-sm btn-primary" data-action="utility-pay" data-id="${item.id}">Оплатить</button>` : ''}
                <button class="btn btn-sm btn-ghost" data-action="utility-edit" data-id="${item.id}">Изменить</button>
                <button class="btn btn-sm btn-danger" data-action="utility-delete" data-id="${item.id}">Удалить</button>
              </div>
            </div>
          </article>
        `).join('') : '<p class="empty glass">Нет записей за месяц</p>'}
      </section>
    `;
  }

  /**
   * Renders the expenses page.
   * @returns {string}
   */
  renderExpenses() {
    const currency = this.currency();
    const items = expenseService.getAllEnriched();
    const summary = expenseService.getSummary();
    return `
      ${this.toolbar('Расходы', `Всего потрачено: <strong>${formatMoney(summary.totalSpent, currency)}</strong>`, '<button class="btn btn-primary" data-action="expense-add">+ Расход</button>')}
      <section class="cards-stack">
        ${items.length ? items.map((item) => `
          <article class="entity-card glass">
            <div class="entity-main">
              <div class="entity-icon">${item.categoryIcon || 'cart'}</div>
              <div>
                <h3>${escapeHtml(item.name)}</h3>
                <p class="muted">${escapeHtml(item.categoryName)} → ${escapeHtml(item.envelopeName)} · ${formatDate(item.date)}</p>
                ${item.store ? `<p class="muted">Магазин: ${escapeHtml(item.store)}</p>` : ''}
                ${item.comment ? `<p>${escapeHtml(item.comment)}</p>` : ''}
              </div>
            </div>
            <div class="entity-side">
              <strong class="amount danger">${formatMoney(item.amount, currency)}</strong>
              <button class="btn btn-sm btn-danger" data-action="expense-delete" data-id="${item.id}">Удалить</button>
            </div>
          </article>
        `).join('') : '<p class="empty glass">Расходов пока нет</p>'}
      </section>
    `;
  }

  /**
   * Renders the goals page.
   * @returns {string}
   */
  renderGoals() {
    const currency = this.currency();
    const items = goalsService.getAllEnriched();
    const summary = goalsService.getSummary();
    return `
      ${this.toolbar('Финансовые цели', `Накоплено ${formatMoney(summary.totalSaved, currency)} из ${formatMoney(summary.totalTarget, currency)}`, '<button class="btn btn-primary" data-action="goal-add">+ Цель</button>')}
      <section class="goals-grid">
        ${items.length ? items.map((item) => `
          <article class="goal-card glass">
            <div class="goal-head">
              <span class="goal-icon">${escapeHtml(item.icon || 'target')}</span>
              <div>
                <h3>${escapeHtml(item.title)} ${item.status === 'completed' ? '<span class="badge">Готово</span>' : ''}</h3>
                <p class="muted">${item.deadline ? `До ${formatDate(item.deadline)}` : 'Без срока'}</p>
              </div>
            </div>
            <div class="goal-amounts">
              <div><span>Цель</span><strong>${formatMoney(item.target, currency)}</strong></div>
              <div><span>Накоплено</span><strong>${formatMoney(item.saved, currency)}</strong></div>
              <div><span>Осталось</span><strong>${formatMoney(item.remaining, currency)}</strong></div>
            </div>
            <div class="progress-line thick"><i style="width:${item.progress}%"></i></div>
            <p class="muted">${item.progress}% прогресса</p>
            <div class="btn-row wrap">
              ${item.status === 'active' ? `
                <button class="btn btn-sm btn-primary" data-action="goal-fund" data-id="${item.id}">Пополнить</button>
                <button class="btn btn-sm btn-ghost" data-action="goal-complete" data-id="${item.id}">Выполнено</button>
              ` : ''}
              <button class="btn btn-sm btn-ghost" data-action="goal-edit" data-id="${item.id}">Изменить</button>
              <button class="btn btn-sm btn-danger" data-action="goal-delete" data-id="${item.id}">Удалить</button>
            </div>
          </article>
        `).join('') : '<p class="empty glass">Целей пока нет</p>'}
      </section>
    `;
  }

  /**
   * Renders the calendar page.
   * @returns {string}
   */
  renderCalendar() {
    const currency = this.currency();
    const grid = calendarService.buildMonthGrid(this.calendarYear, this.calendarMonth);
    const dayEvents = calendarService.getEventsForDate(this.selectedCalendarDate);
    return `
      ${this.toolbar('Календарь', 'Платежи по кредитам, ЖКХ и дедлайны целей', `
        <div class="btn-row"><button class="btn btn-ghost" data-action="calendar-prev">Назад</button><strong>${escapeHtml(grid.title)}</strong><button class="btn btn-ghost" data-action="calendar-next">Вперёд</button></div>
      `)}
      <section class="two-col calendar-layout">
        <article class="panel glass">
          <div class="calendar-weekdays">${grid.weekdays.map((d) => `<span>${escapeHtml(d)}</span>`).join('')}</div>
          <div class="calendar-grid">
            ${grid.cells.map((cell) => `
              <button class="cal-cell ${cell.inMonth ? '' : 'out'} ${cell.date === this.selectedCalendarDate ? 'selected' : ''} ${cell.events.length ? 'has-events' : ''}" data-action="calendar-select" data-id="${cell.date}">
                <span class="cal-day">${cell.day}</span>
                <span class="cal-dots">${cell.events.slice(0, 3).map((event) => `<i style="background:${event.color}"></i>`).join('')}</span>
              </button>
            `).join('')}
          </div>
        </article>
        <article class="panel glass">
          <div class="panel-head"><h3>События на ${formatDate(this.selectedCalendarDate)}</h3></div>
          <div class="list">${dayEvents.length ? dayEvents.map((item) => this.paymentRowHtml(item, currency)).join('') : '<p class="empty">На эту дату событий нет</p>'}</div>
        </article>
      </section>
    `;
  }

  /**
   * Renders the analytics page with chart canvases.
   * @returns {string}
   */
  renderAnalytics() {
    const analytics = analyticsService.getDashboardAnalytics();
    const currency = this.currency();
    const yearAnalytics = typeof analyticsService.getYearAnalytics === 'function'
      ? analyticsService.getYearAnalytics(this.compareYear)
      : periodService.getYearAnalytics(this.compareYear);
    const plan = periodService.getPlan();
    const planRows = plan ? [
      ['Доход', plan.planned_income, plan.actual_income, plan.incomeDev],
      ['Расходы', plan.planned_expense, plan.actual_expense, plan.expenseDev],
      ['Накопления', plan.planned_savings, plan.actual_savings, plan.savingsDev],
      ['Кредиты', plan.planned_credits, plan.actual_credits, plan.creditsDev]
    ] : [];
    return `
      ${this.toolbar('Аналитика', 'Автоматические расчёты по всем разделам')}
      <section class="stats-grid compact">
        <article class="stat-card glass"><p class="stat-label">Фин. нагрузка</p><p class="stat-value">${analytics.load.loadPercent}%</p></article>
        <article class="stat-card glass"><p class="stat-label">Обязательные платежи</p><p class="stat-value">${formatMoney(analytics.load.totalLoad, currency)}</p></article>
        <article class="stat-card glass"><p class="stat-label">Накопления</p><p class="stat-value">${formatMoney(analytics.savings.totalSavings, currency)}</p></article>
      </section>
      <section class="panel glass">
        <div class="panel-head">
          <div><h3>Аналитика за ${yearAnalytics.year}</h3><p class="muted">Периодов: ${yearAnalytics.periodsCount} · закрыто: ${yearAnalytics.closedCount}</p></div>
        </div>
        <div class="stats-grid compact">
          ${this.statCard('Доход за год', yearAnalytics.totalIncome)}
          ${this.statCard('Расход за год', yearAnalytics.totalExpense)}
          ${this.statCard('Накопления', yearAnalytics.totalSavings)}
          ${this.statCard('Средний доход', yearAnalytics.averageIncome)}
          ${this.statCard('Средний расход', yearAnalytics.averageExpense)}
          <article class="stat-card glass"><p class="stat-label">Норма накоплений</p><p class="stat-value">${yearAnalytics.savingsRate}%</p></article>
        </div>
        <div class="list">
          ${yearAnalytics.bestMonth ? `<div class="list-row"><div><strong>Лучший месяц</strong><p class="muted">${escapeHtml(yearAnalytics.bestMonth.title)}</p></div><strong>${formatMoney(yearAnalytics.bestMonth.remainder, currency)}</strong></div>` : ''}
          ${yearAnalytics.costliestMonth ? `<div class="list-row"><div><strong>Самый затратный месяц</strong><p class="muted">${escapeHtml(yearAnalytics.costliestMonth.title)}</p></div><strong>${formatMoney(yearAnalytics.costliestMonth.expenses, currency)}</strong></div>` : ''}
        </div>
      </section>
      <section class="panel glass">
        <div class="panel-head"><h3>План / факт текущего периода</h3><button class="link-btn" data-action="plan-edit">Изменить план</button></div>
        ${planRows.length ? `
          <div class="list">
            ${planRows.map(([label, planned, actual, dev]) => `
              <div class="list-row">
                <div><strong>${escapeHtml(label)}</strong><p class="muted">План ${formatMoney(planned, currency)} · факт ${formatMoney(actual, currency)}</p></div>
                <strong class="${dev.diff >= 0 ? 'success' : 'danger'}">${dev.sign}${formatMoney(Math.abs(dev.diff), currency)} · ${dev.pct}%</strong>
              </div>
            `).join('')}
          </div>
        ` : '<p class="empty">План периода пока не создан</p>'}
      </section>
      <section class="charts-grid">
        ${this.chartPanel('Структура доходов', 'income-structure', true)}
        ${this.chartPanel('Структура расходов', 'expense-structure', true)}
        ${this.chartPanel('Конверты', 'envelopes')}
        ${this.chartPanel('Динамика по месяцам', 'monthly')}
        ${this.chartPanel('Кредиты', 'credits')}
        ${this.chartPanel('Коммунальные услуги', 'utilities')}
        ${this.chartPanel('Накопления и цели', 'savings')}
      </section>
    `;
  }

  /**
   * Renders the history page.
   * @returns {string}
   */
  renderHistory() {
    const currency = this.currency();
    let items = this.historyQuery ? historyService.search(this.historyQuery) : historyService.getAll();
    if (this.historyFilter !== 'all') items = items.filter((item) => item.type === this.historyFilter);
    const types = ['income', 'distribution', 'expense', 'credit_payment', 'utility', 'goal_fund', 'transfer'];
    return `
      ${this.toolbar('История', 'Единая лента всех операций')}
      <section class="filters glass">
        <input id="history-search" class="input" type="search" placeholder="Поиск..." value="${escapeHtml(this.historyQuery)}">
        <select id="history-filter" class="input">
          <option value="all" ${this.historyFilter === 'all' ? 'selected' : ''}>Все типы</option>
          ${types.map((type) => `<option value="${type}" ${this.historyFilter === type ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}
        </select>
      </section>
      <section class="timeline big">
        ${items.length ? items.map((item) => this.historyItemHtml(item, currency, true)).join('') : '<p class="empty glass">История пуста</p>'}
      </section>
    `;
  }

  /**
   * Renders the profile page.
   * @returns {string}
   */
  renderProfile() {
    const user = this.currentUser || authService.session?.user || {};
    const view = profileService.getProfileView(user);
    const currency = this.currency();
    const initials = (view.name || user.email || 'U').slice(0, 1).toUpperCase();
    return `
      ${this.toolbar('Профиль', 'Данные аккаунта и безопасность')}
      <section class="two-col">
        <article class="panel glass profile-card">
          <div class="profile-avatar">
            ${view.avatar ? `<img src="${escapeHtml(view.avatar)}" alt="Аватар">` : `<span>${escapeHtml(initials)}</span>`}
          </div>
          <h3>${escapeHtml(view.name || 'Без имени')}</h3>
          <p class="muted">${escapeHtml(view.email || user.email || '')}</p>
          <p class="muted">Создан: ${formatDate(view.created_at)}</p>
          <p class="muted">Последний вход: ${formatDateTime(view.last_login_at)}</p>
          <div class="btn-row wrap">
            <button class="btn btn-ghost" data-action="profile-avatar-click">Сменить аватар</button>
            <input id="profile-avatar-input" type="file" accept="image/*" hidden data-action="profile-avatar-change">
          </div>
        </article>
        <article class="panel glass">
          <h3>Статистика</h3>
          <div class="stats-grid compact">
            <article class="stat-card glass"><p class="stat-label">Доходов</p><p class="stat-value">${view.incomeCount || 0}</p></article>
            <article class="stat-card glass"><p class="stat-label">Расходов</p><p class="stat-value">${view.expenseCount || 0}</p></article>
            <article class="stat-card glass"><p class="stat-label">Кредитов</p><p class="stat-value">${view.creditCount || 0}</p></article>
            <article class="stat-card glass"><p class="stat-label">Капитал</p><p class="stat-value">${formatMoney(view.totalCapital || 0, currency)}</p></article>
          </div>
        </article>
      </section>
      <section class="settings-grid">
        <form class="panel glass" data-form="profile-name">
          <h3>Имя</h3>
          <label class="field">Отображаемое имя<input class="input" name="name" required value="${escapeHtml(view.name || '')}"></label>
          <button class="btn btn-primary" type="submit">Сохранить имя</button>
        </form>
        <form class="panel glass" data-form="profile-password">
          <h3>Пароль</h3>
          <label class="field">Новый пароль<input class="input" name="password" type="password" minlength="6" required></label>
          <button class="btn btn-primary" type="submit">Сменить пароль</button>
        </form>
        <article class="panel glass">
          <h3>Удаление аккаунта</h3>
          <p class="muted">Локальные финансовые данные будут очищены, после чего будет выполнен выход.</p>
          <button class="btn btn-danger" data-action="profile-delete-account">Удалить аккаунт</button>
        </article>
      </section>
    `;
  }

  /**
   * Renders the settings page.
   * @returns {string}
   */
  renderSettings() {
    const settings = settingsService.get();
    const currencies = settingsService.getCurrencies();
    const sync = syncService.getStatus();
    return `
      ${this.toolbar('Настройки', 'Тема, валюта, экспорт и синхронизация')}
      <section class="settings-grid">
        <article class="panel glass">
          <h3>Тема</h3>
          <div class="btn-row">
            <button class="btn ${settings.theme === 'dark' ? 'btn-primary' : 'btn-ghost'}" data-action="settings-theme" data-theme="dark">Тёмная</button>
            <button class="btn ${settings.theme === 'light' ? 'btn-primary' : 'btn-ghost'}" data-action="settings-theme" data-theme="light">Светлая</button>
          </div>
        </article>
        <article class="panel glass">
          <h3>Валюта</h3>
          <div class="btn-row wrap">
            ${currencies.map((currency) => `
              <button class="btn ${settings.currency === currency.code ? 'btn-primary' : 'btn-ghost'}" data-action="settings-currency" data-currency="${currency.code}">
                ${escapeHtml(currency.symbol)} ${currency.code}
              </button>
            `).join('')}
          </div>
        </article>
        <article class="panel glass">
          <h3>Экспорт</h3>
          <div class="btn-row wrap">
            <button class="btn btn-primary" data-action="settings-export-json">JSON</button>
            <button class="btn btn-ghost" data-action="settings-export-csv">CSV</button>
            <button class="btn btn-ghost" data-action="settings-export-pdf">PDF</button>
          </div>
        </article>
        <article class="panel glass">
          <h3>Импорт JSON</h3>
          <button class="btn btn-ghost" data-action="settings-import">Выбрать файл</button>
          <input id="import-file" type="file" accept="application/json,.json" hidden data-action="settings-import-change">
        </article>
        <article class="panel glass">
          <h3>Синхронизация</h3>
          <p class="muted">${sync.online ? 'Онлайн' : 'Офлайн'} · очередь: ${sync.pending} · ${sync.syncing ? 'синхронизация идёт' : 'ожидание'}</p>
          <button class="btn btn-primary" data-action="settings-sync">Синхронизировать</button>
        </article>
        <article class="panel glass">
          <h3>Сессия</h3>
          <button class="btn btn-danger" data-action="settings-logout">Выйти</button>
        </article>
      </section>
    `;
  }

  bindShellEvents() {
    document.querySelectorAll('[data-nav]').forEach((element) => {
      element.addEventListener('click', () => this.navigate(element.dataset.nav));
    });
    document.getElementById('menu-toggle')?.addEventListener('click', () => {
      this.sidebar?.classList.toggle('open');
      this.overlay?.classList.toggle('visible');
    });
    this.overlay?.addEventListener('click', () => this.closeSidebar());
    document.getElementById('theme-toggle')?.addEventListener('click', async () => {
      const next = settingsService.get().theme === 'light' ? 'dark' : 'light';
      await this.setTheme(next);
    });
    document.getElementById('notifications-btn')?.addEventListener('click', () => this.openNotificationsModal());
    document.getElementById('logout-btn')?.addEventListener('click', () => this.logout());
    document.getElementById('period-prev')?.addEventListener('click', () => this.shiftPeriod(-1));
    document.getElementById('period-next')?.addEventListener('click', () => this.shiftPeriod(1));
    document.getElementById('period-current-btn')?.addEventListener('click', () => this.togglePeriodDropdown());
    document.addEventListener('click', (event) => {
      const switcher = document.getElementById('period-switcher');
      const dropdown = document.getElementById('period-dropdown');
      if (switcher && dropdown && !switcher.contains(event.target)) dropdown.classList.add('hidden');
    });
  }

  bindPageEvents() {
    this.content.querySelectorAll('[data-action]').forEach((element) => {
      const handler = (event) => this.handleAction(element.dataset.action, element.dataset.id, element, event)
        .catch((error) => this.toast(error.message || 'Ошибка действия', 'error'));
      if (element.tagName === 'INPUT' && element.type === 'file') element.addEventListener('change', handler);
      else element.addEventListener('click', handler);
    });
    this.content.querySelectorAll('[data-form]').forEach((form) => {
      form.addEventListener('submit', (event) => this.handleFormSubmit(event));
    });
    this.content.querySelector('#history-search')?.addEventListener('input', (event) => {
      this.historyQuery = event.target.value;
      this.refresh();
    });
    this.content.querySelector('#history-filter')?.addEventListener('change', (event) => {
      this.historyFilter = event.target.value;
      this.refresh();
    });
  }

  async handleFormSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    if (form.dataset.form === 'profile-name') {
      await this.runMutation('updateProfileName', [data.name], () => profileService.updateName(data.name), 'Имя обновлено');
      await this.loadUser();
    }
    if (form.dataset.form === 'profile-password') {
      await this.runMutation('changePassword', [data.password], () => profileService.changePassword(data.password), 'Пароль обновлён');
      form.reset();
    }
  }

  async runMutation(appMethod, args, fallback, successMessage) {
    const periodWriteMethods = new Set([
      'addIncome', 'updateIncome', 'deleteIncome', 'distribute', 'transfer',
      'createCategory', 'updateCategory', 'deleteCategory', 'addExpense',
      'addCredit', 'updateCredit', 'payCredit', 'closeCredit', 'deleteCredit',
      'ensureUtilityMonth', 'updateUtility', 'payUtility', 'deleteUtility',
      'addGoal', 'updateGoal', 'fundGoal', 'completeGoal', 'deleteGoal',
      'updatePlan', 'updateCarryRule', 'closePeriod', 'openPeriod',
      'restoreArchive', 'archivePeriod'
    ]);
    if (periodWriteMethods.has(appMethod) && !databaseService.canEditCurrentPeriod()) {
      this.toast('Период закрыт. Разблокируйте редактирование для изменений.', 'warning');
      return { success: false, message: 'Период закрыт' };
    }
    const result = await (typeof this.app?.[appMethod] === 'function' ? this.app[appMethod](...args) : fallback());
    await this.applyResult(result, successMessage);
    return result;
  }

  async applyResult(result, successMessage) {
    if (result && result.success === false) {
      this.toast(result.message || 'Не удалось выполнить действие', 'error');
      return false;
    }
    this.closeModal();
    this.toast(result?.message || successMessage || 'Готово', 'success');
    await notificationService.refreshFromData();
    this.refresh();
    return true;
  }

  async loadUser() {
    try {
      this.currentUser = await authService.getUser();
    } catch (error) {
      this.currentUser = authService.session?.user || null;
    }
  }

  closeSidebar() {
    this.sidebar?.classList.remove('open');
    this.overlay?.classList.remove('visible');
  }

  updateHeaderStats() {
    const currency = this.currency();
    animateNumber(document.getElementById('header-free-money'), incomeService.getFreeMoney(), {
      formatter: (value) => formatMoney(value, currency)
    });
    animateNumber(document.getElementById('header-debt'), creditService.getTotalDebt(), {
      formatter: (value) => formatMoney(value, currency)
    });
  }

  updateNotificationBadge() {
    const badge = document.getElementById('notifications-badge');
    if (!badge) return;
    const count = notificationService.getUnreadCount();
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }

  updateSyncBadge() {
    const badge = document.getElementById('sync-badge') || document.querySelector('[data-sync-badge]');
    if (!badge) return;
    const status = syncService.getStatus();
    badge.textContent = status.syncing ? 'Синхронизация' : status.online ? (status.pending ? `Очередь ${status.pending}` : 'Онлайн') : 'Офлайн';
    badge.classList.toggle('is-offline', !status.online);
    badge.classList.toggle('is-syncing', status.syncing);
  }

  renderCharts() {
    this.content.querySelectorAll('[data-chart]').forEach((canvas) => this.renderChart(canvas));
  }

  renderChart(canvas) {
    const analytics = analyticsService.getDashboardAnalytics();
    const currency = this.currency();
    const type = canvas.dataset.chart;
    if (type === 'income-structure') {
      chartsService.drawDonut(canvas, analytics.incomeStructure, { currency, centerLabel: 'Доходы' });
      this.fillLegend(canvas, analytics.incomeStructure, currency);
    }
    if (type === 'expense-structure') {
      chartsService.drawDonut(canvas, analytics.expenseStructure, { currency, centerLabel: 'Расходы' });
      this.fillLegend(canvas, analytics.expenseStructure, currency);
    }
    if (type === 'envelopes') chartsService.drawBars(canvas, analytics.envelopeStructure, { currency });
    if (type === 'monthly') chartsService.drawGroupedBars(canvas, analytics.monthlyDynamics, { currency });
    if (type === 'credits') chartsService.drawDonut(canvas, analytics.credits.items, { currency, centerLabel: 'Долг' });
    if (type === 'utilities') chartsService.drawBars(canvas, analytics.utilities.items, { currency });
    if (type === 'savings') {
      const items = analytics.savings.goals.length
        ? analytics.savings.goals.map((goal) => ({ label: goal.label, value: goal.value }))
        : [{ label: 'Накопления', value: analytics.savings.envelopeSavings }];
      chartsService.drawDonut(canvas, items, { currency, centerLabel: 'Цели' });
    }
  }

  fillLegend(canvas, items, currency) {
    const legend = canvas.parentElement?.querySelector('.chart-legend-target');
    if (legend) legend.innerHTML = chartsService.buildLegendHtml(items, currency);
  }

  openIncomeModal(id) {
    const item = id ? incomeService.getById(id) : null;
    this.openModal(item ? 'Изменить доход' : 'Новый доход', `
      <label class="field">Название<input class="input" name="title" required value="${escapeHtml(item?.title || '')}"></label>
      <label class="field">Источник<select class="input" name="source" required>${incomeService.getSources().map((source) => `<option value="${escapeHtml(source)}" ${item?.source === source ? 'selected' : ''}>${escapeHtml(source)}</option>`).join('')}</select></label>
      <label class="field">Сумма<input class="input" name="amount" type="number" min="0.01" step="0.01" required value="${item?.amount || ''}"></label>
      <label class="field">Дата<input class="input" name="date" type="date" required value="${item?.date || todayISO()}"></label>
      <label class="field">Комментарий<textarea class="input" name="comment" rows="3">${escapeHtml(item?.comment || '')}</textarea></label>
    `, (data) => this.runMutation(item ? 'updateIncome' : 'addIncome', item ? [id, data] : [data], () => item ? incomeService.update(id, data) : incomeService.add(data), item ? 'Доход обновлён' : 'Доход добавлен'));
  }

  openDistributeModal(incomeId) {
    const all = incomeService.getAll().map((income) => ({ ...income, remaining: incomeService.getRemainingForIncome(income.id) })).filter((income) => income.remaining > 0);
    const selected = incomeId ? all.find((income) => income.id === incomeId) : all[0];
    if (!selected) {
      this.toast('Нет доходов для распределения', 'warning');
      return;
    }
    const envelopes = budgetService.getEnvelopes();
    this.openModal('Распределение дохода', `
      <label class="field">Доход<select class="input" name="incomeId" id="dist-income">${all.map((income) => `<option value="${income.id}" ${income.id === selected.id ? 'selected' : ''}>${escapeHtml(income.title)} — ${formatMoney(income.remaining, this.currency())}</option>`).join('')}</select></label>
      <div class="dist-summary glass-soft">
        <div>Остаток: <strong id="dist-total">${formatMoney(selected.remaining, this.currency())}</strong></div>
        <div>Распределено: <strong id="dist-allocated">${formatMoney(0, this.currency())}</strong></div>
        <div>Нужно распределить: <strong id="dist-left">${formatMoney(selected.remaining, this.currency())}</strong></div>
      </div>
      <div class="dist-list">${envelopes.map((env) => `<label class="field dist-row"><span>${escapeHtml(env.icon || '')} ${escapeHtml(env.name)}</span><input class="input dist-amount" name="amount_${env.id}" type="number" min="0" step="0.01" value="0" data-cat="${env.id}"></label>`).join('')}</div>
    `, (data, form) => {
      const allocations = [...form.querySelectorAll('.dist-amount')].map((input) => ({ categoryId: input.dataset.cat, amount: input.value }));
      return this.runMutation('distribute', [data.incomeId, allocations], () => budgetService.distribute(data.incomeId, allocations), 'Средства распределены');
    });
    const update = () => {
      const incomeSelect = this.modalRoot.querySelector('#dist-income');
      const remaining = incomeService.getRemainingForIncome(incomeSelect.value);
      const allocated = [...this.modalRoot.querySelectorAll('.dist-amount')].reduce((sum, input) => sum + (Number(input.value) || 0), 0);
      const left = Math.round((remaining - allocated) * 100) / 100;
      this.modalRoot.querySelector('#dist-total').textContent = formatMoney(remaining, this.currency());
      this.modalRoot.querySelector('#dist-allocated').textContent = formatMoney(allocated, this.currency());
      const leftEl = this.modalRoot.querySelector('#dist-left');
      leftEl.textContent = formatMoney(left, this.currency());
      leftEl.classList.toggle('danger-text', Math.abs(left) > 0.009);
    };
    this.modalRoot.querySelectorAll('.dist-amount').forEach((input) => input.addEventListener('input', update));
    this.modalRoot.querySelector('#dist-income')?.addEventListener('change', update);
  }

  openCategoryModal(id) {
    const item = id ? budgetService.getCategoryById(id) : null;
    this.openModal(item ? 'Изменить конверт' : 'Новый конверт', `
      <label class="field">Название<input class="input" name="name" required value="${escapeHtml(item?.name || '')}"></label>
      <label class="field">Иконка<input class="input" name="icon" value="${escapeHtml(item?.icon || 'box')}" maxlength="16"></label>
      <label class="field">Цвет<input class="input" name="color" type="color" value="${item?.color || '#5B8DEF'}"></label>
    `, (data) => this.runMutation(item ? 'updateCategory' : 'createCategory', item ? [id, data] : [data], () => item ? budgetService.updateCategory(id, data) : budgetService.createCategory(data), item ? 'Конверт обновлён' : 'Конверт создан'));
  }

  openTransferModal() {
    this.openModal('Перевод между конвертами', `
      <label class="field">Откуда<select class="input" name="fromId" required>${this.envelopeOptions()}</select></label>
      <label class="field">Куда<select class="input" name="toId" required>${this.envelopeOptions()}</select></label>
      <label class="field">Сумма<input class="input" name="amount" type="number" min="0.01" step="0.01" required></label>
      <label class="field">Комментарий<input class="input" name="comment"></label>
    `, (data) => this.runMutation('transfer', [data.fromId, data.toId, data.amount, data.comment], () => budgetService.transfer(data.fromId, data.toId, data.amount, data.comment), 'Перевод выполнен'));
  }

  openEnvelopeHistory(id) {
    const category = budgetService.getCategoryById(id);
    const txs = budgetService.getCategoryTransactions(id);
    this.openInfoModal(`История: ${category?.name || ''}`, `<div class="list">${txs.length ? txs.map((tx) => `<div class="list-row"><div><strong>${escapeHtml(tx.type)}</strong><p class="muted">${formatDate(tx.date)} · ${escapeHtml(tx.comment || '')}</p></div><strong class="${tx.amount < 0 ? 'danger' : 'success'}">${formatMoney(tx.amount, this.currency())}</strong></div>`).join('') : '<p class="empty">Операций нет</p>'}</div>`);
  }

  openExpenseModal() {
    this.openModal('Новый расход', `
      <label class="field">Название<input class="input" name="name" required></label>
      <label class="field">Категория<select class="input" name="category" required>${EXPENSE_CATEGORIES.map((cat) => `<option value="${escapeHtml(cat.id)}">${escapeHtml(cat.icon || '')} ${escapeHtml(cat.name)}</option>`).join('')}</select></label>
      <label class="field">Конверт<select class="input" name="budget_category" required>${this.envelopeOptions()}</select></label>
      <label class="field">Сумма<input class="input" name="amount" type="number" min="0.01" step="0.01" required></label>
      <label class="field">Дата<input class="input" name="date" type="date" required value="${todayISO()}"></label>
      <label class="field">Магазин<input class="input" name="store"></label>
      <label class="field">Комментарий<textarea class="input" name="comment" rows="2"></textarea></label>
    `, (data) => this.runMutation('addExpense', [data], () => expenseService.add(data), 'Расход сохранён'));
  }

  openCreditModal(id) {
    const item = id ? creditService.getById(id) : null;
    this.openModal(item ? 'Изменить кредит' : 'Новый кредит', `
      <div class="form-grid">
        <label class="field">Название<input class="input" name="title" required value="${escapeHtml(item?.title || '')}"></label>
        <label class="field">Банк<input class="input" name="bank" value="${escapeHtml(item?.bank || '')}"></label>
        <label class="field">Первоначальная сумма<input class="input" name="initial_amount" type="number" min="0.01" step="0.01" required value="${item?.initial_amount || ''}"></label>
        <label class="field">Текущий остаток<input class="input" name="current_balance" type="number" min="0" step="0.01" required value="${item?.current_balance || ''}"></label>
        <label class="field">Ежемесячный платёж<input class="input" name="monthly_payment" type="number" min="0.01" step="0.01" required value="${item?.monthly_payment || ''}"></label>
        <label class="field">Ставка %<input class="input" name="interest_rate" type="number" min="0" step="0.01" value="${item?.interest_rate || 0}"></label>
        <label class="field">День платежа<input class="input" name="payment_day" type="number" min="1" max="31" required value="${item?.payment_day || 15}"></label>
        <label class="field">Дата начала<input class="input" name="start_date" type="date" required value="${item?.start_date || todayISO()}"></label>
        <label class="field">Дата окончания<input class="input" name="end_date" type="date" value="${item?.end_date || ''}"></label>
      </div>
      <label class="field">Заметки<textarea class="input" name="notes" rows="2">${escapeHtml(item?.notes || '')}</textarea></label>
    `, (data) => this.runMutation(item ? 'updateCredit' : 'addCredit', item ? [id, data] : [data], () => item ? creditService.update(id, data) : creditService.add(data), item ? 'Кредит обновлён' : 'Кредит добавлен'), { wide: true });
  }

  openCreditPayModal(id) {
    const credit = creditService.getById(id);
    if (!credit) return;
    this.openModal('Платёж по кредиту', `
      <p class="muted">${escapeHtml(credit.title)} · остаток ${formatMoney(credit.current_balance, this.currency())}</p>
      <label class="field">Сумма<input class="input" name="amount" type="number" min="0.01" step="0.01" required value="${credit.monthly_payment}"></label>
      <label class="field">Конверт<select class="input" name="budget_category"><option value="">Без списания</option>${this.envelopeOptions()}</select></label>
      <label class="field">Дата<input class="input" name="date" type="date" required value="${todayISO()}"></label>
      <label class="field">Комментарий<input class="input" name="comment"></label>
    `, (data) => this.runMutation('payCredit', [id, data], () => creditService.makePayment(id, data), 'Платёж учтён'));
  }

  openCreditHistory(id) {
    const credit = creditService.getById(id);
    const payments = creditService.getPaymentsForCredit(id);
    this.openInfoModal(`Платежи: ${credit?.title || ''}`, `<div class="list">${payments.length ? payments.map((p) => `<div class="list-row"><div><strong>${formatMoney(p.amount, this.currency())}</strong><p class="muted">${formatDate(p.payment_date)} · ${escapeHtml(p.comment || '')}</p></div></div>`).join('') : '<p class="empty">Платежей пока нет</p>'}</div>`);
  }

  openUtilityModal(id) {
    const item = utilityService.getById(id);
    if (!item) return;
    this.openModal('Коммунальная услуга', `
      <p class="muted">${escapeHtml(item.service)} · ${escapeHtml(item.month_key || item.month || '')}</p>
      <label class="field">Сумма<input class="input" name="amount" type="number" min="0" step="0.01" required value="${item.amount}"></label>
      <label class="field">Срок оплаты<input class="input" name="due_date" type="date" required value="${item.due_date || todayISO()}"></label>
      <label class="field">Квитанция<input class="input" name="receipt" value="${escapeHtml(item.receipt || '')}"></label>
      <label class="field">Комментарий<textarea class="input" name="comment" rows="2">${escapeHtml(item.comment || '')}</textarea></label>
    `, (data) => this.runMutation('updateUtility', [id, data], () => utilityService.update(id, data), 'Запись обновлена'));
  }

  openUtilityPayModal(id) {
    const item = utilityService.getById(id);
    if (!item) return;
    this.openModal('Оплата услуги', `
      <p class="muted">${escapeHtml(item.service)}</p>
      <label class="field">Сумма<input class="input" name="amount" type="number" min="0.01" step="0.01" required value="${item.amount || ''}"></label>
      <label class="field">Конверт<select class="input" name="budget_category"><option value="">Без списания</option>${this.envelopeOptions()}</select></label>
      <label class="field">Дата оплаты<input class="input" name="paid_at" type="date" required value="${todayISO()}"></label>
      <label class="field">Квитанция<input class="input" name="receipt" value="${escapeHtml(item.receipt || '')}"></label>
      <label class="field">Комментарий<input class="input" name="comment" value="${escapeHtml(item.comment || '')}"></label>
    `, (data) => this.runMutation('payUtility', [id, data], () => utilityService.markPaid(id, data), 'Оплата сохранена'));
  }

  openGoalModal(id) {
    const item = id ? goalsService.getById(id) : null;
    this.openModal(item ? 'Изменить цель' : 'Новая цель', `
      <label class="field">Название<input class="input" name="title" required value="${escapeHtml(item?.title || '')}"></label>
      <label class="field">Иконка<input class="input" name="icon" value="${escapeHtml(item?.icon || 'target')}" maxlength="16"></label>
      <label class="field">Целевая сумма<input class="input" name="target" type="number" min="0.01" step="0.01" required value="${item?.target || ''}"></label>
      <label class="field">Накоплено<input class="input" name="saved" type="number" min="0" step="0.01" value="${item?.saved || 0}" ${item ? 'disabled' : ''}></label>
      <label class="field">Срок<input class="input" name="deadline" type="date" value="${item?.deadline || ''}"></label>
      <label class="field">Комментарий<textarea class="input" name="comment" rows="2">${escapeHtml(item?.comment || '')}</textarea></label>
    `, (data) => this.runMutation(item ? 'updateGoal' : 'addGoal', item ? [id, data] : [data], () => item ? goalsService.update(id, data) : goalsService.add(data), item ? 'Цель обновлена' : 'Цель создана'));
  }

  openGoalFundModal(id) {
    const goal = goalsService.getById(id);
    if (!goal) return;
    this.openModal('Пополнить цель', `
      <p class="muted">${escapeHtml(goal.title)} · осталось ${formatMoney(Math.max(0, Number(goal.target) - Number(goal.saved)), this.currency())}</p>
      <label class="field">Сумма<input class="input" name="amount" type="number" min="0.01" step="0.01" required></label>
      <label class="field">Из конверта<select class="input" name="budget_category" required>${this.envelopeOptions()}</select></label>
      <label class="field">Дата<input class="input" name="date" type="date" required value="${todayISO()}"></label>
      <label class="field">Комментарий<input class="input" name="comment"></label>
    `, (data) => this.runMutation('fundGoal', [id, data], () => goalsService.contribute(id, data), 'Цель пополнена'));
  }

  openNotificationsModal() {
    const items = notificationService.getAll().slice(0, 30);
    this.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal glass" role="dialog" aria-modal="true">
          <div class="modal-head"><h3>Уведомления</h3><button type="button" class="icon-btn" data-modal-close>x</button></div>
          <div class="modal-body">
            <div class="btn-row"><button class="btn btn-sm btn-ghost" id="mark-all-read">Прочитать все</button></div>
            <div class="list">${items.length ? items.map((n) => `<div class="list-row ${n.is_read ? '' : 'unread'}"><div><strong>${escapeHtml(n.title)}</strong><p class="muted">${escapeHtml(n.text || '')}</p><span class="muted">${formatDateTime(n.created_at)}</span></div></div>`).join('') : '<p class="empty">Уведомлений нет</p>'}</div>
            <div class="modal-actions"><button type="button" class="btn btn-primary" data-modal-close>Закрыть</button></div>
          </div>
        </div>
      </div>
    `;
    this.modalRoot.querySelectorAll('[data-modal-close]').forEach((button) => button.addEventListener('click', () => this.closeModal()));
    this.modalRoot.querySelector('#mark-all-read')?.addEventListener('click', async () => {
      await notificationService.markAllRead();
      this.updateNotificationBadge();
      this.openNotificationsModal();
    });
  }

  openInfoModal(title, bodyHtml) {
    this.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal glass wide">
          <div class="modal-head"><h3>${escapeHtml(title)}</h3><button type="button" class="icon-btn" data-modal-close>x</button></div>
          <div class="modal-body">${bodyHtml}<div class="modal-actions"><button type="button" class="btn btn-primary" data-modal-close>Закрыть</button></div></div>
        </div>
      </div>
    `;
    this.modalRoot.querySelectorAll('[data-modal-close]').forEach((button) => button.addEventListener('click', () => this.closeModal()));
  }

  async setTheme(theme) {
    await settingsService.setTheme(theme);
    this.toast('Тема обновлена', 'success');
    this.refresh();
  }

  async setCurrency(currency) {
    const result = await settingsService.setCurrency(currency);
    await this.applyResult(result, 'Валюта обновлена');
  }

  async importData(file) {
    if (!file) return;
    await this.runMutation('importData', [file], () => settingsService.importJSON(file), 'Данные импортированы');
  }

  async syncNow() {
    await syncService.syncNow();
    this.toast('Синхронизация выполнена', 'success');
    this.updateSyncBadge();
    this.refresh();
  }

  async logout() {
    if (typeof this.app?.logout === 'function') {
      await this.app.logout();
      return;
    }
    await databaseService.destroy();
    const result = await authService.signOut();
    if (result?.success === false) {
      this.toast(result.message || 'Не удалось выйти', 'error');
      return;
    }
    window.location.href = 'auth/login.html';
  }

  async changeAvatar(file) {
    if (!file) return;
    await this.runMutation('changeAvatar', [file], () => profileService.changeAvatar(file), 'Аватар обновлён');
    await this.loadUser();
  }

  shiftCalendar(delta) {
    this.calendarMonth += delta;
    if (this.calendarMonth < 0) {
      this.calendarMonth = 11;
      this.calendarYear -= 1;
    }
    if (this.calendarMonth > 11) {
      this.calendarMonth = 0;
      this.calendarYear += 1;
    }
    this.refresh();
  }

  envelopeOptions(selected = '') {
    return budgetService.getCategories().map((cat) => `<option value="${cat.id}" ${cat.id === selected ? 'selected' : ''}>${escapeHtml(cat.icon || '')} ${escapeHtml(cat.name)}</option>`).join('');
  }

  toolbar(title, subtitle, actions = '') {
    return `<section class="toolbar"><div><h2>${escapeHtml(title)}</h2><p class="muted">${subtitle}</p></div>${actions || ''}</section>`;
  }

  statCard(label, value) {
    return `<article class="stat-card glass"><p class="stat-label">${escapeHtml(label)}</p><p class="stat-value">${formatMoney(value, this.currency())}</p></article>`;
  }

  chartPanel(title, chart, legend = false) {
    return `<article class="panel glass chart-panel"><h3>${escapeHtml(title)}</h3><canvas data-chart="${chart}" height="240"></canvas>${legend ? '<div class="chart-legend-target"></div>' : ''}</article>`;
  }

  historyItemHtml(item, currency, glass = false) {
    return `
      <div class="timeline-item ${glass ? 'glass' : ''}">
        <div class="timeline-icon">${escapeHtml(item.icon || 'pin')}</div>
        <div class="timeline-body">
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.description || '')}</p>
          <span class="muted">${formatDateTime(item.date || item.created_at)}</span>
        </div>
        <div class="timeline-amount">${item.amount != null ? formatMoney(item.amount, currency) : ''}</div>
      </div>
    `;
  }

  paymentRowHtml(item, currency) {
    return `
      <div class="list-row">
        <div class="list-icon">${escapeHtml(item.icon || '')}</div>
        <div><strong>${escapeHtml(item.title)}</strong><p class="muted">${escapeHtml(item.subtitle || '')} · ${formatDate(item.date)}</p></div>
        <strong>${formatMoney(item.amount, currency)}</strong>
      </div>
    `;
  }

  updatePeriodSwitcher() {
    const label = document.getElementById('period-label');
    const statusLabel = document.getElementById('period-status-label');
    const dropdown = document.getElementById('period-dropdown');
    const current = periodService.getCurrent();
    if (label) label.textContent = current ? periodService.formatPeriodTitle(current) : 'Период не выбран';
    if (statusLabel) {
      statusLabel.textContent = current ? (PERIOD_STATUS_LABELS[current.status] || current.status) : '';
      statusLabel.dataset.status = current?.status || '';
    }
    if (!dropdown) return;

    const groups = periodService.getGroupedByYear();
    dropdown.innerHTML = `
      <div class="period-dropdown-inner">
        ${groups.length ? groups.map((group) => `
          <div class="period-group">
            <strong>${group.year}</strong>
            <div class="period-months">
              ${group.months.map((period) => `
                <button type="button" class="period-option ${period.id === current?.id ? 'active' : ''}" data-action="period-select" data-id="${period.id}">
                  <span>${escapeHtml(getMonthName(Number(period.month) - 1))}</span>
                  <small>${escapeHtml(PERIOD_STATUS_LABELS[period.status] || period.status)}</small>
                </button>
              `).join('')}
            </div>
          </div>
        `).join('') : '<p class="empty">Периодов пока нет</p>'}
        <button type="button" class="btn btn-primary btn-sm" data-action="period-open-new">+ Открыть месяц</button>
      </div>
    `;
    dropdown.querySelectorAll('[data-action]').forEach((element) => {
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        this.handleAction(element.dataset.action, element.dataset.id, element, event)
          .catch((error) => this.toast(error.message || 'Ошибка действия', 'error'));
      });
    });
  }

  async shiftPeriod(delta) {
    const current = periodService.getCurrent();
    const periods = [...periodService.getAll()].sort((a, b) => (a.year - b.year) || (a.month - b.month));
    const index = periods.findIndex((period) => period.id === current?.id);
    const next = index >= 0 ? periods[index + delta] : null;
    if (next) {
      const result = await (typeof this.app?.switchPeriod === 'function' ? this.app.switchPeriod(next.id) : periodService.switchPeriod(next.id));
      await this.applyResult(result, 'Период переключён');
      return;
    }

    const base = current || { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
    let year = Number(base.year);
    let month = Number(base.month) + delta;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    if (month > 12) {
      month = 1;
      year += 1;
    }
    this.openNewPeriodModal(year, month);
  }

  togglePeriodDropdown() {
    document.getElementById('period-dropdown')?.classList.toggle('hidden');
  }

  openNewPeriodModal(defaultYear, defaultMonth) {
    const current = periodService.getCurrent();
    let year = Number(defaultYear || current?.year || new Date().getFullYear());
    let month = Number(defaultMonth || current?.month || (new Date().getMonth() + 1));
    if (!defaultMonth) {
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
    const years = Array.from({ length: 7 }, (_, index) => year - 3 + index);
    const checkbox = (name, labelText, checked = true) => `
      <label class="check-row"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}> ${escapeHtml(labelText)}</label>
    `;
    this.openModal('Открыть финансовый период', `
      <div class="form-grid">
        <label class="field">Год<select class="input" name="year" required>${years.map((item) => `<option value="${item}" ${item === year ? 'selected' : ''}>${item}</option>`).join('')}</select></label>
        <label class="field">Месяц<select class="input" name="month" required>${Array.from({ length: 12 }, (_, index) => `<option value="${index + 1}" ${index + 1 === month ? 'selected' : ''}>${escapeHtml(getMonthName(index))}</option>`).join('')}</select></label>
      </div>
      <div class="panel glass-soft">
        <h4>Что перенести</h4>
        ${checkbox('transferBalances', 'Остатки конвертов')}
        ${checkbox('copyCategories', 'Категории бюджета')}
        ${checkbox('copyCredits', 'Активные кредиты')}
        ${checkbox('copyUtilities', 'Коммунальные услуги')}
        ${checkbox('copyRegularPayments', 'Регулярные платежи')}
        ${checkbox('copyGoals', 'Активные цели')}
      </div>
    `, (data, form) => {
      const options = {
        transferBalances: form.elements.transferBalances.checked,
        copyCategories: form.elements.copyCategories.checked,
        copyCredits: form.elements.copyCredits.checked,
        copyUtilities: form.elements.copyUtilities.checked,
        copyRegularPayments: form.elements.copyRegularPayments.checked,
        copyGoals: form.elements.copyGoals.checked,
        switchTo: true
      };
      return this.runMutation('openPeriod', [Number(data.year), Number(data.month), options], () => periodService.openPeriod(Number(data.year), Number(data.month), options), 'Период открыт');
    }, { submitText: 'Открыть' });
  }

  openClosePeriodModal() {
    const period = periodService.getCurrent();
    if (!period) {
      this.toast('Период не выбран', 'warning');
      return;
    }
    this.openModal('Закрыть месяц', `
      <p>Закрыть период <strong>${escapeHtml(periodService.formatPeriodTitle(period))}</strong>? Будет сформирован итоговый отчёт.</p>
      <label class="check-row"><input type="checkbox" name="createNext" checked> Создать следующий месяц</label>
      <label class="check-row"><input type="checkbox" name="transferBalances" checked> Перенести остатки</label>
      <label class="check-row"><input type="checkbox" name="copyCategories" checked> Скопировать категории</label>
      <label class="check-row"><input type="checkbox" name="copyCredits" checked> Скопировать кредиты</label>
      <label class="check-row"><input type="checkbox" name="copyUtilities" checked> Скопировать ЖКХ</label>
      <label class="check-row"><input type="checkbox" name="copyRegularPayments" checked> Скопировать регулярные платежи</label>
      <label class="check-row"><input type="checkbox" name="copyGoals" checked> Скопировать цели</label>
    `, async (_data, form) => {
      const options = {
        createNext: form.elements.createNext.checked,
        transferBalances: form.elements.transferBalances.checked,
        copyCategories: form.elements.copyCategories.checked,
        copyCredits: form.elements.copyCredits.checked,
        copyUtilities: form.elements.copyUtilities.checked,
        copyRegularPayments: form.elements.copyRegularPayments.checked,
        copyGoals: form.elements.copyGoals.checked
      };
      const result = await this.runMutation('closePeriod', [period.id, options], () => periodService.closePeriod(period.id, options), 'Месяц закрыт');
      if (result?.success !== false) {
        const reportPeriodId = result?.report?.period_id || period.id;
        this.showReportModal(reportPeriodId);
      }
    }, { submitText: 'Закрыть месяц' });
  }

  openPlanModal() {
    const period = periodService.getCurrent();
    const plan = periodService.getPlan(period?.id);
    if (!period || !plan) {
      this.toast('План периода не найден', 'warning');
      return;
    }
    this.openModal('План месяца', `
      <div class="form-grid">
        <label class="field">План дохода<input class="input" name="planned_income" type="number" min="0" step="0.01" value="${plan.planned_income || 0}"></label>
        <label class="field">План расходов<input class="input" name="planned_expense" type="number" min="0" step="0.01" value="${plan.planned_expense || 0}"></label>
        <label class="field">План накоплений<input class="input" name="planned_savings" type="number" min="0" step="0.01" value="${plan.planned_savings || 0}"></label>
        <label class="field">План кредитов<input class="input" name="planned_credits" type="number" min="0" step="0.01" value="${plan.planned_credits || 0}"></label>
      </div>
    `, (data) => this.runMutation('updatePlan', [period.id, data], () => periodService.updatePlan(period.id, data), 'План обновлён'));
  }

  openCarryRuleModal(categoryId) {
    const category = budgetService.getCategoryById(categoryId);
    if (!category) return;
    const selectedRule = category.carry_rule || 'balance';
    this.openModal('Правило переноса', `
      <p class="muted">${escapeHtml(category.name)}</p>
      <label class="field">Правило<select class="input" name="carry_rule" id="carry-rule-select">
        ${Object.entries(CARRY_RULE_LABELS).map(([value, label]) => `<option value="${value}" ${value === selectedRule ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
      </select></label>
      <label class="field" id="carry-max-field">Максимум переноса<input class="input" name="carry_max" type="number" min="0" step="0.01" value="${category.carry_max || 0}"></label>
    `, (data) => this.runMutation('updateCarryRule', [categoryId, data.carry_rule, data.carry_max], () => periodService.updateCarryRule(categoryId, data.carry_rule, data.carry_max), 'Правило переноса обновлено'));
    const toggleMax = () => {
      const select = this.modalRoot.querySelector('#carry-rule-select');
      const field = this.modalRoot.querySelector('#carry-max-field');
      if (field) field.hidden = select?.value !== 'max';
    };
    this.modalRoot.querySelector('#carry-rule-select')?.addEventListener('change', toggleMax);
    toggleMax();
  }

  runCompareFromPage() {
    const form = this.content.querySelector('#compare-form');
    if (!form) return;
    const data = Object.fromEntries(new FormData(form).entries());
    this.compareMode = data.mode || 'two';
    this.compareYear = Number(data.year) || this.compareYear;
    this.compareResult = periodService.compare(this.compareMode, data);
    this.refresh();
  }

  renderCompare() {
    const currency = this.currency();
    const periods = [...periodService.getAll()].sort((a, b) => (b.year - a.year) || (b.month - a.month));
    const years = [...new Set(periods.map((period) => Number(period.year)))];
    if (!years.includes(this.compareYear)) years.unshift(this.compareYear);
    const firstPeriod = periods[0];
    const secondPeriod = periods[1] || periods[0];
    const result = this.compareResult || periodService.compare(this.compareMode, {
      periodA: firstPeriod?.id,
      periodB: secondPeriod?.id,
      year: this.compareYear,
      quarter: 1,
      half: 1
    });
    const option = (period, selected) => `<option value="${period.id}" ${period.id === selected ? 'selected' : ''}>${escapeHtml(periodService.formatPeriodTitle(period))}</option>`;
    return `
      ${this.toolbar('Сравнение периодов', 'План-факт и динамика между месяцами')}
      <section class="panel glass">
        <form id="compare-form" class="filters">
          <select class="input" name="mode">
            ${[['two', 'Два периода'], ['quarter', 'Квартал'], ['half', 'Полугодие'], ['year', 'Год']].map(([value, label]) => `<option value="${value}" ${this.compareMode === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
          <select class="input" name="periodA">${periods.map((period) => option(period, result.items?.[0]?.period?.id || firstPeriod?.id)).join('')}</select>
          <select class="input" name="periodB">${periods.map((period) => option(period, result.items?.[1]?.period?.id || secondPeriod?.id)).join('')}</select>
          <select class="input" name="year">${years.map((year) => `<option value="${year}" ${year === this.compareYear ? 'selected' : ''}>${year}</option>`).join('')}</select>
          <select class="input" name="quarter"><option value="1">1 квартал</option><option value="2">2 квартал</option><option value="3">3 квартал</option><option value="4">4 квартал</option></select>
          <select class="input" name="half"><option value="1">1 полугодие</option><option value="2">2 полугодие</option></select>
          <button type="button" class="btn btn-primary" data-action="compare-run">Сравнить</button>
        </form>
      </section>
      <section class="stats-grid compact">
        ${this.statCard('Доход', result.totals?.income || 0)}
        ${this.statCard('Расходы', result.totals?.expenses || 0)}
        ${this.statCard('Накопления', result.totals?.savings || 0)}
        ${this.statCard('Кредиты', result.totals?.credits || 0)}
      </section>
      <section class="two-col">
        <article class="panel glass">
          <div class="panel-head"><h3>Периоды</h3></div>
          <div class="list">
            ${result.items?.length ? result.items.map((item) => `
              <div class="list-row">
                <div><strong>${escapeHtml(item.title)}</strong><p class="muted">Доход ${formatMoney(item.income, currency)} · расход ${formatMoney(item.expenses, currency)}</p></div>
                <strong>${formatMoney(item.remainder, currency)}</strong>
              </div>
            `).join('') : '<p class="empty">Нет данных для сравнения</p>'}
          </div>
        </article>
        <article class="panel glass">
          <div class="panel-head"><h3>Динамика</h3></div>
          <div class="list">
            ${result.growth ? Object.entries(result.growth).map(([key, value]) => `
              <div class="list-row">
                <div><strong>${escapeHtml(this.compareMetricLabel(key))}</strong><p class="muted">${value.pct}%</p></div>
                <strong class="${value.diff >= 0 ? 'success' : 'danger'}">${formatMoney(value.diff, currency)}</strong>
              </div>
            `).join('') : '<p class="empty">Выберите минимум два периода</p>'}
          </div>
        </article>
      </section>
    `;
  }

  renderArchive() {
    const currency = this.currency();
    const items = periodService.getArchive();
    return `
      ${this.toolbar('Архив', 'Закрытые периоды, отчёты и экспорт')}
      <section class="cards-stack">
        ${items.length ? items.map((item) => `
          <article class="entity-card glass">
            <div class="entity-main">
              <div class="entity-icon">archive</div>
              <div>
                <h3>${escapeHtml(item.title)} <span class="badge">${escapeHtml(PERIOD_STATUS_LABELS[item.status] || item.status)}</span></h3>
                <p class="muted">Закрыт: ${formatDateTime(item.closed_at)} · отчёт ${item.report ? 'готов' : 'не найден'}</p>
                <p class="muted">Доход ${formatMoney(item.summary.income, currency)} · расход ${formatMoney(item.summary.expenses, currency)} · остаток ${formatMoney(item.summary.remainder, currency)}</p>
              </div>
            </div>
            <div class="entity-side">
              <div class="btn-row wrap">
                <button class="btn btn-sm btn-primary" data-action="archive-open" data-id="${item.id}">Открыть</button>
                <button class="btn btn-sm btn-ghost" data-action="report-view" data-id="${item.id}">Отчёт</button>
                <button class="btn btn-sm btn-ghost" data-action="archive-export" data-id="${item.id}">Экспорт</button>
                <button class="btn btn-sm btn-ghost" data-action="archive-restore" data-id="${item.id}">Восстановить</button>
              </div>
            </div>
          </article>
        `).join('') : '<p class="empty glass">Архив пока пуст</p>'}
      </section>
    `;
  }

  compareMetricLabel(key) {
    return {
      income: 'Доход',
      expenses: 'Расходы',
      savings: 'Накопления',
      capital: 'Капитал',
      credits: 'Кредиты',
      utilities: 'ЖКХ',
      freeMoney: 'Свободные деньги'
    }[key] || key;
  }

  exportPeriod(periodId) {
    const data = periodService.exportPeriodData(periodId);
    if (!data) {
      this.toast('Период не найден', 'error');
      return;
    }
    const title = periodService.formatPeriodTitle(data.period).replace(/\s+/g, '-').toLowerCase();
    downloadText(`period-${title}.json`, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
    this.toast('Экспорт периода готов', 'success');
  }

  showReportModal(periodId) {
    const period = periodService.getById(periodId);
    const report = periodService.getReport(periodId);
    const summary = report?.summary || periodService.buildPeriodSummary(periodId);
    if (!period || !summary) {
      this.toast('Отчёт не найден', 'warning');
      return;
    }
    const currency = this.currency();
    this.openInfoModal(`Отчёт: ${periodService.formatPeriodTitle(period)}`, `
      <section class="stats-grid compact">
        ${this.statCard('Доход', summary.income)}
        ${this.statCard('Расходы', summary.expenses)}
        ${this.statCard('Накопления', summary.savings)}
        ${this.statCard('Остаток', summary.remainder)}
      </section>
      <div class="list">
        <div class="list-row"><div><strong>Коммунальные услуги</strong><p class="muted">Оплачено за период</p></div><strong>${formatMoney(summary.utilities, currency)}</strong></div>
        <div class="list-row"><div><strong>Кредиты</strong><p class="muted">Платежи по кредитам</p></div><strong>${formatMoney(summary.credits, currency)}</strong></div>
        <div class="list-row"><div><strong>Лучший доход</strong><p class="muted">${escapeHtml(summary.topIncomeTitle)}</p></div><strong>${formatMoney(summary.topIncomeAmount, currency)}</strong></div>
        <div class="list-row"><div><strong>Крупная категория расходов</strong><p class="muted">${escapeHtml(summary.topExpenseCategory)}</p></div><strong>${formatMoney(summary.topExpenseAmount, currency)}</strong></div>
        <div class="list-row"><div><strong>Баланс конвертов</strong><p class="muted">На момент отчёта</p></div><strong>${formatMoney(summary.envelopesBalance, currency)}</strong></div>
        <div class="list-row"><div><strong>Сформирован</strong></div><span class="muted">${formatDateTime(report?.created_at || summary.closedAt)}</span></div>
      </div>
    `);
  }

  createRoot(id) {
    const element = document.createElement('div');
    element.id = id;
    document.body.appendChild(element);
    return element;
  }

  toPascal(value) {
    return String(value).replace(/(^|-)(\w)/g, (_, __, char) => char.toUpperCase());
  }
}

export default AppUI;
