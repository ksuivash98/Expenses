/**
 * ui.js — оболочка интерфейса, модалки, тосты, рендер разделов
 */
import {
  escapeHtml, formatDate, formatDateTime, formatMoney, PERIOD_STATUS_LABELS
} from './utils.js';
import { drawBars, drawDonut, legendHtml } from './charts.js';

const NAV = [
  { id: 'dashboard', icon: '🏠', title: 'Главная' },
  { id: 'income', icon: '💰', title: 'Доходы' },
  { id: 'budget', icon: '📦', title: 'Бюджет' },
  { id: 'expenses', icon: '🛒', title: 'Расходы' },
  { id: 'credits', icon: '💳', title: 'Кредиты' },
  { id: 'utilities', icon: '🏠', title: 'КУслуги' },
  { id: 'goals', icon: '🎯', title: 'Цели' },
  { id: 'calendar', icon: '📅', title: 'Календарь' },
  { id: 'analytics', icon: '📊', title: 'Аналитика' },
  { id: 'history', icon: '📜', title: 'История' },
  { id: 'archive', icon: '🗄', title: 'Архив' },
  { id: 'settings', icon: '⚙️', title: 'Настройки' }
];

export class UI {
  constructor(root) {
    this.root = root;
    this.page = 'dashboard';
    this.handlers = {};
    this.modalResolve = null;
    this.lastModalFormData = {};
    this._delegated = false;
  }

  on(event, handler) {
    this.handlers[event] = handler;
  }

  emit(event, payload) {
    const fn = this.handlers[event];
    return fn ? fn(payload) : undefined;
  }

  isModalOpen() {
    return Boolean(this.modalRoot?.classList.contains('is-open'));
  }

  mount() {
    this.root.innerHTML = `
      <div class="app-bg" aria-hidden="true"></div>
      <div class="app-shell">
        <aside class="sidebar glass" id="sidebar">
          <div class="brand">
            <div class="brand-mark">₽</div>
            <div>
              <strong>Финансовый кабинет</strong>
              <span>локальное хранилище</span>
            </div>
          </div>
          <nav class="nav" id="nav"></nav>
          <div class="sidebar-footer">
            <div class="mini-stat"><span>Свободно</span><strong id="side-free">—</strong></div>
            <div class="mini-stat"><span>Накопления</span><strong id="side-savings">—</strong></div>
          </div>
        </aside>
        <div class="sidebar-overlay" id="sidebar-overlay"></div>
        <main class="main">
          <header class="topbar glass">
            <div class="topbar-left">
              <button class="icon-btn" id="menu-toggle" type="button" aria-label="Меню">☰</button>
              <div>
                <h1 id="page-title">Главная</h1>
                <div class="period-switcher" id="period-switcher"></div>
              </div>
            </div>
            <div class="topbar-actions">
              <button class="icon-btn" id="btn-notifications" type="button" title="Уведомления">
                🔔<span class="badge-dot" id="notif-badge" hidden>0</span>
              </button>
              <button class="btn btn-ghost btn-sm" id="btn-close-month" type="button">Закрыть месяц</button>
            </div>
          </header>
          <div class="content fade-in" id="content"></div>
        </main>
      </div>
      <div class="modal-backdrop" id="modal-root" hidden></div>
      <div class="toast-root" id="toast-root"></div>
    `;

    this.navEl = this.root.querySelector('#nav');
    this.contentEl = this.root.querySelector('#content');
    this.periodEl = this.root.querySelector('#period-switcher');
    this.modalRoot = this.root.querySelector('#modal-root');
    this.toastRoot = this.root.querySelector('#toast-root');

    this.navEl.innerHTML = NAV.map((item) => `
      <button class="nav-item" data-page="${item.id}" type="button">
        <span>${item.icon}</span>${item.title}
      </button>
    `).join('');

    this.bindGlobalEvents();
  }

  bindGlobalEvents() {
    if (this._delegated) return;
    this._delegated = true;

    this.root.addEventListener('click', (e) => {
      const menuToggle = e.target.closest('#menu-toggle');
      if (menuToggle) {
        this.root.querySelector('#sidebar')?.classList.toggle('open');
        this.root.querySelector('#sidebar-overlay')?.classList.toggle('visible');
        return;
      }

      const overlay = e.target.closest('#sidebar-overlay');
      if (overlay) {
        this.root.querySelector('#sidebar')?.classList.remove('open');
        overlay.classList.remove('visible');
        return;
      }

      if (e.target.closest('#btn-notifications')) {
        this.emit('notifications');
        return;
      }

      if (e.target.closest('#btn-close-month')) {
        this.emit('close-month');
        return;
      }

      if (e.target.closest('#btn-open-period')) {
        this.emit('open-period');
        return;
      }

      const pageBtn = e.target.closest('[data-page]');
      if (pageBtn && this.navEl?.contains(pageBtn)) {
        this.emit('navigate', pageBtn.dataset.page);
        return;
      }

      // Модалка: кнопки действий и фон
      if (this.isModalOpen() && this.modalRoot.contains(e.target)) {
        if (e.target === this.modalRoot) {
          this.closeModal(null);
          return;
        }
        const notifBtn = e.target.closest('[data-notif]');
        if (notifBtn) {
          e.preventDefault();
          this.emit('notif-read', notifBtn.dataset.notif);
          notifBtn.closest('.list-item')?.classList.remove('unread');
          return;
        }
        const modalBtn = e.target.closest('[data-action]');
        if (modalBtn) {
          e.preventDefault();
          this.closeModal(modalBtn.dataset.action);
          return;
        }
        return;
      }

      // Кнопки контента
      const actionEl = e.target.closest('[data-action]');
      if (actionEl && this.contentEl?.contains(actionEl)) {
        e.preventDefault();
        this.emit('action', {
          action: actionEl.dataset.action,
          id: actionEl.dataset.id,
          el: actionEl,
          event: e
        });
      }
    });

    this.root.addEventListener('change', (e) => {
      if (e.target?.id === 'period-select') {
        this.emit('switch-period', e.target.value);
        return;
      }
      if (e.target?.id === 'credits-sort-by') {
        this.emit('credits-sort-by', e.target.value);
        return;
      }
      if (e.target?.id === 'setting-theme') {
        this.emit('settings-theme', e.target.value);
        return;
      }
      if (e.target?.id === 'setting-currency') {
        this.emit('settings-currency', e.target.value);
      }
    });
  }

  setActivePage(page) {
    this.page = page;
    this.navEl.querySelectorAll('.nav-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.page === page);
    });
    const title = NAV.find((n) => n.id === page)?.title || 'Раздел';
    this.root.querySelector('#page-title').textContent = title;
    this.root.querySelector('#sidebar')?.classList.remove('open');
    this.root.querySelector('#sidebar-overlay')?.classList.remove('visible');
  }

  updateSidebarStats({ freeMoney, savings, currency }) {
    const freeEl = this.root.querySelector('#side-free');
    const saveEl = this.root.querySelector('#side-savings');
    if (freeEl) freeEl.textContent = formatMoney(freeMoney, currency);
    if (saveEl) saveEl.textContent = formatMoney(savings, currency);
  }

  updateNotificationBadge(count) {
    const badge = this.root.querySelector('#notif-badge');
    if (!badge) return;
    if (count > 0) {
      badge.hidden = false;
      badge.textContent = String(count);
    } else {
      badge.hidden = true;
    }
  }

  renderPeriodSwitcher(periods, currentId) {
    if (!this.periodEl) return;
    const options = periods.map((p) => {
      const label = `${PERIOD_STATUS_LABELS[p.status] || p.status}: ${p.title || ''}`;
      return `<option value="${p.id}" ${p.id === currentId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
    this.periodEl.innerHTML = `
      <select id="period-select" class="period-select" aria-label="Период">${options}</select>
      <button class="btn btn-ghost btn-sm" id="btn-open-period" type="button">Открыть период</button>
    `;
  }

  toast(message, type = 'info') {
    if (!this.toastRoot) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type} show`;
    el.textContent = message;
    this.toastRoot.appendChild(el);
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 250);
    }, 2800);
  }

  async confirm(message, { danger = false, title = 'Подтверждение' } = {}) {
    const id = await this.modal({
      title,
      body: `<p>${escapeHtml(message)}</p>`,
      actions: [
        { id: 'cancel', label: 'Отмена', className: 'btn-ghost' },
        { id: 'ok', label: 'Подтвердить', className: danger ? 'btn-danger' : 'btn-primary' }
      ]
    });
    return id === 'ok';
  }

  modal({ title, body, actions = [], wide = false }) {
    return new Promise((resolve) => {
      // Если уже открыта другая модалка — закрываем её
      if (this.modalResolve) {
        const prev = this.modalResolve;
        this.modalResolve = null;
        prev(null);
      }

      this.modalResolve = resolve;
      this.lastModalFormData = {};
      this.modalRoot.innerHTML = `
        <div class="modal glass ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
          <div class="modal-head">
            <h3>${escapeHtml(title)}</h3>
            <button class="icon-btn" data-action="cancel" type="button" aria-label="Закрыть">✕</button>
          </div>
          <div class="modal-body">${body}</div>
          <div class="modal-actions">
            ${actions.map((a) => `
              <button class="btn ${a.className || 'btn-ghost'}" data-action="${a.id}" type="button">${escapeHtml(a.label)}</button>
            `).join('')}
          </div>
        </div>
      `;
      this.modalRoot.hidden = false;
      this.modalRoot.classList.add('is-open');
    });
  }

  closeModal(result) {
    if (!this.modalRoot) return;
    const form = this.modalRoot.querySelector('form');
    this.lastModalFormData = form
      ? Object.fromEntries(new FormData(form).entries())
      : {};
    this.modalRoot.classList.remove('is-open');
    this.modalRoot.hidden = true;
    this.modalRoot.innerHTML = '';
    const resolve = this.modalResolve;
    this.modalResolve = null;
    if (resolve) resolve(result);
  }

  getModalFormData() {
    return { ...(this.lastModalFormData || {}) };
  }

  render(html) {
    if (!this.contentEl) return;
    this.contentEl.innerHTML = html;
    this.contentEl.classList.remove('fade-in');
    void this.contentEl.offsetWidth;
    this.contentEl.classList.add('fade-in');
  }

  money(amount, currency = 'RUB') {
    return formatMoney(amount, currency);
  }

  empty(text) {
    return `<div class="empty-state glass-soft"><p>${escapeHtml(text)}</p></div>`;
  }

  stats(cards) {
    return `<div class="stats-grid">${cards.map((c) => `
      <article class="stat-card glass tone-${c.tone || 'blue'}">
        <div class="stat-icon">${c.icon || '•'}</div>
        <div>
          <p class="stat-label">${escapeHtml(c.label)}</p>
          <p class="stat-value" data-raw-value="0">${escapeHtml(c.value)}</p>
        </div>
      </article>
    `).join('')}</div>`;
  }

  toolbar(title, subtitle, buttons = []) {
    return `
      <div class="toolbar">
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p class="muted">${escapeHtml(subtitle || '')}</p>
        </div>
        <div class="btn-row wrap">${buttons.join('')}</div>
      </div>
    `;
  }

  list(items) {
    if (!items.length) return this.empty('Пока пусто');
    return `<div class="list">${items.join('')}</div>`;
  }

  renderDashboard(data, currency) {
    const { income, budget, expenses, credits, utilities, goals, period } = data;
    this.render(`
      <section class="hero-panel glass">
        <div>
          <div class="eyebrow">Текущий период</div>
          <h2>${escapeHtml(period ? `${PERIOD_STATUS_LABELS[period.status] || ''} · ${period.year}-${String(period.month).padStart(2, '0')}` : '—')}</h2>
          <p class="muted">Доходы, конверты и платежи за выбранный месяц</p>
        </div>
        <div class="hero-actions">
          <button class="btn btn-primary" data-action="add-income" type="button">+ Доход</button>
          <button class="btn btn-ghost" data-action="distribute" type="button">Распределить</button>
          <button class="btn btn-ghost" data-action="add-expense" type="button">Покупка</button>
        </div>
      </section>
      ${this.stats([
        { icon: '💰', label: 'Доходы', value: formatMoney(income.totalIncome, currency), tone: 'green' },
        { icon: '🆓', label: 'Свободные деньги', value: formatMoney(income.freeMoney, currency), tone: 'cyan' },
        { icon: '📦', label: 'В конвертах', value: formatMoney(budget.totalBalance, currency), tone: 'blue' },
        { icon: '🛒', label: 'Расходы', value: formatMoney(expenses.total, currency), tone: 'orange' },
        { icon: '💳', label: 'Долги', value: formatMoney(credits.totalDebt, currency), tone: 'red' },
        { icon: '🏦', label: 'Накопления', value: formatMoney(budget.savings, currency), tone: 'mint' }
      ])}
      <div class="two-col">
        <section class="panel glass">
          <div class="panel-head"><h3>Конверты</h3></div>
          <div class="envelope-grid">
            ${budget.envelopes.map((e) => `
              <article class="envelope-card" style="--env:${e.color}">
                <div class="envelope-top"><span>${e.icon}</span><strong>${escapeHtml(e.name)}</strong></div>
                <div class="envelope-balance">${formatMoney(e.balance, currency)}</div>
                <div class="muted">получено ${formatMoney(e.received, currency)} · потрачено ${formatMoney(e.spent, currency)}</div>
              </article>
            `).join('') || this.empty('Нет конвертов')}
          </div>
        </section>
        <section class="panel glass">
          <div class="panel-head"><h3>Структура расходов</h3></div>
          <canvas id="chart-expenses" width="220" height="220"></canvas>
          <div class="legend" id="legend-expenses"></div>
          <div class="panel-head" style="margin-top:16px"><h3>Цели</h3></div>
          ${goals.items.slice(0, 3).map((g) => `
            <div class="progress-row">
              <div class="progress-meta"><span>${g.icon} ${escapeHtml(g.title)}</span><span>${g.progress}%</span></div>
              <div class="progress-bar"><i style="width:${g.progress}%"></i></div>
            </div>
          `).join('') || this.empty('Целей пока нет')}
          <p class="muted" style="margin-top:12px">КУслуги к оплате: ${formatMoney(utilities.pending, currency)}</p>
        </section>
      </div>
    `);
    const expenseItems = expenses.structure.map((s, i) => ({
      name: s.category,
      amount: s.amount,
      color: `hsl(${(i * 47) % 360} 70% 55%)`
    }));
    drawDonut(this.contentEl.querySelector('#chart-expenses'), expenseItems, { centerLabel: 'Расходы' });
    const legend = this.contentEl.querySelector('#legend-expenses');
    if (legend) legend.innerHTML = legendHtml(expenseItems);
  }

  renderIncome(list, summary, currency) {
    this.render(`
      ${this.toolbar('Доходы', `Всего ${formatMoney(summary.totalIncome, currency)} · свободно ${formatMoney(summary.freeMoney, currency)}`, [
        '<button class="btn btn-primary" data-action="add-income" type="button">+ Доход</button>',
        '<button class="btn btn-ghost" data-action="distribute" type="button">Распределить</button>'
      ])}
      ${this.stats([
        { icon: '💰', label: 'Всего доходов', value: formatMoney(summary.totalIncome, currency), tone: 'green' },
        { icon: '📦', label: 'Распределено', value: formatMoney(summary.totalDistributed, currency), tone: 'blue' },
        { icon: '🆓', label: 'Свободно', value: formatMoney(summary.freeMoney, currency), tone: 'cyan' }
      ])}
      ${this.list(list.map((item) => `
        <article class="list-item glass-soft">
          <div class="list-main">
            <strong>${escapeHtml(item.title)}</strong>
            <span class="muted">${escapeHtml(item.source)} · ${formatDate(item.date)}</span>
          </div>
          <div class="list-side">
            <strong>${formatMoney(item.amount, currency)}</strong>
            <div class="btn-row">
              <button class="btn btn-ghost btn-sm" data-action="edit-income" data-id="${item.id}" type="button">Изменить</button>
              <button class="btn btn-danger btn-sm" data-action="delete-income" data-id="${item.id}" type="button">Удалить</button>
            </div>
          </div>
        </article>
      `))}
    `);
  }

  renderBudget(summary, currency) {
    this.render(`
      ${this.toolbar('Бюджет', `Прогресс распределения ${summary.distributionProgress}%`, [
        '<button class="btn btn-primary" data-action="distribute" type="button">Распределить</button>',
        '<button class="btn btn-ghost" data-action="transfer" type="button">Перевод</button>',
        '<button class="btn btn-ghost" data-action="add-category" type="button">+ Конверт</button>'
      ])}
      ${this.stats([
        { icon: '🆓', label: 'Свободно', value: formatMoney(summary.freeMoney, currency), tone: 'cyan' },
        { icon: '📦', label: 'В конвертах', value: formatMoney(summary.totalBalance, currency), tone: 'blue' },
        { icon: '🏦', label: 'Накопления', value: formatMoney(summary.savings, currency), tone: 'mint' }
      ])}
      <div class="envelope-grid">
        ${summary.envelopes.map((e) => `
          <article class="envelope-card glass" style="--env:${e.color}">
            <div class="envelope-top">
              <span>${e.icon}</span>
              <strong>${escapeHtml(e.name)}</strong>
            </div>
            <div class="envelope-balance">${formatMoney(e.balance, currency)}</div>
            <p class="muted">${escapeHtml(e.carryLabel)}</p>
            <div class="btn-row wrap">
              <button class="btn btn-ghost btn-sm" data-action="edit-category" data-id="${e.id}" type="button">Правило</button>
              <button class="btn btn-danger btn-sm" data-action="delete-category" data-id="${e.id}" type="button">Удалить</button>
            </div>
          </article>
        `).join('')}
      </div>
    `);
  }

  renderExpenses(list, summary, currency) {
    this.render(`
      ${this.toolbar('Расходы', `Потрачено ${formatMoney(summary.total, currency)}`, [
        '<button class="btn btn-primary" data-action="add-expense" type="button">+ Покупка</button>'
      ])}
      ${this.list(list.map((item) => `
        <article class="list-item glass-soft">
          <div class="list-main">
            <strong>${escapeHtml(item.title)}</strong>
            <span class="muted">${escapeHtml(item.category)}${item.shop ? ` · ${escapeHtml(item.shop)}` : ''} · ${formatDate(item.date)}</span>
          </div>
          <div class="list-side">
            <strong>${formatMoney(item.amount, currency)}</strong>
            <button class="btn btn-danger btn-sm" data-action="delete-expense" data-id="${item.id}" type="button">Удалить</button>
          </div>
        </article>
      `))}
    `);
  }

  renderCredits(summary, currency) {
    const items = summary.items || [];
    const fmt = (v) => formatMoney(Number.isFinite(Number(v)) ? Number(v) : 0, currency);
    const dash = (v) => (v == null || v === '' ? '—' : v);
    const monthsLabel = (m) => (m == null ? '—' : `${m} мес.`);
    const sortBy = summary.sortBy || 'payment_date';
    const sortDir = summary.sortDir === 'desc' ? 'desc' : 'asc';
    const sortOptions = summary.sortOptions || [];

    this.render(`
      ${this.toolbar('Кредиты', 'Аналитика по всем кредитам', [
        '<button class="btn btn-primary" data-action="add-credit" type="button">+ Кредит</button>'
      ])}
      <div class="filters credits-sort-bar glass-soft">
        <label>Сортировать по
          <select id="credits-sort-by" class="input">
            ${sortOptions.map((o) => `
              <option value="${escapeHtml(o.value)}" ${o.value === sortBy ? 'selected' : ''}>${escapeHtml(o.label)}</option>
            `).join('')}
          </select>
        </label>
        <div class="btn-row wrap">
          <button class="btn btn-sm ${sortDir === 'asc' ? 'btn-primary' : 'btn-ghost'}" data-action="credits-sort-dir" data-dir="asc" type="button">↑ По возрастанию</button>
          <button class="btn btn-sm ${sortDir === 'desc' ? 'btn-primary' : 'btn-ghost'}" data-action="credits-sort-dir" data-dir="desc" type="button">↓ По убыванию</button>
        </div>
      </div>
      ${this.stats([
        { icon: '🏦', label: 'Кредитов (активных)', value: String(summary.count || 0), tone: 'blue' },
        { icon: '💳', label: 'Общий остаток', value: fmt(summary.totalDebt), tone: 'red' },
        { icon: '💵', label: 'Платежи в месяц', value: fmt(summary.monthly), tone: 'orange' },
        { icon: '💰', label: 'Первоначальная сумма', value: fmt(summary.totalInitial), tone: 'purple' },
        { icon: '💸', label: 'Уже выплачено', value: fmt(summary.totalPaid), tone: 'green' },
        { icon: '💲', label: 'Переплата', value: fmt(summary.totalOverpayment), tone: 'yellow' },
        { icon: '📊', label: 'Средний прогресс', value: `${summary.avgProgress || 0}%`, tone: 'cyan' },
        {
          icon: '📆',
          label: 'Ближайший платёж',
          value: summary.nearestPayment
            ? `${formatDate(summary.nearestPayment)}${summary.nearestAmount ? ` · ${fmt(summary.nearestAmount)}` : ''}`
            : '—',
          tone: 'mint'
        }
      ])}
      ${summary.nearestTitle ? `<p class="muted" style="margin:-8px 0 16px">Ближайший: ${escapeHtml(summary.nearestTitle)}</p>` : ''}

      <div class="envelope-grid credits-cards">
        ${items.map((item) => `
          <article class="envelope-card glass credit-card">
            <div class="envelope-top">
              <span>🏦</span>
              <div>
                <strong>${escapeHtml(item.title)}</strong>
                <div class="muted">${escapeHtml(item.bank)} · ${escapeHtml(item.statusLabel)}</div>
              </div>
            </div>
            <div class="credit-meta-grid">
              <div><span>💰 Первоначальная</span><strong>${fmt(item.initial_amount)}</strong></div>
              <div><span>💳 Остаток</span><strong>${fmt(item.current_balance)}</strong></div>
              <div><span>💸 Выплачено</span><strong>${fmt(item.paid)}</strong></div>
              <div><span>⏳ Осталось платить</span><strong>${fmt(item.remaining)}</strong></div>
              <div><span>📈 Ставка</span><strong>${item.interest_rate}%</strong></div>
              <div><span>💵 Платёж</span><strong>${fmt(item.monthly_payment)}</strong></div>
              <div><span>📅 День платежа</span><strong>${item.payment_day}-е</strong></div>
              <div><span>📆 Следующий</span><strong>${item.nextPayment ? formatDate(item.nextPayment) : '—'}</strong></div>
              <div><span>⏳ Осталось месяцев</span><strong>${monthsLabel(item.monthsLeft)}</strong></div>
              <div><span>💲 Переплата</span><strong>${fmt(item.overpayment)}</strong></div>
              <div><span>🏁 Закрытие</span><strong>${item.estimatedCloseDate ? formatDate(item.estimatedCloseDate) : '—'}</strong></div>
              <div><span>📊 Погашение</span><strong>${item.progress}%</strong></div>
            </div>
            <div class="progress-row">
              <div class="progress-meta"><span>Прогресс</span><span>${item.progress}%</span></div>
              <div class="progress-bar progress-tone-${item.progressTone}"><i style="width:${item.progress}%"></i></div>
            </div>
            <div class="btn-row wrap">
              ${item.status === 'active' ? `
                <button class="btn btn-primary btn-sm" data-action="pay-credit" data-id="${item.id}" type="button">Оплатить</button>
                <button class="btn btn-ghost btn-sm" data-action="early-pay-credit" data-id="${item.id}" type="button">Досрочно</button>
              ` : ''}
              <button class="btn btn-ghost btn-sm" data-action="edit-credit" data-id="${item.id}" type="button">Изменить</button>
              <button class="btn btn-danger btn-sm" data-action="delete-credit" data-id="${item.id}" type="button">Удалить</button>
            </div>
          </article>
        `).join('') || this.empty('Кредитов пока нет')}
      </div>

      <section class="panel glass" style="margin-top:18px; overflow:auto">
        <div class="panel-head"><h3>Таблица кредитов</h3></div>
        ${items.length ? `
          <table class="credits-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Банк</th>
                <th>Остаток долга</th>
                <th>Ежемесячный платёж</th>
                <th>Процентная ставка</th>
                <th>День платежа</th>
                <th>Осталось месяцев</th>
                <th>Дата окончания</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item) => `
                <tr>
                  <td>${escapeHtml(item.title)}</td>
                  <td>${escapeHtml(item.bank)}</td>
                  <td>${fmt(item.current_balance)}</td>
                  <td>${fmt(item.monthly_payment)}</td>
                  <td>${item.interest_rate}%</td>
                  <td>${item.payment_day}-е</td>
                  <td>${dash(item.monthsLeft)}</td>
                  <td>${item.end_date ? formatDate(item.end_date) : (item.estimatedCloseDate ? formatDate(item.estimatedCloseDate) : '—')}</td>
                  <td>${escapeHtml(item.statusLabel)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : this.empty('Нет данных для таблицы')}
      </section>
    `);
  }

  renderUtilities(list, summary, currency) {
    this.render(`
      ${this.toolbar('Коммунальные услуги', `К оплате ${formatMoney(summary.pending, currency)}`, [
        '<button class="btn btn-primary" data-action="add-utility" type="button">+ Услуга</button>'
      ])}
      ${this.list(list.map((item) => `
        <article class="list-item glass-soft">
          <div class="list-main">
            <strong>${escapeHtml(item.service)}</strong>
            <span class="muted">до ${formatDate(item.due_date)} · ${item.status === 'paid' ? 'оплачено' : 'ожидает'}</span>
          </div>
          <div class="list-side">
            <strong>${formatMoney(item.amount, currency)}</strong>
            <div class="btn-row">
              ${item.status !== 'paid' ? `<button class="btn btn-primary btn-sm" data-action="pay-utility" data-id="${item.id}" type="button">Оплатить</button>` : ''}
              ${item.status !== 'paid' ? `<button class="btn btn-danger btn-sm" data-action="delete-utility" data-id="${item.id}" type="button">Удалить</button>` : ''}
            </div>
          </div>
        </article>
      `))}
    `);
  }

  renderGoals(summary, currency) {
    this.render(`
      ${this.toolbar('Цели', `Накоплено ${formatMoney(summary.totalSaved, currency)} из ${formatMoney(summary.totalTarget, currency)}`, [
        '<button class="btn btn-primary" data-action="add-goal" type="button">+ Цель</button>'
      ])}
      ${this.list(summary.items.map((g) => `
        <article class="list-item glass-soft">
          <div class="list-main">
            <strong>${g.icon} ${escapeHtml(g.title)}</strong>
            <div class="progress-bar"><i style="width:${g.progress}%"></i></div>
            <span class="muted">${formatMoney(g.saved, currency)} / ${formatMoney(g.target, currency)}${g.deadline ? ` · до ${formatDate(g.deadline)}` : ''}</span>
          </div>
          <div class="list-side">
            <div class="btn-row">
              <button class="btn btn-primary btn-sm" data-action="contribute-goal" data-id="${g.id}" type="button">Внести</button>
              <button class="btn btn-danger btn-sm" data-action="delete-goal" data-id="${g.id}" type="button">Удалить</button>
            </div>
          </div>
        </article>
      `))}
    `);
  }

  renderCalendar(view, currency) {
    this.render(`
      ${this.toolbar(view.title, 'Платежи по кредитам, КУслугам и дедлайны целей', [
        '<button class="btn btn-ghost" data-action="cal-prev" type="button">←</button>',
        '<button class="btn btn-ghost" data-action="cal-next" type="button">→</button>'
      ])}
      <div class="calendar-grid glass">
        ${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => `<div class="cal-head">${d}</div>`).join('')}
        ${view.cells.map((cell) => {
          if (!cell) return '<div class="cal-cell empty"></div>';
          const events = view.byDate[cell.date] || [];
          return `<div class="cal-cell">
            <strong>${cell.day}</strong>
            ${events.slice(0, 3).map((ev) => `<div class="cal-event">${ev.icon} ${escapeHtml(ev.title)} · ${formatMoney(ev.amount, currency)}</div>`).join('')}
          </div>`;
        }).join('')}
      </div>
    `);
  }

  renderAnalytics(data, currency) {
    const { expenseStructure, incomeStructure, envelopes, planFact, yearly } = data;
    this.render(`
      ${this.toolbar('Аналитика', 'Структура доходов и расходов, план/факт', [
        '<button class="btn btn-ghost" data-action="edit-plan" type="button">План месяца</button>',
        '<button class="btn btn-ghost" data-action="compare-periods" type="button">Сравнить</button>'
      ])}
      <div class="two-col">
        <section class="panel glass">
          <div class="panel-head"><h3>Расходы</h3></div>
          <canvas id="chart-a-exp"></canvas>
          <div class="legend" id="leg-a-exp"></div>
        </section>
        <section class="panel glass">
          <div class="panel-head"><h3>Доходы</h3></div>
          <canvas id="chart-a-inc"></canvas>
          <div class="legend" id="leg-a-inc"></div>
        </section>
      </div>
      <section class="panel glass" style="margin-bottom:18px">
        <div class="panel-head"><h3>Конверты</h3></div>
        <canvas id="chart-a-env" height="180"></canvas>
      </section>
      ${planFact ? `
        <section class="panel glass" style="margin-bottom:18px">
          <div class="panel-head"><h3>План / факт</h3></div>
          ${['income', 'expense', 'savings', 'credits'].map((key) => {
            const labels = { income: 'Доход', expense: 'Расход', savings: 'Накопления', credits: 'Кредиты' };
            const row = planFact[key];
            return `<div class="progress-row">
              <div class="progress-meta"><span>${labels[key]}</span><span>${formatMoney(row.actual, currency)} / ${formatMoney(row.planned, currency)}</span></div>
              <div class="progress-bar"><i style="width:${row.progress || 0}%"></i></div>
            </div>`;
          }).join('')}
        </section>
      ` : ''}
      <section class="panel glass">
        <div class="panel-head"><h3>Год</h3></div>
        <canvas id="chart-a-year" height="180"></canvas>
      </section>
    `);
    const exp = expenseStructure.map((s, i) => ({ name: s.category, amount: s.amount, color: `hsl(${i * 47} 70% 55%)` }));
    const inc = incomeStructure.map((s, i) => ({ name: s.source, amount: s.amount, color: `hsl(${120 + i * 40} 65% 50%)` }));
    drawDonut(this.contentEl.querySelector('#chart-a-exp'), exp);
    drawDonut(this.contentEl.querySelector('#chart-a-inc'), inc);
    const legExp = this.contentEl.querySelector('#leg-a-exp');
    const legInc = this.contentEl.querySelector('#leg-a-inc');
    if (legExp) legExp.innerHTML = legendHtml(exp);
    if (legInc) legInc.innerHTML = legendHtml(inc);
    drawBars(this.contentEl.querySelector('#chart-a-env'), envelopes.map((e) => ({ label: e.name, amount: e.amount, color: e.color })));
    drawBars(this.contentEl.querySelector('#chart-a-year'), (yearly || []).map((y) => ({ label: y.title, amount: y.expenses, color: '#3d8bfd' })));
  }

  renderHistory(items, currency) {
    this.render(`
      ${this.toolbar('История', 'Все операции текущего периода', [])}
      ${this.list(items.map((item) => `
        <article class="list-item glass-soft">
          <div class="list-main">
            <strong>${item.icon || '•'} ${escapeHtml(item.title)}</strong>
            <span class="muted">${escapeHtml(item.description || '')} · ${formatDateTime(item.date)}</span>
          </div>
          <div class="list-side">
            ${item.amount != null ? `<strong>${formatMoney(item.amount, currency)}</strong>` : ''}
          </div>
        </article>
      `))}
    `);
  }

  renderArchive(items, currency) {
    this.render(`
      ${this.toolbar('Архив периодов', 'Закрытые месяцы и отчёты', [])}
      ${this.list(items.map((item) => `
        <article class="list-item glass-soft">
          <div class="list-main">
            <strong>${escapeHtml(item.title)}</strong>
            <span class="muted">доход ${formatMoney(item.summary.income, currency)} · расход ${formatMoney(item.summary.expenses, currency)} · накопления ${formatMoney(item.summary.savings, currency)}</span>
          </div>
          <div class="list-side">
            <button class="btn btn-ghost btn-sm" data-action="open-archive" data-id="${item.id}" type="button">Открыть</button>
            <button class="btn btn-ghost btn-sm" data-action="unlock-period" data-id="${item.id}" type="button">Разблокировать</button>
          </div>
        </article>
      `))}
    `);
  }

  renderSettings(settings) {
    this.render(`
      ${this.toolbar('Настройки', 'Тема, валюта и резервное копирование', [])}
      <section class="panel glass settings-grid">
        <label>Тема
          <select id="setting-theme">
            <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>Тёмная</option>
            <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>Светлая</option>
          </select>
        </label>
        <label>Валюта
          <select id="setting-currency">
            ${['RUB', 'USD', 'EUR', 'KZT', 'BYN'].map((c) => `
              <option value="${c}" ${settings.currency === c ? 'selected' : ''}>${c}</option>
            `).join('')}
          </select>
        </label>
      </section>
      <section class="panel glass" style="margin-top:14px">
        <div class="panel-head"><h3>Резервное копирование</h3></div>
        <div class="btn-row wrap">
          <button class="btn btn-primary" data-action="export-json" type="button">📤 Экспорт всех данных в JSON</button>
          <button class="btn btn-ghost" data-action="import-json" type="button">📥 Импорт данных из JSON</button>
          <button class="btn btn-ghost" data-action="download-backup" type="button">📄 Скачать резервную копию</button>
          <button class="btn btn-ghost" data-action="restore-backup" type="button">📂 Восстановить из резервной копии</button>
          <button class="btn btn-danger" data-action="clear-all" type="button">🗑 Очистить все данные</button>
        </div>
        <input type="file" id="import-file" accept="application/json,.json" hidden />
        <p class="muted" style="margin-top:12px">Все данные хранятся только в LocalStorage этого браузера. Перед очисткой потребуется подтверждение.</p>
      </section>
    `);
  }

  renderNotifications(items) {
    return this.modal({
      title: 'Уведомления',
      wide: true,
      body: items.length ? `<div class="list">${items.map((n) => `
        <article class="list-item glass-soft ${n.is_read ? '' : 'unread'}">
          <div class="list-main">
            <strong>${escapeHtml(n.title)}</strong>
            <span class="muted">${escapeHtml(n.text)} · ${formatDateTime(n.created_at)}</span>
          </div>
          <button class="btn btn-ghost btn-sm" data-notif="${n.id}" type="button">Прочитано</button>
        </article>
      `).join('')}</div>` : '<p class="muted">Нет уведомлений</p>',
      actions: [
        { id: 'read-all', label: 'Прочитать все', className: 'btn-ghost' },
        { id: 'close', label: 'Закрыть', className: 'btn-primary' }
      ]
    });
  }

  formFields(fields) {
    return `<form class="form-grid">${fields.map((f) => {
      if (f.type === 'select') {
        return `<label>${escapeHtml(f.label)}
          <select name="${f.name}" ${f.required ? 'required' : ''}>
            ${(f.options || []).map((o) => {
              const value = typeof o === 'object' ? o.value : o;
              const label = typeof o === 'object' ? o.label : o;
              return `<option value="${escapeHtml(value)}" ${String(f.value) === String(value) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
            }).join('')}
          </select>
        </label>`;
      }
      if (f.type === 'textarea') {
        return `<label class="full">${escapeHtml(f.label)}
          <textarea name="${f.name}" rows="3">${escapeHtml(f.value || '')}</textarea>
        </label>`;
      }
      return `<label>${escapeHtml(f.label)}
        <input type="${f.type || 'text'}" name="${f.name}" value="${escapeHtml(f.value ?? '')}" ${f.required ? 'required' : ''} ${f.step ? `step="${f.step}"` : ''} ${f.min != null ? `min="${f.min}"` : ''} />
      </label>`;
    }).join('')}</form>`;
  }
}

export default UI;
