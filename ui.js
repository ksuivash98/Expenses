/**
 * ui.js
 * Слой интерфейса: навигация, рендер экранов, модальные окна, тосты.
 * Не содержит бизнес-логики — только отображение и сбор данных форм.
 */

import { incomeService } from './income.js';
import { budgetService } from './budget.js';
import { expensesService } from './expenses.js';
import { creditsService } from './credits.js';
import { utilitiesService } from './utilities.js';
import { goalsService } from './goals.js';
import { analyticsService } from './analytics.js';
import { calendarService } from './calendar.js';
import { historyService } from './history.js';
import { notificationsService } from './notifications.js';
import { settingsService } from './settings.js';
import { chartsService } from './charts.js';
import {
  animateNumber,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatMoney,
  todayISO
} from './utils.js';

/**
 * Главный UI-контроллер приложения.
 */
export class UI {
  /**
   * @param {object} app Ссылка на приложение (колбэки действий).
   */
  constructor(app) {
    this.app = app;
    this.currentPage = 'dashboard';
    this.calendarYear = new Date().getFullYear();
    this.calendarMonth = new Date().getMonth();
    this.selectedCalendarDate = todayISO();
    this.historyFilter = 'all';
    this.historyQuery = '';

    this.pages = {
      dashboard: { title: 'Главная', render: () => this.renderDashboard() },
      income: { title: 'Доходы', render: () => this.renderIncome() },
      budget: { title: 'Конверты бюджета', render: () => this.renderBudget() },
      credits: { title: 'Кредиты', render: () => this.renderCredits() },
      utilities: { title: 'Коммунальные услуги', render: () => this.renderUtilities() },
      expenses: { title: 'Покупки', render: () => this.renderExpenses() },
      goals: { title: 'Финансовые цели', render: () => this.renderGoals() },
      calendar: { title: 'Календарь', render: () => this.renderCalendar() },
      analytics: { title: 'Аналитика', render: () => this.renderAnalytics() },
      history: { title: 'История', render: () => this.renderHistory() },
      settings: { title: 'Настройки', render: () => this.renderSettings() }
    };
  }

  /**
   * Инициализация DOM-ссылок и базовых обработчиков.
   */
  init() {
    this.content = document.getElementById('page-content');
    this.pageTitle = document.getElementById('page-title');
    this.modalRoot = document.getElementById('modal-root');
    this.toastRoot = document.getElementById('toast-root');
    this.sidebar = document.getElementById('sidebar');
    this.overlay = document.getElementById('sidebar-overlay');

    this.bindGlobalEvents();
    this.updateNotificationBadge();
  }

  /**
   * Глобальные обработчики навигации и оболочки.
   */
  bindGlobalEvents() {
    document.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.navigate(btn.dataset.nav);
        this.closeSidebar();
      });
    });

    document.getElementById('menu-toggle')?.addEventListener('click', () => {
      this.sidebar?.classList.toggle('open');
      this.overlay?.classList.toggle('visible');
    });

    this.overlay?.addEventListener('click', () => this.closeSidebar());

    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      settingsService.toggleTheme();
      this.refresh();
    });

    document.getElementById('notifications-btn')?.addEventListener('click', () => {
      this.openNotificationsModal();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.closeModal();
    });
  }

  /**
   * Закрывает мобильное меню.
   */
  closeSidebar() {
    this.sidebar?.classList.remove('open');
    this.overlay?.classList.remove('visible');
  }

  /**
   * Переход на страницу.
   * @param {string} pageId
   */
  navigate(pageId) {
    if (!this.pages[pageId]) pageId = 'dashboard';
    this.currentPage = pageId;

    document.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.nav === pageId);
    });

    if (this.pageTitle) {
      this.pageTitle.textContent = this.pages[pageId].title;
    }

    this.refresh();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Полный перерендер текущего экрана.
   */
  refresh() {
    if (!this.content || !this.pages[this.currentPage]) return;
    this.content.innerHTML = this.pages[this.currentPage].render();
    this.content.classList.remove('fade-in');
    void this.content.offsetWidth;
    this.content.classList.add('fade-in');
    this.bindPageEvents();
    this.updateHeaderStats();
    this.updateNotificationBadge();
  }

  /**
   * Обновляет компактные показатели в шапке.
   */
  updateHeaderStats() {
    const currency = settingsService.get().currency;
    const freeEl = document.getElementById('header-free-money');
    const debtEl = document.getElementById('header-debt');

    if (freeEl) {
      animateNumber(freeEl, incomeService.getFreeMoney(), { currency });
    }
    if (debtEl) {
      animateNumber(debtEl, creditsService.getTotalDebt(), { currency });
    }
  }

  /**
   * Бейдж непрочитанных уведомлений.
   */
  updateNotificationBadge() {
    const badge = document.getElementById('notifications-badge');
    const count = notificationsService.getUnreadCount();
    if (!badge) return;
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }

  /**
   * Возвращает текущую валюту.
   * @returns {string}
   */
  currency() {
    return settingsService.get().currency || 'RUB';
  }

  /**
   * Форматирует деньги в текущей валюте.
   * @param {number} amount
   * @returns {string}
   */
  money(amount) {
    return formatMoney(amount, this.currency());
  }

  /**
   * Привязывает обработчики кнопок текущего экрана.
   */
  bindPageEvents() {
    this.content.querySelectorAll('[data-action]').forEach((el) => {
      const handler = (event) => {
        const action = el.dataset.action;
        const id = el.dataset.id;
        this.handleAction(action, id, el, event);
      };

      if (el.tagName === 'INPUT' && el.type === 'file') {
        el.addEventListener('change', handler);
      } else {
        el.addEventListener('click', handler);
      }
    });

    this.content.querySelectorAll('[data-chart]').forEach((canvas) => {
      this.renderChart(canvas);
    });

    const historySearch = this.content.querySelector('#history-search');
    if (historySearch) {
      historySearch.addEventListener('input', (event) => {
        this.historyQuery = event.target.value;
        this.refresh();
      });
    }

    const historyFilter = this.content.querySelector('#history-filter');
    if (historyFilter) {
      historyFilter.addEventListener('change', (event) => {
        this.historyFilter = event.target.value;
        this.refresh();
      });
    }
  }

  /**
   * Диспетчер действий UI.
   * @param {string} action
   * @param {string} id
   * @param {HTMLElement} el
   * @param {Event} event
   */
  handleAction(action, id, el, event) {
    const map = {
      'income-add': () => this.openIncomeModal(),
      'income-edit': () => this.openIncomeModal(id),
      'income-delete': () => this.confirmDelete('Удалить доход?', () => this.app.deleteIncome(id)),
      'income-distribute': () => this.openDistributeModal(id),

      'budget-add-category': () => this.openCategoryModal(),
      'budget-edit-category': () => this.openCategoryModal(id),
      'budget-delete-category': () => this.confirmDelete('Удалить конверт?', () => this.app.deleteCategory(id)),
      'budget-transfer': () => this.openTransferModal(),
      'budget-distribute': () => this.openDistributeModal(),
      'budget-show-history': () => this.openEnvelopeHistory(id),

      'expense-add': () => this.openExpenseModal(),
      'expense-delete': () => this.confirmDelete('Удалить покупку?', () => this.app.deleteExpense(id)),

      'credit-add': () => this.openCreditModal(),
      'credit-edit': () => this.openCreditModal(id),
      'credit-delete': () => this.confirmDelete('Удалить кредит?', () => this.app.deleteCredit(id)),
      'credit-pay': () => this.openCreditPayModal(id),
      'credit-close': () => this.confirmDelete('Закрыть кредит?', () => this.app.closeCredit(id)),
      'credit-history': () => this.openCreditHistory(id),

      'utility-ensure-month': () => this.app.ensureUtilityMonth(),
      'utility-edit': () => this.openUtilityModal(id),
      'utility-pay': () => this.openUtilityPayModal(id),
      'utility-delete': () => this.confirmDelete('Удалить запись?', () => this.app.deleteUtility(id)),

      'goal-add': () => this.openGoalModal(),
      'goal-edit': () => this.openGoalModal(id),
      'goal-fund': () => this.openGoalFundModal(id),
      'goal-complete': () => this.app.completeGoal(id),
      'goal-delete': () => this.confirmDelete('Удалить цель?', () => this.app.deleteGoal(id)),

      'calendar-prev': () => {
        this.calendarMonth -= 1;
        if (this.calendarMonth < 0) {
          this.calendarMonth = 11;
          this.calendarYear -= 1;
        }
        this.refresh();
      },
      'calendar-next': () => {
        this.calendarMonth += 1;
        if (this.calendarMonth > 11) {
          this.calendarMonth = 0;
          this.calendarYear += 1;
        }
        this.refresh();
      },
      'calendar-select': () => {
        this.selectedCalendarDate = id;
        this.refresh();
      },

      'settings-theme-dark': () => {
        settingsService.setTheme('dark');
        this.refresh();
      },
      'settings-theme-light': () => {
        settingsService.setTheme('light');
        this.refresh();
      },
      'settings-export': () => settingsService.exportData(),
      'settings-import': () => document.getElementById('import-file')?.click(),
      'settings-clear': () => this.confirmDelete(
        'Удалить ВСЕ данные без возможности восстановления?',
        () => {
          settingsService.clearAllData();
          this.toast('Данные очищены', 'success');
          this.navigate('dashboard');
        }
      ),
      'settings-currency': () => {
        const currency = el.dataset.currency;
        const result = settingsService.setCurrency(currency);
        if (result.success) {
          this.toast('Валюта обновлена', 'success');
          this.refresh();
        }
      },

      'nav': () => this.navigate(id)
    };

    if (action === 'settings-import-change') {
      const file = event.target.files?.[0];
      if (file) {
        this.app.importData(file);
      }
      return;
    }

    if (map[action]) map[action]();
  }

  /**
   * Отрисовывает canvas-диаграмму по data-атрибутам.
   * @param {HTMLCanvasElement} canvas
   */
  renderChart(canvas) {
    const type = canvas.dataset.chart;
    const currency = this.currency();
    const analytics = analyticsService.getDashboardAnalytics();

    if (type === 'income-structure') {
      chartsService.drawDonut(canvas, analytics.incomeStructure, { currency, centerLabel: 'Доходы' });
      const legend = canvas.parentElement?.querySelector('.chart-legend-target');
      if (legend) legend.innerHTML = chartsService.buildLegendHtml(analytics.incomeStructure, currency);
    }

    if (type === 'expense-structure') {
      chartsService.drawDonut(canvas, analytics.expenseStructure, { currency, centerLabel: 'Расходы' });
      const legend = canvas.parentElement?.querySelector('.chart-legend-target');
      if (legend) legend.innerHTML = chartsService.buildLegendHtml(analytics.expenseStructure, currency);
    }

    if (type === 'envelopes') {
      chartsService.drawBars(canvas, analytics.envelopeStructure, { currency });
    }

    if (type === 'monthly') {
      chartsService.drawGroupedBars(canvas, analytics.monthlyDynamics, { currency });
    }

    if (type === 'credits') {
      chartsService.drawDonut(canvas, analytics.credits.items, { currency, centerLabel: 'Долг' });
    }

    if (type === 'utilities') {
      chartsService.drawBars(canvas, analytics.utilities.items, { currency });
    }

    if (type === 'savings') {
      chartsService.drawDonut(canvas, analytics.savings.goals.length
        ? analytics.savings.goals.map((g) => ({ label: g.label, value: g.value }))
        : [{ label: 'Накопления', value: analytics.savings.envelopeSavings }], {
        currency,
        centerLabel: 'Цели'
      });
    }
  }

  /* ===================== РЕНДЕР ЭКРАНОВ ===================== */

  /**
   * Dashboard.
   * @returns {string}
   */
  renderDashboard() {
    const currency = this.currency();
    const income = incomeService.getSummary();
    const budget = budgetService.getSummary();
    const expenses = expensesService.getSummary();
    const credits = creditsService.getSummary();
    const utilities = utilitiesService.getSummary();
    const goals = goalsService.getSummary();
    const recent = historyService.getRecent(8);
    const payments = calendarService.getDashboardPayments(6);

    const cards = [
      { label: 'Общий доход', value: income.totalIncome, icon: '💰', tone: 'blue' },
      { label: 'Свободные деньги', value: income.freeMoney, icon: '🪙', tone: 'green' },
      { label: 'Распределено', value: income.totalDistributed, icon: '📦', tone: 'cyan' },
      { label: 'Потрачено', value: expenses.totalSpent, icon: '🛒', tone: 'orange' },
      { label: 'Остаток на конвертах', value: budget.totalBalance, icon: '💼', tone: 'purple' },
      { label: 'Накопления', value: budget.savings, icon: '💎', tone: 'mint' },
      { label: 'Кредиты (долг)', value: credits.totalDebt, icon: '💳', tone: 'red' },
      { label: 'Коммуналка (месяц)', value: utilities.monthTotal || utilities.monthPending, icon: '🏠', tone: 'yellow' },
      { label: 'Цели (накоплено)', value: goals.totalSaved, icon: '🎯', tone: 'teal' }
    ];

    return `
      <section class="hero-panel glass">
        <div>
          <p class="eyebrow">Личный финансовый кабинет</p>
          <h2>Ваши финансы под контролем</h2>
          <p class="muted">Свободные средства распределяйте вручную по конвертам — без автопроцентов.</p>
        </div>
        <div class="hero-actions">
          <button class="btn btn-primary" data-action="income-add">+ Доход</button>
          <button class="btn btn-ghost" data-action="budget-distribute">Распределить</button>
          <button class="btn btn-ghost" data-action="expense-add">Покупка</button>
        </div>
      </section>

      <section class="stats-grid">
        ${cards.map((card, index) => `
          <article class="stat-card glass tone-${card.tone}" style="animation-delay:${index * 40}ms">
            <div class="stat-icon">${card.icon}</div>
            <div>
              <p class="stat-label">${card.label}</p>
              <p class="stat-value" data-raw-value="${card.value}">${formatMoney(card.value, currency)}</p>
            </div>
          </article>
        `).join('')}
      </section>

      <section class="two-col">
        <article class="panel glass">
          <div class="panel-head">
            <h3>Последние операции</h3>
            <button class="link-btn" data-action="nav" data-id="history">Вся история</button>
          </div>
          <div class="timeline">
            ${recent.length ? recent.map((item) => `
              <div class="timeline-item">
                <div class="timeline-icon">${item.icon || '📌'}</div>
                <div class="timeline-body">
                  <strong>${escapeHtml(item.title)}</strong>
                  <p>${escapeHtml(item.description || '')}</p>
                  <span class="muted">${formatDateTime(item.timestamp)}</span>
                </div>
                <div class="timeline-amount">${item.amount != null ? formatMoney(item.amount, currency) : ''}</div>
              </div>
            `).join('') : '<p class="empty">Пока нет операций</p>'}
          </div>
        </article>

        <article class="panel glass">
          <div class="panel-head">
            <h3>Ближайшие платежи</h3>
            <button class="link-btn" data-action="nav" data-id="calendar">Календарь</button>
          </div>
          <div class="list">
            ${payments.length ? payments.map((item) => `
              <div class="list-row">
                <div class="list-icon">${item.icon}</div>
                <div>
                  <strong>${escapeHtml(item.title)}</strong>
                  <p class="muted">${escapeHtml(item.subtitle || '')} · ${formatDate(item.date)}</p>
                </div>
                <strong>${formatMoney(item.amount, currency)}</strong>
              </div>
            `).join('') : '<p class="empty">Ближайших платежей нет</p>'}
          </div>
        </article>
      </section>

      <section class="panel glass">
        <div class="panel-head"><h3>Конверты</h3></div>
        <div class="envelope-mini-grid">
          ${budget.envelopes.map((env) => `
            <div class="envelope-mini" style="--accent:${env.color}">
              <div class="env-top"><span>${env.icon}</span><strong>${escapeHtml(env.name)}</strong></div>
              <div class="env-balance">${formatMoney(env.balance, currency)}</div>
              <div class="env-meta muted">получ. ${formatMoney(env.received, currency)} · расх. ${formatMoney(env.spent, currency)}</div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  /**
   * Экран доходов.
   * @returns {string}
   */
  renderIncome() {
    const currency = this.currency();
    const items = incomeService.getAll().map((item) => {
      const distributed = incomeService.getDistributedForIncome(item.id);
      const remaining = incomeService.getRemainingForIncome(item.id);
      return { ...item, distributed, remaining };
    });
    const summary = incomeService.getSummary();

    return `
      <section class="toolbar">
        <div>
          <h2>Доходы</h2>
          <p class="muted">Свободные деньги: <strong>${formatMoney(summary.freeMoney, currency)}</strong></p>
        </div>
        <button class="btn btn-primary" data-action="income-add">+ Добавить доход</button>
      </section>

      <section class="stats-grid compact">
        <article class="stat-card glass"><p class="stat-label">Всего получено</p><p class="stat-value">${formatMoney(summary.totalIncome, currency)}</p></article>
        <article class="stat-card glass"><p class="stat-label">Распределено</p><p class="stat-value">${formatMoney(summary.totalDistributed, currency)}</p></article>
        <article class="stat-card glass"><p class="stat-label">Свободно</p><p class="stat-value">${formatMoney(summary.freeMoney, currency)}</p></article>
      </section>

      <section class="cards-stack">
        ${items.length ? items.map((item) => `
          <article class="entity-card glass">
            <div class="entity-main">
              <div class="entity-icon">💰</div>
              <div>
                <h3>${escapeHtml(item.name)}</h3>
                <p class="muted">${escapeHtml(item.source)} · ${formatDate(item.date)}</p>
                ${item.comment ? `<p>${escapeHtml(item.comment)}</p>` : ''}
              </div>
            </div>
            <div class="entity-side">
              <strong class="amount">${formatMoney(item.amount, currency)}</strong>
              <p class="muted">Распред. ${formatMoney(item.distributed, currency)}</p>
              <p class="muted">Осталось ${formatMoney(item.remaining, currency)}</p>
              <div class="btn-row">
                ${item.remaining > 0 ? `<button class="btn btn-sm btn-primary" data-action="income-distribute" data-id="${item.id}">Распределить</button>` : ''}
                <button class="btn btn-sm btn-ghost" data-action="income-edit" data-id="${item.id}">Изменить</button>
                <button class="btn btn-sm btn-danger" data-action="income-delete" data-id="${item.id}">Удалить</button>
              </div>
            </div>
          </article>
        `).join('') : '<p class="empty glass">Доходов пока нет. Добавьте первый доход.</p>'}
      </section>
    `;
  }

  /**
   * Экран конвертов.
   * @returns {string}
   */
  renderBudget() {
    const currency = this.currency();
    const summary = budgetService.getSummary();
    const undistributed = incomeService.getUndistributed();

    return `
      <section class="toolbar">
        <div>
          <h2>Конверты бюджета</h2>
          <p class="muted">Свободно к распределению: <strong>${formatMoney(summary.freeMoney, currency)}</strong></p>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" data-action="budget-distribute">Распределить доход</button>
          <button class="btn btn-ghost" data-action="budget-transfer">Перевод</button>
          <button class="btn btn-ghost" data-action="budget-add-category">+ Конверт</button>
        </div>
      </section>

      ${undistributed.length ? `
        <section class="alert glass">
          Есть нераспределённые доходы (${undistributed.length}).
          <button class="btn btn-sm btn-primary" data-action="budget-distribute">Распределить</button>
        </section>
      ` : ''}

      <section class="envelope-grid">
        ${summary.envelopes.map((env) => `
          <article class="envelope-card glass" style="--accent:${env.color}">
            <div class="env-head">
              <span class="env-icon">${env.icon}</span>
              <div>
                <h3>${escapeHtml(env.name)}</h3>
                <p class="muted">Текущий баланс</p>
              </div>
              <strong>${formatMoney(env.balance, currency)}</strong>
            </div>
            <div class="env-stats">
              <div><span>Получено</span><strong>${formatMoney(env.received, currency)}</strong></div>
              <div><span>Потрачено</span><strong>${formatMoney(env.spent, currency)}</strong></div>
              <div><span>Осталось</span><strong>${formatMoney(env.remaining, currency)}</strong></div>
            </div>
            <div class="progress-line"><i style="width:${Math.min(100, env.received ? (env.spent / env.received) * 100 : 0)}%;background:${env.color}"></i></div>
            <div class="btn-row">
              <button class="btn btn-sm btn-ghost" data-action="budget-show-history" data-id="${env.id}">История</button>
              <button class="btn btn-sm btn-ghost" data-action="budget-edit-category" data-id="${env.id}">Изменить</button>
              <button class="btn btn-sm btn-danger" data-action="budget-delete-category" data-id="${env.id}">Удалить</button>
            </div>
          </article>
        `).join('')}
      </section>
    `;
  }

  /**
   * Экран покупок.
   * @returns {string}
   */
  renderExpenses() {
    const currency = this.currency();
    const items = expensesService.getAllEnriched();
    const summary = expensesService.getSummary();

    return `
      <section class="toolbar">
        <div>
          <h2>Покупки</h2>
          <p class="muted">Всего потрачено: <strong>${formatMoney(summary.totalSpent, currency)}</strong></p>
        </div>
        <button class="btn btn-primary" data-action="expense-add">+ Добавить покупку</button>
      </section>

      <section class="cards-stack">
        ${items.length ? items.map((item) => `
          <article class="entity-card glass">
            <div class="entity-main">
              <div class="entity-icon">${item.categoryIcon}</div>
              <div>
                <h3>${escapeHtml(item.name)}</h3>
                <p class="muted">${escapeHtml(item.categoryName)} → конверт «${escapeHtml(item.envelopeName)}» · ${formatDate(item.date)}</p>
                ${item.comment ? `<p>${escapeHtml(item.comment)}</p>` : ''}
              </div>
            </div>
            <div class="entity-side">
              <strong class="amount danger">${formatMoney(item.amount, currency)}</strong>
              <button class="btn btn-sm btn-danger" data-action="expense-delete" data-id="${item.id}">Удалить</button>
            </div>
          </article>
        `).join('') : '<p class="empty glass">Покупок пока нет</p>'}
      </section>
    `;
  }

  /**
   * Экран кредитов.
   * @returns {string}
   */
  renderCredits() {
    const currency = this.currency();
    const items = creditsService.getAllEnriched();
    const summary = creditsService.getSummary();

    return `
      <section class="toolbar">
        <div>
          <h2>Кредиты</h2>
          <p class="muted">Общий долг: <strong>${formatMoney(summary.totalDebt, currency)}</strong> · платежи/мес: ${formatMoney(summary.monthlyPayments, currency)}</p>
        </div>
        <button class="btn btn-primary" data-action="credit-add">+ Добавить кредит</button>
      </section>

      <section class="cards-stack">
        ${items.length ? items.map((item) => `
          <article class="entity-card glass">
            <div class="entity-main">
              <div class="entity-icon">💳</div>
              <div>
                <h3>${escapeHtml(item.name)} ${item.status === 'closed' ? '<span class="badge">Закрыт</span>' : ''}</h3>
                <p class="muted">${escapeHtml(item.bank || 'Банк не указан')} · ставка ${item.interestRate}% · платёж ${formatDate(item.nextPaymentDate)}</p>
                <div class="progress-line"><i style="width:${item.progress}%"></i></div>
                <p class="muted">Прогресс погашения: ${item.progress}%</p>
              </div>
            </div>
            <div class="entity-side">
              <strong class="amount">${formatMoney(item.remainingAmount, currency)}</strong>
              <p class="muted">из ${formatMoney(item.initialAmount, currency)}</p>
              <p class="muted">Платёж ${formatMoney(item.monthlyPayment, currency)}</p>
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
   * Экран коммунальных услуг.
   * @returns {string}
   */
  renderUtilities() {
    const currency = this.currency();
    const monthKey = utilitiesService.getCurrentMonthKey();
    const items = utilitiesService.getByMonthKey(monthKey);
    const stats = utilitiesService.getStats();

    return `
      <section class="toolbar">
        <div>
          <h2>Коммунальные услуги</h2>
          <p class="muted">Период ${monthKey}</p>
        </div>
        <button class="btn btn-primary" data-action="utility-ensure-month">Создать записи месяца</button>
      </section>

      <section class="stats-grid compact">
        <article class="stat-card glass"><p class="stat-label">За месяц</p><p class="stat-value">${formatMoney(stats.monthTotal, currency)}</p></article>
        <article class="stat-card glass"><p class="stat-label">Средний за год</p><p class="stat-value">${formatMoney(stats.yearAverage, currency)}</p></article>
        <article class="stat-card glass"><p class="stat-label">Макс / Мин</p><p class="stat-value">${formatMoney(stats.yearMax, currency)} / ${formatMoney(stats.yearMin, currency)}</p></article>
        <article class="stat-card glass"><p class="stat-label">За год</p><p class="stat-value">${formatMoney(stats.yearTotal, currency)}</p></article>
      </section>

      <section class="cards-stack">
        ${items.length ? items.map((item) => `
          <article class="entity-card glass">
            <div class="entity-main">
              <div class="entity-icon">${item.typeIcon}</div>
              <div>
                <h3>${escapeHtml(item.typeName)}</h3>
                <p class="muted">К оплате ${formatDate(item.dueDate)} · статус: ${item.status === 'paid' ? 'оплачено' : 'ожидает'}</p>
                ${item.paidAt ? `<p class="muted">Оплачено: ${formatDate(item.paidAt)}</p>` : ''}
                ${item.comment ? `<p>${escapeHtml(item.comment)}</p>` : ''}
                ${item.receipt ? `<p class="muted">Квитанция: ${escapeHtml(item.receipt)}</p>` : ''}
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
        `).join('') : '<p class="empty glass">Нет записей за месяц. Нажмите «Создать записи месяца».</p>'}
      </section>
    `;
  }

  /**
   * Экран целей.
   * @returns {string}
   */
  renderGoals() {
    const currency = this.currency();
    const items = goalsService.getAllEnriched();
    const summary = goalsService.getSummary();

    return `
      <section class="toolbar">
        <div>
          <h2>Финансовые цели</h2>
          <p class="muted">Накоплено ${formatMoney(summary.totalSaved, currency)} из ${formatMoney(summary.totalTarget, currency)}</p>
        </div>
        <button class="btn btn-primary" data-action="goal-add">+ Новая цель</button>
      </section>

      <section class="goals-grid">
        ${items.length ? items.map((item) => `
          <article class="goal-card glass">
            <div class="goal-head">
              <span class="goal-icon">${item.icon || '🎯'}</span>
              <div>
                <h3>${escapeHtml(item.name)} ${item.status === 'completed' ? '<span class="badge">Готово</span>' : ''}</h3>
                <p class="muted">${item.deadline ? `До ${formatDate(item.deadline)}` : 'Без срока'}</p>
              </div>
            </div>
            <div class="goal-amounts">
              <div><span>Цель</span><strong>${formatMoney(item.targetAmount, currency)}</strong></div>
              <div><span>Накоплено</span><strong>${formatMoney(item.savedAmount, currency)}</strong></div>
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
   * Экран календаря.
   * @returns {string}
   */
  renderCalendar() {
    const currency = this.currency();
    const grid = calendarService.buildMonthGrid(this.calendarYear, this.calendarMonth);
    const dayEvents = calendarService.getEventsForDate(this.selectedCalendarDate);

    return `
      <section class="toolbar">
        <div>
          <h2>Календарь</h2>
          <p class="muted">Платежи по кредитам, ЖКХ и целям</p>
        </div>
        <div class="btn-row">
          <button class="btn btn-ghost" data-action="calendar-prev">←</button>
          <strong>${grid.title}</strong>
          <button class="btn btn-ghost" data-action="calendar-next">→</button>
        </div>
      </section>

      <section class="two-col calendar-layout">
        <article class="panel glass">
          <div class="calendar-weekdays">
            ${grid.weekdays.map((d) => `<span>${d}</span>`).join('')}
          </div>
          <div class="calendar-grid">
            ${grid.cells.map((cell) => `
              <button class="cal-cell ${cell.inMonth ? '' : 'out'} ${cell.date === this.selectedCalendarDate ? 'selected' : ''} ${cell.events.length ? 'has-events' : ''}"
                data-action="calendar-select" data-id="${cell.date}">
                <span class="cal-day">${cell.day}</span>
                <span class="cal-dots">
                  ${cell.events.slice(0, 3).map((e) => `<i style="background:${e.color}"></i>`).join('')}
                </span>
              </button>
            `).join('')}
          </div>
        </article>

        <article class="panel glass">
          <div class="panel-head">
            <h3>События на ${formatDate(this.selectedCalendarDate)}</h3>
          </div>
          <div class="list">
            ${dayEvents.length ? dayEvents.map((item) => `
              <div class="list-row">
                <div class="list-icon">${item.icon}</div>
                <div>
                  <strong>${escapeHtml(item.title)}</strong>
                  <p class="muted">${escapeHtml(item.subtitle || '')}</p>
                </div>
                <strong>${formatMoney(item.amount, currency)}</strong>
              </div>
            `).join('') : '<p class="empty">На эту дату событий нет</p>'}
          </div>
        </article>
      </section>
    `;
  }

  /**
   * Экран аналитики.
   * @returns {string}
   */
  renderAnalytics() {
    const analytics = analyticsService.getDashboardAnalytics();
    const currency = this.currency();
    const load = analytics.load;

    return `
      <section class="toolbar">
        <div>
          <h2>Аналитика</h2>
          <p class="muted">Все показатели пересчитываются автоматически</p>
        </div>
      </section>

      <section class="stats-grid compact">
        <article class="stat-card glass"><p class="stat-label">Фин. нагрузка</p><p class="stat-value">${load.loadPercent}%</p></article>
        <article class="stat-card glass"><p class="stat-label">Обязательные платежи</p><p class="stat-value">${formatMoney(load.totalLoad, currency)}</p></article>
        <article class="stat-card glass"><p class="stat-label">Накопления</p><p class="stat-value">${formatMoney(analytics.savings.totalSavings, currency)}</p></article>
      </section>

      <section class="charts-grid">
        <article class="panel glass chart-panel">
          <h3>Структура доходов</h3>
          <canvas data-chart="income-structure" height="220"></canvas>
          <div class="chart-legend-target"></div>
        </article>
        <article class="panel glass chart-panel">
          <h3>Структура расходов</h3>
          <canvas data-chart="expense-structure" height="220"></canvas>
          <div class="chart-legend-target"></div>
        </article>
        <article class="panel glass chart-panel">
          <h3>Конверты</h3>
          <canvas data-chart="envelopes" height="240"></canvas>
        </article>
        <article class="panel glass chart-panel">
          <h3>Динамика по месяцам</h3>
          <canvas data-chart="monthly" height="240"></canvas>
        </article>
        <article class="panel glass chart-panel">
          <h3>Кредиты</h3>
          <canvas data-chart="credits" height="220"></canvas>
        </article>
        <article class="panel glass chart-panel">
          <h3>Коммунальные услуги</h3>
          <canvas data-chart="utilities" height="240"></canvas>
        </article>
        <article class="panel glass chart-panel">
          <h3>Накопления и цели</h3>
          <canvas data-chart="savings" height="220"></canvas>
        </article>
      </section>
    `;
  }

  /**
   * Экран истории.
   * @returns {string}
   */
  renderHistory() {
    const currency = this.currency();
    let items = historyService.getAll();

    if (this.historyFilter !== 'all') {
      items = items.filter((item) => item.type === this.historyFilter);
    }
    if (this.historyQuery) {
      items = historyService.search(this.historyQuery)
        .filter((item) => this.historyFilter === 'all' || item.type === this.historyFilter);
    }

    return `
      <section class="toolbar">
        <div>
          <h2>История</h2>
          <p class="muted">Единая лента всех операций</p>
        </div>
      </section>

      <section class="filters glass">
        <input id="history-search" class="input" type="search" placeholder="Поиск..." value="${escapeHtml(this.historyQuery)}" />
        <select id="history-filter" class="input">
          <option value="all" ${this.historyFilter === 'all' ? 'selected' : ''}>Все типы</option>
          <option value="income" ${this.historyFilter === 'income' ? 'selected' : ''}>Доходы</option>
          <option value="distribution" ${this.historyFilter === 'distribution' ? 'selected' : ''}>Распределение</option>
          <option value="expense" ${this.historyFilter === 'expense' ? 'selected' : ''}>Покупки</option>
          <option value="credit_payment" ${this.historyFilter === 'credit_payment' ? 'selected' : ''}>Кредиты</option>
          <option value="utility" ${this.historyFilter === 'utility' ? 'selected' : ''}>Коммуналка</option>
          <option value="goal_fund" ${this.historyFilter === 'goal_fund' ? 'selected' : ''}>Цели</option>
        </select>
      </section>

      <section class="timeline big">
        ${items.length ? items.map((item) => `
          <div class="timeline-item glass">
            <div class="timeline-icon">${item.icon || '📌'}</div>
            <div class="timeline-body">
              <strong>${escapeHtml(item.title)}</strong>
              <p>${escapeHtml(item.description || '')}</p>
              <span class="muted">${formatDateTime(item.timestamp)}</span>
            </div>
            <div class="timeline-amount">${item.amount != null ? formatMoney(item.amount, currency) : ''}</div>
          </div>
        `).join('') : '<p class="empty glass">История пуста</p>'}
      </section>
    `;
  }

  /**
   * Экран настроек.
   * @returns {string}
   */
  renderSettings() {
    const settings = settingsService.get();
    const currencies = settingsService.getCurrencies();

    return `
      <section class="toolbar">
        <div>
          <h2>Настройки</h2>
          <p class="muted">Тема, валюта и резервные копии</p>
        </div>
      </section>

      <section class="settings-grid">
        <article class="panel glass">
          <h3>Тема оформления</h3>
          <div class="btn-row">
            <button class="btn ${settings.theme === 'dark' ? 'btn-primary' : 'btn-ghost'}" data-action="settings-theme-dark">Тёмная</button>
            <button class="btn ${settings.theme === 'light' ? 'btn-primary' : 'btn-ghost'}" data-action="settings-theme-light">Светлая</button>
          </div>
        </article>

        <article class="panel glass">
          <h3>Валюта</h3>
          <div class="btn-row wrap">
            ${currencies.map((c) => `
              <button class="btn ${settings.currency === c.code ? 'btn-primary' : 'btn-ghost'}"
                data-action="settings-currency" data-currency="${c.code}">
                ${c.symbol} ${c.code}
              </button>
            `).join('')}
          </div>
        </article>

        <article class="panel glass">
          <h3>Данные</h3>
          <div class="btn-row wrap">
            <button class="btn btn-primary" data-action="settings-export">Экспорт JSON</button>
            <button class="btn btn-ghost" data-action="settings-import">Импорт JSON</button>
            <button class="btn btn-danger" data-action="settings-clear">Очистить данные</button>
          </div>
          <input id="import-file" type="file" accept="application/json,.json" hidden data-action="settings-import-change" />
        </article>
      </section>
    `;
  }

  /* ===================== МОДАЛЬНЫЕ ОК ===================== */

  /**
   * Открывает модальное окно.
   * @param {string} title
   * @param {string} bodyHtml
   * @param {Function} onSubmit
   */
  openModal(title, bodyHtml, onSubmit) {
    this.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal glass" role="dialog" aria-modal="true">
          <div class="modal-head">
            <h3>${title}</h3>
            <button class="icon-btn" id="modal-close" aria-label="Закрыть">✕</button>
          </div>
          <form id="modal-form" class="modal-body">
            ${bodyHtml}
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" id="modal-cancel">Отмена</button>
              <button type="submit" class="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </div>
      </div>
    `;

    this.modalRoot.querySelector('#modal-close')?.addEventListener('click', () => this.closeModal());
    this.modalRoot.querySelector('#modal-cancel')?.addEventListener('click', () => this.closeModal());
    this.modalRoot.querySelector('.modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.classList.contains('modal-backdrop')) this.closeModal();
    });

    this.modalRoot.querySelector('#modal-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.target;
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      onSubmit(data, form);
    });
  }

  /**
   * Закрывает модальное окно.
   */
  closeModal() {
    if (this.modalRoot) this.modalRoot.innerHTML = '';
  }

  /**
   * Диалог подтверждения.
   * @param {string} message
   * @param {Function} onConfirm
   */
  confirmDelete(message, onConfirm) {
    this.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal glass compact">
          <div class="modal-head"><h3>Подтверждение</h3></div>
          <div class="modal-body">
            <p>${escapeHtml(message)}</p>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" id="modal-cancel">Отмена</button>
              <button type="button" class="btn btn-danger" id="modal-confirm">Подтвердить</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.modalRoot.querySelector('#modal-cancel')?.addEventListener('click', () => this.closeModal());
    this.modalRoot.querySelector('#modal-confirm')?.addEventListener('click', () => {
      this.closeModal();
      onConfirm();
    });
  }

  /**
   * Тост-уведомление.
   * @param {string} message
   * @param {string} [type='info']
   */
  toast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    this.toastRoot.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, 3200);
  }

  /**
   * Options HTML для select конвертов.
   * @param {string} [selected]
   * @returns {string}
   */
  envelopeOptions(selected = '') {
    return budgetService.getCategories().map((cat) => `
      <option value="${cat.id}" ${cat.id === selected ? 'selected' : ''}>${cat.icon} ${escapeHtml(cat.name)}</option>
    `).join('');
  }

  /**
   * Модалка дохода.
   * @param {string} [id]
   */
  openIncomeModal(id) {
    const item = id ? incomeService.getById(id) : null;
    const sources = incomeService.getSources();

    this.openModal(item ? 'Изменить доход' : 'Новый доход', `
      <label class="field">Название<input class="input" name="name" required value="${escapeHtml(item?.name || '')}" placeholder="Зарплата за июль"></label>
      <label class="field">Источник
        <select class="input" name="source" required>
          ${sources.map((s) => `<option value="${escapeHtml(s)}" ${item?.source === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
        </select>
      </label>
      <label class="field">Сумма<input class="input" name="amount" type="number" min="0.01" step="0.01" required value="${item?.amount || ''}"></label>
      <label class="field">Дата<input class="input" name="date" type="date" required value="${item?.date || todayISO()}"></label>
      <label class="field">Комментарий<textarea class="input" name="comment" rows="3">${escapeHtml(item?.comment || '')}</textarea></label>
    `, (data) => {
      const result = item ? this.app.updateIncome(id, data) : this.app.addIncome(data);
      if (result.success) {
        this.closeModal();
        this.toast(item ? 'Доход обновлён' : 'Доход добавлен', 'success');
        this.refresh();
      } else {
        this.toast(result.message || 'Ошибка', 'error');
      }
    });
  }

  /**
   * Модалка распределения дохода по конвертам.
   * @param {string} [incomeId]
   */
  openDistributeModal(incomeId) {
    const list = incomeService.getUndistributed();
    const selected = incomeId
      ? list.find((i) => i.id === incomeId) || incomeService.getAll().map((i) => ({
        ...i,
        remaining: incomeService.getRemainingForIncome(i.id)
      })).find((i) => i.id === incomeId)
      : list[0];

    if (!selected || selected.remaining <= 0) {
      this.toast('Нет доходов для распределения', 'warning');
      return;
    }

    const envelopes = budgetService.getEnvelopes();
    const remaining = incomeService.getRemainingForIncome(selected.id);

    this.openModal('Распределение дохода', `
      <label class="field">Доход
        <select class="input" name="incomeId" id="dist-income">
          ${incomeService.getUndistributed().map((i) => `
            <option value="${i.id}" ${i.id === selected.id ? 'selected' : ''}>
              ${escapeHtml(i.name)} — остаток ${formatMoney(i.remaining, this.currency())}
            </option>
          `).join('')}
        </select>
      </label>
      <div class="dist-summary glass-soft">
        <div>Получено / остаток: <strong id="dist-total">${formatMoney(remaining, this.currency())}</strong></div>
        <div>Распределено: <strong id="dist-allocated">0</strong></div>
        <div>Осталось распределить: <strong id="dist-left">${formatMoney(remaining, this.currency())}</strong></div>
      </div>
      <div class="dist-list">
        ${envelopes.map((env) => `
          <label class="field dist-row">
            <span>${env.icon} ${escapeHtml(env.name)}</span>
            <input class="input dist-amount" name="amount_${env.id}" type="number" min="0" step="0.01" value="0" data-cat="${env.id}">
          </label>
        `).join('')}
      </div>
    `, (data, form) => {
      const incomeSelected = data.incomeId;
      const allocations = [...form.querySelectorAll('.dist-amount')].map((input) => ({
        categoryId: input.dataset.cat,
        amount: input.value
      }));

      const result = this.app.distribute(incomeSelected, allocations);
      if (result.success) {
        this.closeModal();
        this.toast('Средства распределены', 'success');
        this.refresh();
      } else {
        this.toast(result.message || 'Ошибка распределения', 'error');
      }
    });

    const updateDist = () => {
      const inputs = [...this.modalRoot.querySelectorAll('.dist-amount')];
      const allocated = inputs.reduce((sum, input) => sum + (Number(input.value) || 0), 0);
      const incomeSelect = this.modalRoot.querySelector('#dist-income');
      const currentRemaining = incomeService.getRemainingForIncome(incomeSelect.value);
      const left = Math.round((currentRemaining - allocated) * 100) / 100;

      const allocatedEl = this.modalRoot.querySelector('#dist-allocated');
      const leftEl = this.modalRoot.querySelector('#dist-left');
      const totalEl = this.modalRoot.querySelector('#dist-total');
      if (allocatedEl) allocatedEl.textContent = formatMoney(allocated, this.currency());
      if (leftEl) leftEl.textContent = formatMoney(left, this.currency());
      if (totalEl) totalEl.textContent = formatMoney(currentRemaining, this.currency());
      if (leftEl) leftEl.classList.toggle('danger-text', Math.abs(left) > 0.009);
    };

    this.modalRoot.querySelectorAll('.dist-amount').forEach((input) => {
      input.addEventListener('input', updateDist);
    });
    this.modalRoot.querySelector('#dist-income')?.addEventListener('change', updateDist);
  }

  /**
   * Модалка категории.
   * @param {string} [id]
   */
  openCategoryModal(id) {
    const item = id ? budgetService.getCategoryById(id) : null;
    this.openModal(item ? 'Изменить конверт' : 'Новый конверт', `
      <label class="field">Название<input class="input" name="name" required value="${escapeHtml(item?.name || '')}"></label>
      <label class="field">Иконка<input class="input" name="icon" value="${escapeHtml(item?.icon || '📦')}" maxlength="4"></label>
      <label class="field">Цвет<input class="input" name="color" type="color" value="${item?.color || '#5B8DEF'}"></label>
    `, (data) => {
      const result = item ? this.app.updateCategory(id, data) : this.app.createCategory(data);
      if (result.success) {
        this.closeModal();
        this.toast(item ? 'Конверт обновлён' : 'Конверт создан', 'success');
        this.refresh();
      } else {
        this.toast(result.message || 'Ошибка', 'error');
      }
    });
  }

  /**
   * Модалка перевода между конвертами.
   */
  openTransferModal() {
    this.openModal('Перевод между конвертами', `
      <label class="field">Откуда<select class="input" name="fromId" required>${this.envelopeOptions()}</select></label>
      <label class="field">Куда<select class="input" name="toId" required>${this.envelopeOptions()}</select></label>
      <label class="field">Сумма<input class="input" name="amount" type="number" min="0.01" step="0.01" required></label>
      <label class="field">Комментарий<input class="input" name="comment"></label>
    `, (data) => {
      const result = this.app.transfer(data.fromId, data.toId, data.amount, data.comment);
      if (result.success) {
        this.closeModal();
        this.toast('Перевод выполнен', 'success');
        this.refresh();
      } else {
        this.toast(result.message || 'Ошибка', 'error');
      }
    });
  }

  /**
   * История операций конверта.
   * @param {string} id
   */
  openEnvelopeHistory(id) {
    const category = budgetService.getCategoryById(id);
    const txs = budgetService.getCategoryTransactions(id);
    const currency = this.currency();

    this.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal glass wide">
          <div class="modal-head">
            <h3>История: ${escapeHtml(category?.name || '')}</h3>
            <button class="icon-btn" id="modal-close">✕</button>
          </div>
          <div class="modal-body">
            <div class="list">
              ${txs.length ? txs.map((tx) => `
                <div class="list-row">
                  <div>
                    <strong>${escapeHtml(tx.type)}</strong>
                    <p class="muted">${formatDate(tx.date)} · ${escapeHtml(tx.comment || '')}</p>
                  </div>
                  <strong class="${tx.amount < 0 ? 'danger' : 'success'}">${formatMoney(tx.amount, currency)}</strong>
                </div>
              `).join('') : '<p class="empty">Операций пока нет</p>'}
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-primary" id="modal-cancel">Закрыть</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.modalRoot.querySelector('#modal-close')?.addEventListener('click', () => this.closeModal());
    this.modalRoot.querySelector('#modal-cancel')?.addEventListener('click', () => this.closeModal());
  }

  /**
   * Модалка покупки.
   */
  openExpenseModal() {
    const categories = expensesService.getCategories();
    this.openModal('Новая покупка', `
      <label class="field">Название<input class="input" name="name" required placeholder="Продукты в магазине"></label>
      <label class="field">Категория
        <select class="input" name="categoryId" required>
          ${categories.map((c) => `<option value="${c.id}">${c.icon} ${escapeHtml(c.name)}</option>`).join('')}
        </select>
      </label>
      <label class="field">Конверт<select class="input" name="envelopeId" required>${this.envelopeOptions('cat_life')}</select></label>
      <label class="field">Сумма<input class="input" name="amount" type="number" min="0.01" step="0.01" required></label>
      <label class="field">Дата<input class="input" name="date" type="date" required value="${todayISO()}"></label>
      <label class="field">Комментарий<textarea class="input" name="comment" rows="2"></textarea></label>
    `, (data) => {
      const result = this.app.addExpense(data);
      if (result.success) {
        this.closeModal();
        this.toast('Покупка сохранена', 'success');
        this.refresh();
      } else {
        this.toast(result.message || 'Ошибка', 'error');
      }
    });
  }

  /**
   * Модалка кредита.
   * @param {string} [id]
   */
  openCreditModal(id) {
    const item = id ? creditsService.getById(id) : null;
    this.openModal(item ? 'Изменить кредит' : 'Новый кредит', `
      <div class="form-grid">
        <label class="field">Название<input class="input" name="name" required value="${escapeHtml(item?.name || '')}"></label>
        <label class="field">Банк<input class="input" name="bank" value="${escapeHtml(item?.bank || '')}"></label>
        <label class="field">Первоначальная сумма<input class="input" name="initialAmount" type="number" min="0.01" step="0.01" required value="${item?.initialAmount || ''}"></label>
        <label class="field">Остаток долга<input class="input" name="remainingAmount" type="number" min="0" step="0.01" required value="${item?.remainingAmount || ''}"></label>
        <label class="field">Ежемесячный платёж<input class="input" name="monthlyPayment" type="number" min="0.01" step="0.01" required value="${item?.monthlyPayment || ''}"></label>
        <label class="field">Ставка %<input class="input" name="interestRate" type="number" min="0" step="0.01" value="${item?.interestRate || 0}"></label>
        <label class="field">День платежа<input class="input" name="paymentDay" type="number" min="1" max="31" required value="${item?.paymentDay || 15}"></label>
        <label class="field">Месяцев<input class="input" name="months" type="number" min="0" value="${item?.months || ''}"></label>
        <label class="field">Дата начала<input class="input" name="startDate" type="date" required value="${item?.startDate || todayISO()}"></label>
        <label class="field">Дата окончания<input class="input" name="endDate" type="date" value="${item?.endDate || ''}"></label>
      </div>
      <label class="field">Комментарий<textarea class="input" name="comment" rows="2">${escapeHtml(item?.comment || '')}</textarea></label>
    `, (data) => {
      const result = item ? this.app.updateCredit(id, data) : this.app.addCredit(data);
      if (result.success) {
        this.closeModal();
        this.toast(item ? 'Кредит обновлён' : 'Кредит добавлен', 'success');
        this.refresh();
      } else {
        this.toast(result.message || 'Ошибка', 'error');
      }
    });
  }

  /**
   * Модалка платежа по кредиту.
   * @param {string} id
   */
  openCreditPayModal(id) {
    const credit = creditsService.getById(id);
    if (!credit) return;

    this.openModal('Платёж по кредиту', `
      <p class="muted">${escapeHtml(credit.name)} · остаток ${formatMoney(credit.remainingAmount, this.currency())}</p>
      <label class="field">Сумма<input class="input" name="amount" type="number" min="0.01" step="0.01" required value="${credit.monthlyPayment}"></label>
      <label class="field">Списать с конверта<select class="input" name="envelopeId"><option value="">Без списания</option>${this.envelopeOptions('cat_debts')}</select></label>
      <label class="field">Дата<input class="input" name="date" type="date" required value="${todayISO()}"></label>
      <label class="field">Комментарий<input class="input" name="comment"></label>
    `, (data) => {
      const result = this.app.payCredit(id, data);
      if (result.success) {
        this.closeModal();
        this.toast('Платёж учтён', 'success');
        this.refresh();
      } else {
        this.toast(result.message || 'Ошибка', 'error');
      }
    });
  }

  /**
   * История платежей кредита.
   * @param {string} id
   */
  openCreditHistory(id) {
    const credit = creditsService.getById(id);
    const payments = creditsService.getPaymentsForCredit(id);
    const currency = this.currency();

    this.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal glass">
          <div class="modal-head">
            <h3>Платежи: ${escapeHtml(credit?.name || '')}</h3>
            <button class="icon-btn" id="modal-close">✕</button>
          </div>
          <div class="modal-body">
            <div class="list">
              ${payments.length ? payments.map((p) => `
                <div class="list-row">
                  <div>
                    <strong>${formatMoney(p.amount, currency)}</strong>
                    <p class="muted">${formatDate(p.date)} ${escapeHtml(p.comment || '')}</p>
                  </div>
                </div>
              `).join('') : '<p class="empty">Платежей пока нет</p>'}
            </div>
            <div class="modal-actions"><button class="btn btn-primary" id="modal-cancel">Закрыть</button></div>
          </div>
        </div>
      </div>
    `;

    this.modalRoot.querySelector('#modal-close')?.addEventListener('click', () => this.closeModal());
    this.modalRoot.querySelector('#modal-cancel')?.addEventListener('click', () => this.closeModal());
  }

  /**
   * Редактирование коммунальной записи.
   * @param {string} id
   */
  openUtilityModal(id) {
    const item = utilitiesService.getById(id);
    if (!item) return;

    this.openModal('Коммунальная услуга', `
      <p class="muted">${escapeHtml(item.name)} · ${item.monthKey}</p>
      <label class="field">Сумма<input class="input" name="amount" type="number" min="0" step="0.01" required value="${item.amount}"></label>
      <label class="field">Дата оплаты (срок)<input class="input" name="dueDate" type="date" required value="${item.dueDate}"></label>
      <label class="field">Квитанция<input class="input" name="receipt" value="${escapeHtml(item.receipt || '')}" placeholder="Номер / ссылка"></label>
      <label class="field">Комментарий<textarea class="input" name="comment" rows="2">${escapeHtml(item.comment || '')}</textarea></label>
    `, (data) => {
      const result = this.app.updateUtility(id, data);
      if (result.success) {
        this.closeModal();
        this.toast('Запись обновлена', 'success');
        this.refresh();
      } else {
        this.toast(result.message || 'Ошибка', 'error');
      }
    });
  }

  /**
   * Оплата коммунальной услуги.
   * @param {string} id
   */
  openUtilityPayModal(id) {
    const item = utilitiesService.getById(id);
    if (!item) return;

    this.openModal('Оплата услуги', `
      <p class="muted">${escapeHtml(item.name)}</p>
      <label class="field">Сумма<input class="input" name="amount" type="number" min="0.01" step="0.01" required value="${item.amount || ''}"></label>
      <label class="field">Конверт<select class="input" name="envelopeId"><option value="">Без списания</option>${this.envelopeOptions('cat_home')}</select></label>
      <label class="field">Дата оплаты<input class="input" name="paidAt" type="date" required value="${todayISO()}"></label>
      <label class="field">Квитанция<input class="input" name="receipt" value="${escapeHtml(item.receipt || '')}"></label>
      <label class="field">Комментарий<input class="input" name="comment" value="${escapeHtml(item.comment || '')}"></label>
    `, (data) => {
      const result = this.app.payUtility(id, data);
      if (result.success) {
        this.closeModal();
        this.toast('Оплата сохранена', 'success');
        this.refresh();
      } else {
        this.toast(result.message || 'Ошибка', 'error');
      }
    });
  }

  /**
   * Модалка цели.
   * @param {string} [id]
   */
  openGoalModal(id) {
    const item = id ? goalsService.getById(id) : null;
    this.openModal(item ? 'Изменить цель' : 'Новая цель', `
      <label class="field">Название<input class="input" name="name" required value="${escapeHtml(item?.name || '')}" placeholder="Отпуск"></label>
      <label class="field">Иконка<input class="input" name="icon" value="${escapeHtml(item?.icon || '🎯')}" maxlength="4"></label>
      <label class="field">Целевая сумма<input class="input" name="targetAmount" type="number" min="0.01" step="0.01" required value="${item?.targetAmount || ''}"></label>
      <label class="field">Срок<input class="input" name="deadline" type="date" value="${item?.deadline || ''}"></label>
      <label class="field">Комментарий<textarea class="input" name="comment" rows="2">${escapeHtml(item?.comment || '')}</textarea></label>
    `, (data) => {
      const result = item ? this.app.updateGoal(id, data) : this.app.addGoal(data);
      if (result.success) {
        this.closeModal();
        this.toast(item ? 'Цель обновлена' : 'Цель создана', 'success');
        this.refresh();
      } else {
        this.toast(result.message || 'Ошибка', 'error');
      }
    });
  }

  /**
   * Пополнение цели.
   * @param {string} id
   */
  openGoalFundModal(id) {
    const goal = goalsService.getById(id);
    if (!goal) return;

    this.openModal('Пополнить цель', `
      <p class="muted">${escapeHtml(goal.name)} · осталось ${formatMoney(Math.max(0, goal.targetAmount - goal.savedAmount), this.currency())}</p>
      <label class="field">Сумма<input class="input" name="amount" type="number" min="0.01" step="0.01" required></label>
      <label class="field">Из конверта<select class="input" name="envelopeId" required>${this.envelopeOptions('cat_savings')}</select></label>
      <label class="field">Дата<input class="input" name="date" type="date" required value="${todayISO()}"></label>
      <label class="field">Комментарий<input class="input" name="comment"></label>
    `, (data) => {
      const result = this.app.fundGoal(id, data);
      if (result.success) {
        this.closeModal();
        this.toast('Цель пополнена', 'success');
        this.refresh();
      } else {
        this.toast(result.message || 'Ошибка', 'error');
      }
    });
  }

  /**
   * Модалка уведомлений.
   */
  openNotificationsModal() {
    const items = notificationsService.getAll().slice(0, 20);

    this.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal glass">
          <div class="modal-head">
            <h3>Уведомления</h3>
            <button class="icon-btn" id="modal-close">✕</button>
          </div>
          <div class="modal-body">
            <div class="btn-row" style="margin-bottom:12px">
              <button class="btn btn-sm btn-ghost" id="mark-all-read">Прочитать все</button>
            </div>
            <div class="list">
              ${items.length ? items.map((n) => `
                <div class="list-row ${n.read ? '' : 'unread'}">
                  <div>
                    <strong>${escapeHtml(n.title)}</strong>
                    <p class="muted">${escapeHtml(n.message)}</p>
                    <span class="muted">${formatDateTime(n.timestamp)}</span>
                  </div>
                </div>
              `).join('') : '<p class="empty">Уведомлений нет</p>'}
            </div>
            <div class="modal-actions"><button class="btn btn-primary" id="modal-cancel">Закрыть</button></div>
          </div>
        </div>
      </div>
    `;

    this.modalRoot.querySelector('#modal-close')?.addEventListener('click', () => this.closeModal());
    this.modalRoot.querySelector('#modal-cancel')?.addEventListener('click', () => this.closeModal());
    this.modalRoot.querySelector('#mark-all-read')?.addEventListener('click', () => {
      notificationsService.markAllRead();
      this.updateNotificationBadge();
      this.openNotificationsModal();
    });
  }
}

export default UI;
