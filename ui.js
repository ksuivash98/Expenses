/**
 * ui.js — оболочка интерфейса, модалки, тосты, рендер разделов
 */
import {
  escapeHtml, formatDate, formatDateTime, formatMoney, getMonthName, PERIOD_STATUS_LABELS
} from './utils.js';
import { drawBars, drawDonut, drawLine, legendHtml } from './charts.js';
// silk / warpText подключаются лениво — сбой WebGL не должен ронять весь UI

function formatDayMonth(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const day = String(date.getDate()).padStart(2, '0');
  return `${day} ${getMonthName(date.getMonth(), true)}`;
}

const NAV = [
  { id: 'dashboard', icon: '🏠', title: 'Главная' },
  { id: 'income', icon: '💰', title: 'Доходы' },
  { id: 'budget', icon: '📦', title: 'Бюджет' },
  { id: 'expenses', icon: '🛒', title: 'Расходы' },
  { id: 'credits', icon: '💳', title: 'Кредиты' },
  { id: 'utilities', icon: '🏠', title: 'КУслуги' },
  { id: 'required', icon: '📌', title: 'Обязательные' },
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
    this._warpText = null;
    this._silk = null;
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
      <div class="app-bg" aria-hidden="true">
        <div class="silk-host" id="silk-bg"></div>
      </div>
      <div class="app-shell">
        <aside class="sidebar glass" id="sidebar">
          <div class="brand">
            <div class="brand-mark" aria-hidden="true">К</div>
            <div>
              <strong>Кабинет</strong>
              <span>личные финансы</span>
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
    requestAnimationFrame(() => this.mountSilkBackground());
  }

  mountSilkBackground() {
    const host = this.root.querySelector('#silk-bg');
    if (!host) return;
    if (this._silk) {
      try { this._silk.destroy(); } catch (_) { /* ignore */ }
      this._silk = null;
    }

    const theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    import('./silk.js')
      .then(({ createSilk, SILK_THEME }) => {
        if (!this.root?.contains(host)) return;
        this._silk = createSilk(host, SILK_THEME[theme] || SILK_THEME.dark);
      })
      .catch((error) => {
        console.warn('Silk фон отключён:', error);
      });
  }

  updateSilkTheme(theme) {
    const value = theme === 'light' ? 'light' : 'dark';
    if (this._silk?.setTheme) {
      this._silk.setTheme(value);
      return;
    }
    this.mountSilkBackground();
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
      if (e.target?.id === 'credits-filter') {
        this.emit('credits-filter', e.target.value);
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

    this.root.addEventListener('input', (e) => {
      if (e.target?.id === 'credits-search') {
        this.emit('credits-search', e.target.value);
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
    if (form) {
      const data = Object.fromEntries(new FormData(form).entries());
      form.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        data[cb.name] = cb.checked;
      });
      this.lastModalFormData = data;
    } else {
      this.lastModalFormData = {};
    }
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
    this.destroyWarpText();
    this.contentEl.innerHTML = html;
    this.contentEl.classList.remove('fade-in');
    void this.contentEl.offsetWidth;
    this.contentEl.classList.add('fade-in');
  }

  destroyWarpText() {
    if (this._warpText) {
      try {
        this._warpText.destroy();
      } catch (_) {
        /* ignore */
      }
      this._warpText = null;
    }
  }

  money(amount, currency = 'RUB') {
    return formatMoney(amount, currency);
  }

  empty(text) {
    return `<div class="empty-state glass-soft"><p>${escapeHtml(text)}</p></div>`;
  }

  stats(cards) {
    return `<div class="stats-grid">${cards.map((c) => `
      <article class="stat-card glass tone-${c.tone || 'blue'}${c.clickAction ? ' stat-card--clickable' : ''}"${c.clickAction ? ` data-action="${escapeHtml(c.clickAction)}" role="button" tabindex="0"` : ''}>
        <div class="stat-icon">${c.icon || '•'}</div>
        <div class="stat-body">
          <p class="stat-label">${escapeHtml(c.label)}</p>
          <p class="stat-value" data-raw-value="0">${escapeHtml(c.value)}</p>
          ${c.hint ? `<p class="stat-hint">${escapeHtml(c.hint)}</p>` : ''}
        </div>
      </article>
    `).join('')}</div>`;
  }

  /**
   * Подпись статуса обязательств для карточки Dashboard.
   */
  obligationHint(card, currency) {
    if (!card) return '✓ Всё оплачено';
    if (card.status === 'overdue') {
      return `🔴 Просрочено: ${formatMoney(card.overdue || 0, currency)}`;
    }
    if (card.status === 'today') {
      return `🟠 Сегодня: ${formatMoney(card.today || 0, currency)}`;
    }
    if ((card.remaining || 0) > 0) {
      return `🟡 Осталось оплатить: ${formatMoney(card.remaining || 0, currency)}`;
    }
    return '✓ Всё оплачено';
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
    const {
      income, budget, expenses, credits, utilities, requiredExpenses, goals, period, remainingMoney
    } = data;
    const creditCard = credits.obligation || {
      remaining: credits.monthlyRemaining ?? 0,
      status: (credits.monthlyRemaining ?? 0) > 0 ? 'pending' : 'paid',
      overdue: 0,
      today: 0
    };
    const utilCard = utilities.card || {
      remaining: utilities.pending || 0,
      status: (utilities.pending || 0) > 0 ? 'pending' : 'paid',
      overdue: utilities.overdueTotal || 0,
      today: 0
    };
    const reqCard = requiredExpenses?.card || {
      remaining: requiredExpenses?.pending || 0,
      status: (requiredExpenses?.pending || 0) > 0 ? 'pending' : 'paid',
      overdue: requiredExpenses?.overdueTotal || 0,
      today: requiredExpenses?.todayTotal || 0
    };

    this.render(`
      <section class="hero-panel glass">
        <div class="hero-main">
          <div class="hero-copy">
            <p class="brand-wordmark">Кабинет</p>
            <div class="eyebrow">Текущий период</div>
            <h2>${escapeHtml(period ? `${PERIOD_STATUS_LABELS[period.status] || ''} · ${period.year}-${String(period.month).padStart(2, '0')}` : '—')}</h2>
            <p class="muted">Домашний учёт доходов, конвертов и платежей за месяц</p>
          </div>
          <div class="hero-actions">
            <button class="btn btn-primary" data-action="add-income" type="button">+ Доход</button>
            <button class="btn btn-ghost" data-action="distribute" type="button">Распределить</button>
            <button class="btn btn-ghost" data-action="add-expense" type="button">Покупка</button>
          </div>
        </div>
        <div class="hero-visual" aria-hidden="true">
          <img
            class="hero-home-img"
            src="assets/images/home-hero.jpg"
            alt=""
            width="320"
            height="320"
            decoding="async"
          />
        </div>
      </section>
      ${this.stats([
        {
          icon: '💰',
          label: 'Доходы',
          value: formatMoney(income.totalIncome, currency),
          hint: income.count ? `${income.count} источник(а/ов)` : 'Нет доходов',
          tone: 'green'
        },
        {
          icon: '💵',
          label: 'Осталось денег',
          value: formatMoney(remainingMoney ?? ((income.freeMoney || 0) + (budget.totalBalance || 0)), currency),
          hint: `Свободно ${formatMoney(income.freeMoney, currency)} · в конвертах ${formatMoney(budget.totalBalance, currency)}`,
          tone: 'cyan'
        },
        {
          icon: '🛒',
          label: 'Расходы',
          value: formatMoney(expenses.total, currency),
          hint: 'Только проведённые операции',
          tone: 'orange',
          clickAction: 'goto-expenses'
        },
        {
          icon: '💳',
          label: 'Кредиты',
          value: formatMoney(creditCard.remaining || 0, currency),
          hint: this.obligationHint(creditCard, currency),
          tone: creditCard.tone || (creditCard.remaining > 0 ? 'yellow' : 'green'),
          clickAction: 'goto-credits'
        },
        {
          icon: '🏠',
          label: 'Коммунальные услуги',
          value: formatMoney(utilCard.remaining || 0, currency),
          hint: this.obligationHint(utilCard, currency),
          tone: utilCard.tone || (utilCard.remaining > 0 ? 'yellow' : 'green'),
          clickAction: 'goto-utilities'
        },
        {
          icon: '📌',
          label: 'Обязательные расходы',
          value: formatMoney(reqCard.remaining || 0, currency),
          hint: this.obligationHint(reqCard, currency),
          tone: reqCard.tone || (reqCard.remaining > 0 ? 'yellow' : 'green'),
          clickAction: 'goto-required'
        }
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
          <div class="panel-head"><h3>Цели</h3></div>
          ${goals.items.slice(0, 4).map((g) => `
            <div class="progress-row">
              <div class="progress-meta"><span>${g.icon} ${escapeHtml(g.title)}</span><span>${g.progress}%</span></div>
              <div class="progress-bar"><i style="width:${g.progress}%"></i></div>
            </div>
          `).join('') || this.empty('Целей пока нет')}
          <div class="panel-head" style="margin-top:16px"><h3>Накопления</h3></div>
          <p class="stat-value" style="margin:0">${formatMoney(budget.savings, currency)}</p>
        </section>
      </div>
      <section class="panel glass" style="margin-top:14px">
        <div class="panel-head">
          <h3>Текущие проценты</h3>
          <button class="btn btn-ghost btn-sm" data-action="configure-percents" type="button">⚙ Настроить</button>
        </div>
        ${(budget.distributionPercents || []).length ? `
          <div class="dist-percent-card">
            ${(budget.distributionPercents || []).map((row) => `
              <div class="dist-percent-card-row">
                <span>${escapeHtml(row.icon || '')} ${escapeHtml(row.name)}</span>
                <strong>${row.percent}%</strong>
              </div>
            `).join('')}
          </div>
          <p class="muted" style="margin-top:8px">Итого: ${budget.distributionPercentSum ?? 0}% · распределение от полного дохода</p>
        ` : this.empty('Нет конвертов')}
      </section>
      <section class="panel glass" style="margin-top:14px">
        <div class="panel-head">
          <h3>Ближайшие платежи по кредитам</h3>
          <button class="btn btn-ghost btn-sm" data-action="goto-credits" type="button">Все кредиты</button>
        </div>
        ${(credits.widgetUpcoming || credits.upcoming || []).slice(0, 5).length ? `
          <div class="credits-upcoming">
            ${(credits.widgetUpcoming || credits.upcoming || []).slice(0, 5).map((item) => `
              <div class="credits-upcoming-item">
                <strong>${formatDayMonth(item.nextPayment)}</strong>
                <span>${escapeHtml(item.bank)} · ${escapeHtml(item.title)}</span>
                <span class="credits-upcoming-amount">${formatMoney(item.monthly_payment, currency)}</span>
              </div>
            `).join('')}
          </div>
        ` : this.empty('Нет ближайших платежей')}
      </section>
    `);
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
    const percentRows = summary.distributionPercents || [];
    const percentSum = summary.distributionPercentSum ?? 0;
    this.render(`
      ${this.toolbar('Бюджет', `Прогресс распределения ${summary.distributionProgress}%`, [
        '<button class="btn btn-primary" data-action="distribute" type="button">Распределить</button>',
        '<button class="btn btn-ghost" data-action="configure-percents" type="button">⚙ Настроить проценты</button>',
        '<button class="btn btn-ghost" data-action="transfer" type="button">Перевод</button>',
        '<button class="btn btn-ghost" data-action="add-category" type="button">+ Конверт</button>'
      ])}
      ${this.stats([
        { icon: '🆓', label: 'Свободно', value: formatMoney(summary.freeMoney, currency), tone: 'cyan' },
        { icon: '📦', label: 'В конвертах', value: formatMoney(summary.totalBalance, currency), tone: 'blue' },
        { icon: '🏦', label: 'Накопления', value: formatMoney(summary.savings, currency), tone: 'mint' }
      ])}
      <section class="panel glass" style="margin-bottom:14px">
        <div class="panel-head">
          <h3>Текущие проценты</h3>
          <span class="muted ${summary.distributionPercentsValid ? '' : 'dist-sum-bad'}">Итого ${percentSum}%</span>
        </div>
        ${percentRows.length ? `
          <div class="dist-percent-card">
            ${percentRows.map((row) => `
              <div class="dist-percent-card-row">
                <span>${escapeHtml(row.icon || '')} ${escapeHtml(row.name)}</span>
                <strong>${row.percent}%</strong>
              </div>
            `).join('')}
          </div>
        ` : this.empty('Нет конвертов')}
        ${summary.distributionPercentsValid ? '' : '<p class="dist-error">Сумма процентов должна быть равна 100%.</p>'}
      </section>
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
    const structure = summary.structure || [];
    this.render(`
      ${this.toolbar('Расходы', `Потрачено ${formatMoney(summary.total, currency)}`, [
        '<button class="btn btn-primary" data-action="add-expense" type="button">+ Покупка</button>'
      ])}
      ${this.stats([
        { icon: '🛒', label: 'Всего расходов', value: formatMoney(summary.total, currency), tone: 'orange' },
        { icon: '#️⃣', label: 'Операций', value: String(summary.count || 0), tone: 'blue' },
        { icon: '🏷', label: 'Категорий', value: String(structure.length), tone: 'cyan' }
      ])}
      ${structure.length ? `
        <div class="two-col" style="margin-bottom:14px">
          <section class="panel glass">
            <div class="panel-head"><h3>Структура расходов</h3></div>
            <canvas id="chart-expenses-page" width="220" height="220"></canvas>
            <div class="legend" id="legend-expenses-page"></div>
          </section>
          <section class="panel glass">
            <div class="panel-head"><h3>По категориям</h3></div>
            ${structure.map((s) => `
              <div class="progress-row">
                <div class="progress-meta"><span>${escapeHtml(s.category)}</span><span>${formatMoney(s.amount, currency)}</span></div>
              </div>
            `).join('')}
          </section>
        </div>
      ` : ''}
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
    if (structure.length) {
      const expenseItems = structure.map((s, i) => ({
        name: s.category,
        amount: s.amount,
        color: `hsl(${(i * 47) % 360} 70% 55%)`
      }));
      drawDonut(this.contentEl.querySelector('#chart-expenses-page'), expenseItems, { centerLabel: 'Расходы' });
      const legend = this.contentEl.querySelector('#legend-expenses-page');
      if (legend) legend.innerHTML = legendHtml(expenseItems);
    }
  }

  renderCredits(summary, currency) {
    const tab = summary.tab || 'list';
    const cards = summary.cards || [];
    const items = summary.items || [];
    const fmt = (v) => formatMoney(Number.isFinite(Number(v)) ? Number(v) : 0, currency);
    const dash = (v) => (v == null || v === '' ? '—' : v);
    const sortBy = summary.sortBy || 'title';
    const sortDir = summary.sortDir === 'desc' ? 'desc' : 'asc';
    const filter = summary.filter || 'all';
    const search = summary.search || '';
    const sortMark = (col) => (sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');
    const tabs = summary.tabs || [];

    const remindersHtml = (summary.reminders || []).length ? `
      <div class="credits-reminders">
        ${(summary.reminders || []).map((r) => `
          <div class="credit-reminder credit-reminder--${r.level}">
            ${r.overdue ? 'Просрочен' : (r.days === 0 ? 'Сегодня' : `Через ${r.days} дн.`)}: ${escapeHtml(r.bank)} · ${escapeHtml(r.title)} — ${fmt(r.amount)}
          </div>
        `).join('')}
      </div>
    ` : '';

    const tabsHtml = `
      <div class="credits-tabs" role="tablist">
        ${tabs.map((t) => `
          <button class="credits-tab ${tab === t.id ? 'active' : ''}" data-action="credits-tab" data-tab="${t.id}" type="button">${t.label}</button>
        `).join('')}
      </div>
    `;

    const listHtml = `
      <div class="envelope-grid credits-cards">
        ${cards.map((item, index) => `
          <article class="envelope-card glass credit-card credit-card--${item.urgency || 'gray'} credit-fade" style="animation-delay:${Math.min(index, 8) * 40}ms">
            <div class="credit-card-head">
              <div class="envelope-top">
                <span>🏦</span>
                <div>
                  <strong>${escapeHtml(item.title)}</strong>
                  <div class="muted">${escapeHtml(item.bank)}</div>
                </div>
              </div>
              <span class="credit-badge credit-badge--${item.urgency || 'gray'}">
                ${item.status === 'closed' ? '✔ Закрыт' : `${item.urgencyIcon || ''} ${escapeHtml(item.urgencyLabel || '')}`}
              </span>
            </div>
            <div class="credit-meta-grid">
              <div><span>🏦 Банк</span><strong>${escapeHtml(item.bank)}</strong></div>
              <div><span>📄 Название</span><strong>${escapeHtml(item.title)}</strong></div>
              <div><span>💰 Остаток долга</span><strong>${fmt(item.current_balance)}</strong></div>
              <div><span>💳 Начальная сумма</span><strong>${fmt(item.initial_amount)}</strong></div>
              <div><span>📉 Выплачено</span><strong>${fmt(item.paid)}</strong></div>
              <div><span>📈 Процентная ставка</span><strong>${item.interest_rate}%</strong></div>
              <div><span>💵 Ежемесячный платёж</span><strong>${fmt(item.monthly_payment)}</strong></div>
              <div><span>📅 День платежа</span><strong>${item.payment_day}-е</strong></div>
              <div><span>📆 Дата окончания</span><strong>${item.end_date ? formatDate(item.end_date) : (item.estimatedCloseDate ? formatDate(item.estimatedCloseDate) : '—')}</strong></div>
              <div><span>⏳ Осталось месяцев</span><strong>${dash(item.monthsLeft)}</strong></div>
              <div><span>🧾 Переплата</span><strong>${fmt(item.overpayment)}</strong></div>
            </div>
            <div class="progress-row credit-progress">
              <div class="progress-meta"><span>Погашение</span><span>${item.progress}%</span></div>
              <div class="progress-bar progress-tone-${item.progressTone} progress-animated"><i style="width:${item.progress}%"></i></div>
              <div class="credit-progress-split">
                <p class="muted credit-remain">Выплачено:<br><strong>${fmt(item.paid)}</strong></p>
                <p class="muted credit-remain">Осталось:<br><strong>${fmt(item.remaining)}</strong></p>
              </div>
            </div>
            <div class="btn-row wrap">
              ${item.status === 'active' ? `
                <button class="btn btn-primary btn-sm" data-action="pay-credit" data-id="${item.id}" type="button">💸 Оплатить</button>
                <button class="btn btn-ghost btn-sm" data-action="early-pay-credit" data-id="${item.id}" type="button">⚡ Досрочное погашение</button>
              ` : ''}
              <button class="btn btn-ghost btn-sm" data-action="edit-credit" data-id="${item.id}" type="button">✏ Изменить</button>
              <button class="btn btn-ghost btn-sm" data-action="credit-history" data-id="${item.id}" type="button">📄 История</button>
              <button class="btn btn-danger btn-sm" data-action="delete-credit" data-id="${item.id}" type="button">🗑 Удалить</button>
            </div>
          </article>
        `).join('') || this.empty('Кредитов пока нет')}
      </div>
    `;

    const summaryHtml = `
      <div class="filters credits-toolbar glass-soft">
        <label>Поиск
          <input class="input" id="credits-search" type="search" placeholder="Банк или название" value="${escapeHtml(search)}" />
        </label>
        <label>Фильтр
          <select id="credits-filter" class="input">
            ${(summary.filterOptions || []).map((o) => `
              <option value="${escapeHtml(o.value)}" ${o.value === filter ? 'selected' : ''}>${escapeHtml(o.label)}</option>
            `).join('')}
          </select>
        </label>
      </div>
      <section class="panel glass credits-table-wrap">
        <div class="panel-head"><h3>Сводная таблица</h3><span class="muted">${items.length} из ${summary.totalCount || 0}</span></div>
        ${items.length ? `
          <div class="credits-table-desktop">
            <table class="credits-table">
              <thead>
                <tr>
                  <th data-action="credits-sort-col" data-sort="title">Название${sortMark('title')}</th>
                  <th data-action="credits-sort-col" data-sort="bank">Банк${sortMark('bank')}</th>
                  <th data-action="credits-sort-col" data-sort="balance">Остаток${sortMark('balance')}</th>
                  <th data-action="credits-sort-col" data-sort="initial_amount">Начальная сумма${sortMark('initial_amount')}</th>
                  <th data-action="credits-sort-col" data-sort="monthly_payment">Платеж${sortMark('monthly_payment')}</th>
                  <th data-action="credits-sort-col" data-sort="interest_rate">%${sortMark('interest_rate')}</th>
                  <th data-action="credits-sort-col" data-sort="overpayment">Переплата${sortMark('overpayment')}</th>
                  <th data-action="credits-sort-col" data-sort="payment_day">Дата платежа${sortMark('payment_day')}</th>
                  <th data-action="credits-sort-col" data-sort="months_left">Осталось месяцев${sortMark('months_left')}</th>
                  <th data-action="credits-sort-col" data-sort="end_date">Дата окончания${sortMark('end_date')}</th>
                  <th data-action="credits-sort-col" data-sort="status">Статус${sortMark('status')}</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((item) => `
                  <tr class="${item.status === 'closed' ? 'is-closed' : ''}">
                    <td>${escapeHtml(item.title)}</td>
                    <td>${escapeHtml(item.bank)}</td>
                    <td>${fmt(item.current_balance)}</td>
                    <td>${fmt(item.initial_amount)}</td>
                    <td>${fmt(item.monthly_payment)}</td>
                    <td>${item.interest_rate}%</td>
                    <td>${fmt(item.overpayment)}</td>
                    <td>${item.payment_day}-е</td>
                    <td>${dash(item.monthsLeft)}</td>
                    <td>${item.end_date ? formatDate(item.end_date) : (item.estimatedCloseDate ? formatDate(item.estimatedCloseDate) : '—')}</td>
                    <td>${escapeHtml(item.statusLabel)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div class="credits-table-mobile">
            ${items.map((item) => `
              <article class="list-item glass-soft credit-fade">
                <div class="list-main">
                  <strong>${escapeHtml(item.title)}</strong>
                  <span class="muted">${escapeHtml(item.bank)} · ${escapeHtml(item.statusLabel)}</span>
                  <span class="muted">Остаток ${fmt(item.current_balance)} · платёж ${fmt(item.monthly_payment)} · ${item.interest_rate}%</span>
                </div>
              </article>
            `).join('')}
          </div>
        ` : this.empty('Нет кредитов по выбранным условиям')}
      </section>
    `;

    const calendarHtml = `
      <div class="stats-grid compact">
        <article class="stat-card glass tone-orange">
          <div class="stat-icon">📅</div>
          <div>
            <p class="stat-label">Следующий платёж</p>
            <p class="stat-value">${summary.daysToNext == null ? '—' : (summary.daysToNext === 0 ? 'Сегодня / просрочен' : `через ${summary.daysToNext} дн.`)}</p>
            <p class="muted">${summary.nearestTitle ? escapeHtml(summary.nearestTitle) : ''}${summary.nearestAmount ? ` · ${fmt(summary.nearestAmount)}` : ''}</p>
          </div>
        </article>
      </div>
      <section class="panel glass">
        <div class="panel-head"><h3>Календарь платежей</h3></div>
        ${(summary.upcoming || []).length ? `
          <div class="credits-upcoming">
            ${(summary.upcoming || []).map((item) => `
              <div class="credits-upcoming-item">
                <strong>${formatDayMonth(item.nextPayment)}</strong>
                <span>${escapeHtml(item.bank)}</span>
                <span class="credits-upcoming-amount">${fmt(item.monthly_payment)}</span>
              </div>
            `).join('')}
          </div>
        ` : this.empty('Нет запланированных платежей')}
      </section>
    `;

    const analyticsHtml = `
      ${this.stats([
        { icon: '💳', label: 'Общий долг', value: fmt(summary.totalDebt), tone: 'red' },
        { icon: '💵', label: 'Общий ежемесячный платёж', value: fmt(summary.monthly), tone: 'orange' },
        { icon: '📈', label: 'Средняя ставка', value: `${summary.avgRate || 0}%`, tone: 'purple' },
        { icon: '🧾', label: 'Средняя переплата', value: fmt(summary.avgOverpayment), tone: 'yellow' },
        { icon: '🏦', label: 'Количество кредитов', value: String(summary.count || 0), tone: 'blue' },
        { icon: '✔', label: 'Закрытых', value: String(summary.closedCount || 0), tone: 'green' }
      ])}
      <div class="two-col">
        <section class="panel glass">
          <div class="panel-head"><h3>Остаток по кредитам</h3></div>
          <canvas id="credits-donut" width="220" height="220"></canvas>
          <div class="legend" id="credits-donut-legend"></div>
        </section>
        <section class="panel glass">
          <div class="panel-head"><h3>Ежемесячные платежи</h3></div>
          <canvas id="credits-bars" height="180"></canvas>
        </section>
      </div>
      <section class="panel glass" style="margin-top:14px">
        <div class="panel-head"><h3>Уменьшение общего долга</h3></div>
        <canvas id="credits-line" height="180"></canvas>
      </section>
    `;

    const historyHtml = `
      <section class="panel glass">
        <div class="panel-head"><h3>История операций</h3></div>
        ${(summary.operations || []).length ? this.list((summary.operations || []).map((op) => `
          <article class="list-item glass-soft">
            <div class="list-main">
              <strong>${formatDate(op.date)} · ${escapeHtml(op.bank)}</strong>
              <span class="muted">${escapeHtml(op.creditTitle)} · ${escapeHtml(op.typeLabel)}</span>
              <span class="muted">${escapeHtml(op.comment || '')}</span>
            </div>
            <div class="list-side"><strong>${fmt(op.amount)}</strong></div>
          </article>
        `)) : this.empty('История пуста')}
      </section>
    `;

    const body = {
      list: listHtml,
      summary: summaryHtml,
      calendar: calendarHtml,
      analytics: analyticsHtml,
      history: historyHtml
    }[tab] || listHtml;

    this.render(`
      ${this.toolbar('Кредиты', 'Управление кредитами и аналитика', [
        '<button class="btn btn-primary" data-action="add-credit" type="button">+ Кредит</button>',
        '<button class="btn btn-ghost btn-sm" data-action="credits-export-json" type="button">JSON</button>',
        '<button class="btn btn-ghost btn-sm" data-action="credits-export-excel" type="button">Excel</button>',
        '<button class="btn btn-ghost btn-sm" data-action="credits-export-pdf" type="button">PDF</button>'
      ])}
      ${remindersHtml}
      ${tabsHtml}
      ${body}
    `);

    if (tab === 'analytics') {
      const chartItems = summary.chartItems || [];
      drawDonut(this.contentEl.querySelector('#credits-donut'), chartItems, { centerLabel: 'Остаток' });
      const legend = this.contentEl.querySelector('#credits-donut-legend');
      if (legend) legend.innerHTML = legendHtml(chartItems);
      drawBars(this.contentEl.querySelector('#credits-bars'), summary.monthlyBars || []);
      drawLine(this.contentEl.querySelector('#credits-line'), summary.debtTrend || [], { color: '#2dd4bf' });
    }
  }


  renderUtilities(list, summary, currency) {
    const analytics = summary || {};
    this.render(`
      ${this.toolbar('Коммунальные услуги', `К оплате ${formatMoney(analytics.pending || 0, currency)}`, [
        '<button class="btn btn-primary" data-action="add-utility" type="button">+ Услуга</button>'
      ])}
      ${this.stats([
        { icon: '🧾', label: 'Всего за месяц', value: formatMoney(analytics.total || 0, currency), tone: 'blue' },
        { icon: '⏳', label: 'К оплате', value: formatMoney(analytics.pending || 0, currency), tone: 'orange' },
        { icon: '✔', label: 'Оплачено', value: formatMoney(analytics.paid || 0, currency), tone: 'green' },
        { icon: '⚠', label: 'Просрочено', value: formatMoney(analytics.overdueTotal || 0, currency), tone: 'red' },
        { icon: '📊', label: 'Средний платёж', value: formatMoney(analytics.avgAmount || 0, currency), tone: 'purple' },
        { icon: '🏆', label: 'Крупнее всего', value: analytics.topService ? `${escapeHtml(analytics.topService)}` : '—', tone: 'cyan' }
      ])}
      ${(analytics.totalCount || 0) > 0 ? `
        <div class="two-col" style="margin-bottom:14px">
          <section class="panel glass">
            <div class="panel-head"><h3>Структура по услугам</h3></div>
            <canvas id="utilities-donut" width="220" height="220"></canvas>
            <div class="legend" id="utilities-donut-legend"></div>
          </section>
          <section class="panel glass">
            <div class="panel-head"><h3>Статус оплаты</h3></div>
            <canvas id="utilities-bars" height="180"></canvas>
            <div class="progress-row" style="margin-top:12px">
              <div class="progress-meta"><span>Оплачено</span><span>${analytics.progress || 0}%</span></div>
              <div class="progress-bar"><i style="width:${analytics.progress || 0}%"></i></div>
            </div>
            ${analytics.nearestService ? `
              <p class="muted" style="margin-top:10px">
                Ближайшая: <strong>${escapeHtml(analytics.nearestService)}</strong>
                · до ${formatDate(analytics.nearestDue)}
                · ${formatMoney(analytics.nearestAmount || 0, currency)}
              </p>
            ` : ''}
          </section>
        </div>
        <section class="panel glass" style="margin-bottom:14px">
          <div class="panel-head"><h3>Суммы по услугам</h3></div>
          <canvas id="utilities-service-bars" height="180"></canvas>
        </section>
      ` : ''}
      ${this.list(list.map((item) => {
        const overdue = item.status !== 'paid' && item.due_date && String(item.due_date) < new Date().toISOString().slice(0, 10);
        const paidAmount = Number(item.paid_amount) || 0;
        const remaining = Number(item.remaining ?? item.amount) || 0;
        let statusLabel = 'ожидает';
        if (item.status === 'paid') statusLabel = 'оплачено';
        else if (item.isPartial || paidAmount > 0) statusLabel = `частично · осталось ${formatMoney(remaining, currency)}`;
        else if (overdue) statusLabel = 'просрочено';
        return `
        <article class="list-item glass-soft ${overdue ? 'utility-overdue' : ''}">
          <div class="list-main">
            <strong>${escapeHtml(item.service)}</strong>
            <span class="muted">до ${formatDate(item.due_date)} · ${statusLabel}${item.comment ? ` · ${escapeHtml(item.comment)}` : ''}</span>
            ${paidAmount > 0 && item.status !== 'paid' ? `
              <div class="progress-row" style="margin-top:8px;max-width:220px">
                <div class="progress-meta"><span>Оплачено</span><span>${formatMoney(paidAmount, currency)} / ${formatMoney(item.amount, currency)}</span></div>
                <div class="progress-bar"><i style="width:${Math.min(100, Math.round((paidAmount / Math.max(item.amount, 0.01)) * 100))}%"></i></div>
              </div>
            ` : ''}
          </div>
          <div class="list-side">
            <strong>${formatMoney(item.amount, currency)}</strong>
            ${item.status !== 'paid' ? `<span class="muted">к оплате ${formatMoney(remaining, currency)}</span>` : ''}
            <div class="btn-row wrap">
              ${item.status !== 'paid' ? `
                <button class="btn btn-primary btn-sm" data-action="pay-utility" data-id="${item.id}" type="button">${paidAmount > 0 ? 'Доплатить' : 'Оплатить'}</button>
                <button class="btn btn-ghost btn-sm" data-action="edit-utility" data-id="${item.id}" type="button">✏ Изменить</button>
                ${paidAmount <= 0 ? `<button class="btn btn-danger btn-sm" data-action="delete-utility" data-id="${item.id}" type="button">Удалить</button>` : ''}
              ` : '<span class="muted">✓ Оплачено</span>'}
            </div>
          </div>
        </article>
      `;
      }))}
    `);

    if ((analytics.totalCount || 0) > 0) {
      const chartItems = analytics.chartItems || [];
      drawDonut(this.contentEl.querySelector('#utilities-donut'), chartItems, { centerLabel: 'КУслуги' });
      const legend = this.contentEl.querySelector('#utilities-donut-legend');
      if (legend) legend.innerHTML = legendHtml(chartItems);
      drawBars(this.contentEl.querySelector('#utilities-bars'), analytics.statusBars || []);
      drawBars(this.contentEl.querySelector('#utilities-service-bars'), analytics.serviceBars || []);
    }
  }

  renderRequiredExpenses(list, summary, currency) {
    const analytics = summary || {};
    const statusText = (item) => {
      if (item.status === 'paid') return '🟢 Оплачено';
      if (item.payStatus === 'overdue') return '🔴 Просрочено';
      if (item.payStatus === 'today') return '🟠 Сегодня';
      return '🔴 Не оплачено';
    };
    this.render(`
      ${this.toolbar('Обязательные расходы', `К оплате ${formatMoney(analytics.pending || 0, currency)}`, [
        '<button class="btn btn-primary" data-action="add-required" type="button">+ Добавить обязательный расход</button>'
      ])}
      ${this.stats([
        { icon: '📌', label: 'Всего за месяц', value: formatMoney(analytics.total || 0, currency), tone: 'blue' },
        { icon: '⏳', label: 'К оплате', value: formatMoney(analytics.pending || 0, currency), tone: 'orange' },
        { icon: '✔', label: 'Оплачено', value: formatMoney(analytics.paid || 0, currency), tone: 'green' },
        { icon: '⚠', label: 'Просрочено', value: formatMoney(analytics.overdueTotal || 0, currency), tone: 'red' }
      ])}
      ${(analytics.totalCount || 0) > 0 ? `
        <div class="two-col" style="margin-bottom:14px">
          <section class="panel glass">
            <div class="panel-head"><h3>Структура по категориям</h3></div>
            <canvas id="required-donut" width="220" height="220"></canvas>
            <div class="legend" id="required-donut-legend"></div>
          </section>
          <section class="panel glass">
            <div class="panel-head"><h3>Статус оплаты</h3></div>
            <canvas id="required-bars" height="180"></canvas>
            <div class="progress-row" style="margin-top:12px">
              <div class="progress-meta"><span>Оплачено</span><span>${analytics.progress || 0}%</span></div>
              <div class="progress-bar"><i style="width:${analytics.progress || 0}%"></i></div>
            </div>
            ${analytics.nearestTitle ? `
              <p class="muted" style="margin-top:10px">
                Ближайший: <strong>${escapeHtml(analytics.nearestTitle)}</strong>
                · до ${formatDate(analytics.nearestDue)}
                · ${formatMoney(analytics.nearestAmount || 0, currency)}
              </p>
            ` : ''}
          </section>
        </div>
      ` : ''}
      ${this.list(list.map((item) => `
        <article class="list-item glass-soft ${item.payStatus === 'overdue' ? 'utility-overdue' : ''}">
          <div class="list-main">
            <strong>${escapeHtml(item.title)}</strong>
            <span class="muted">${escapeHtml(item.category)} · день ${item.payment_day} · ${formatDate(item.due_date)}${item.recurring ? ' · каждый месяц' : ''}${item.comment ? ` · ${escapeHtml(item.comment)}` : ''}</span>
            <span class="req-status">${statusText(item)}</span>
          </div>
          <div class="list-side">
            <strong>${formatMoney(item.amount, currency)}</strong>
            <div class="btn-row wrap">
              ${item.status !== 'paid' ? `
                <button class="btn btn-primary btn-sm" data-action="pay-required" data-id="${item.id}" type="button">Оплатить</button>
                <button class="btn btn-ghost btn-sm" data-action="edit-required" data-id="${item.id}" type="button">Изменить</button>
                <button class="btn btn-danger btn-sm" data-action="delete-required" data-id="${item.id}" type="button">Удалить</button>
              ` : `
                <span class="muted">✓ Оплачено${item.paid_date ? ` · ${formatDate(item.paid_date)}` : ''}</span>
                <button class="btn btn-ghost btn-sm" data-action="unpay-required" data-id="${item.id}" type="button">Отменить оплату</button>
              `}
            </div>
          </div>
        </article>
      `))}
    `);

    if ((analytics.totalCount || 0) > 0) {
      drawDonut(this.contentEl.querySelector('#required-donut'), analytics.chartItems || [], { centerLabel: 'Обязат.' });
      const legend = this.contentEl.querySelector('#required-donut-legend');
      if (legend) legend.innerHTML = legendHtml(analytics.chartItems || []);
      drawBars(this.contentEl.querySelector('#required-bars'), analytics.statusBars || []);
    }
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
      ${this.toolbar(view.title, 'Платежи по кредитам, КУслугам, обязательным расходам и целям', [
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
    const { expenseStructure, incomeStructure, envelopes, utilities, planFact, yearly } = data;
    const util = utilities || {};
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
      <section class="panel glass" style="margin-bottom:18px">
        <div class="panel-head">
          <h3>Коммунальные услуги</h3>
          <span class="muted">${util.totalCount || 0} записей</span>
        </div>
        ${this.stats([
          { icon: '🧾', label: 'Всего', value: formatMoney(util.total || 0, currency), tone: 'blue' },
          { icon: '⏳', label: 'К оплате', value: formatMoney(util.pending || 0, currency), tone: 'orange' },
          { icon: '✔', label: 'Оплачено', value: formatMoney(util.paid || 0, currency), tone: 'green' },
          { icon: '⚠', label: 'Просрочено', value: formatMoney(util.overdueTotal || 0, currency), tone: 'red' }
        ])}
        <div class="two-col">
          <div>
            <canvas id="chart-a-util" width="220" height="220"></canvas>
            <div class="legend" id="leg-a-util"></div>
          </div>
          <div>
            <canvas id="chart-a-util-bars" height="180"></canvas>
          </div>
        </div>
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

    const utilChart = (util.chartItems || []).length
      ? util.chartItems
      : [{ name: 'Нет данных', amount: 0, color: '#6b7c93' }];
    drawDonut(this.contentEl.querySelector('#chart-a-util'), util.chartItems || [], { centerLabel: 'КУслуги' });
    const legUtil = this.contentEl.querySelector('#leg-a-util');
    if (legUtil) legUtil.innerHTML = legendHtml(util.chartItems || []);
    drawBars(
      this.contentEl.querySelector('#chart-a-util-bars'),
      (util.serviceBars || []).length ? util.serviceBars : utilChart.map((u) => ({ label: u.name, amount: u.amount, color: u.color }))
    );

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
      if (f.type === 'checkbox') {
        return `<label class="checkbox-field full">
          <input type="checkbox" name="${f.name}" ${f.value ? 'checked' : ''} />
          <span>${escapeHtml(f.label)}</span>
        </label>`;
      }
      return `<label>${escapeHtml(f.label)}
        <input type="${f.type || 'text'}" name="${f.name}" value="${escapeHtml(f.value ?? '')}" ${f.required ? 'required' : ''} ${f.step ? `step="${f.step}"` : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} />
      </label>`;
    }).join('')}</form>`;
  }
}

export default UI;
