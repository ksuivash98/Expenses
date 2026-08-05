/**
 * app.js — точка входа приложения (LocalStorage, без авторизации)
 */
import { storage } from './storage.js';
import { incomeService } from './income.js';
import { budgetService } from './budget.js';
import { expensesService } from './expenses.js';
import { creditsService } from './credits.js';
import { utilitiesService } from './utilities.js';
import { goalsService } from './goals.js';
import { analyticsService } from './analytics.js';
import { calendarService } from './calendar.js';
import { historyService } from './history.js';
import { notificationService } from './notifications.js';
import { settingsService } from './settings.js';
import { UI } from './ui.js';
import { todayISO } from './utils.js';

class App {
  constructor() {
    this.ui = new UI(document.getElementById('app'));
    this.page = 'dashboard';
    this.calendarCursor = null;
    this.currency = 'RUB';
  }

  init() {
    try {
      settingsService.applyTheme();
      this.currency = settingsService.get().currency || 'RUB';
      this.ui.mount();
      this.bind();
      storage.subscribe(() => {
        if (!this.ui.isModalOpen()) this.refreshChrome();
        else {
          this.ui.updateNotificationBadge(notificationService.getUnreadCount());
        }
      });
      this.navigate('dashboard');
      this.refreshChrome();
    } catch (error) {
      console.error('Ошибка запуска приложения', error);
      const root = document.getElementById('app');
      if (root) {
        root.innerHTML = `<div style="padding:24px;color:#fff;font-family:sans-serif">
          <h2>Ошибка запуска</h2>
          <p>${String(error.message || error)}</p>
          <p>Откройте приложение через локальный сервер (например <code>npx serve .</code>), не через file://</p>
        </div>`;
      }
    }
  }

  bind() {
    this.ui.on('navigate', (page) => this.navigate(page));
    this.ui.on('switch-period', (id) => this.switchPeriod(id));
    this.ui.on('open-period', () => this.openPeriodDialog());
    this.ui.on('close-month', () => this.closeMonth());
    this.ui.on('notifications', () => this.showNotifications());
    this.ui.on('notif-read', (id) => {
      notificationService.markRead(id);
      this.ui.updateNotificationBadge(notificationService.getUnreadCount());
    });
    this.ui.on('settings-theme', (theme) => {
      settingsService.setTheme(theme);
      this.ui.toast('Тема обновлена', 'success');
    });
    this.ui.on('settings-currency', (currency) => {
      settingsService.update({ currency });
      this.currency = currency;
      this.refresh();
      this.ui.toast('Валюта обновлена', 'success');
    });
    this.ui.on('action', (payload) => this.handleAction(payload));
  }

  refreshChrome() {
    this.currency = settingsService.get().currency || 'RUB';
    const dash = analyticsService.getDashboard();
    this.ui.updateSidebarStats({
      freeMoney: dash.freeMoney,
      savings: dash.savings,
      currency: this.currency
    });
    this.ui.updateNotificationBadge(notificationService.getUnreadCount());
    const periods = budgetService.getAllPeriods().map((p) => ({
      ...p,
      title: budgetService.formatPeriodTitle(p)
    }));
    this.ui.renderPeriodSwitcher(periods, storage.getCurrentPeriodId());
  }

  navigate(page) {
    this.page = page;
    this.ui.setActivePage(page);
    this.refresh();
  }

  refresh() {
    this.refreshChrome();
    const c = this.currency;
    switch (this.page) {
      case 'dashboard':
        this.ui.renderDashboard(analyticsService.getDashboard(), c);
        break;
      case 'income':
        this.ui.renderIncome(incomeService.getAll(), incomeService.getSummary(), c);
        break;
      case 'budget':
        this.ui.renderBudget(budgetService.getSummary(), c);
        break;
      case 'expenses':
        this.ui.renderExpenses(expensesService.getAll(), expensesService.getSummary(), c);
        break;
      case 'credits':
        this.ui.renderCredits(creditsService.getSummary(), c);
        break;
      case 'utilities':
        this.ui.renderUtilities(utilitiesService.getAll(), utilitiesService.getSummary(), c);
        break;
      case 'goals':
        this.ui.renderGoals(goalsService.getSummary(), c);
        break;
      case 'calendar': {
        const period = storage.getCurrentPeriod();
        if (!this.calendarCursor) {
          this.calendarCursor = {
            year: period?.year || new Date().getFullYear(),
            monthIndex: (period?.month || 1) - 1
          };
        }
        this.ui.renderCalendar(
          calendarService.getView(this.calendarCursor.year, this.calendarCursor.monthIndex),
          c
        );
        break;
      }
      case 'analytics':
        this.ui.renderAnalytics({
          expenseStructure: analyticsService.getExpenseStructure(),
          incomeStructure: analyticsService.getIncomeStructure(),
          envelopes: analyticsService.getEnvelopeStructure(),
          planFact: analyticsService.getPlanFact(),
          yearly: analyticsService.getYearlyOverview(storage.getCurrentPeriod()?.year || new Date().getFullYear())
        }, c);
        break;
      case 'history':
        this.ui.renderHistory(historyService.getAll(), c);
        break;
      case 'archive':
        this.ui.renderArchive(analyticsService.getArchive(), c);
        break;
      case 'settings':
        this.ui.renderSettings(settingsService.get());
        break;
      default:
        this.ui.render('<p>Раздел не найден</p>');
    }
  }

  async handleAction({ action, id }) {
    try {
      switch (action) {
        case 'add-income': return this.formIncome();
        case 'edit-income': return this.formIncome(id);
        case 'delete-income': return this.deleteIncome(id);
        case 'distribute': return this.formDistribute();
        case 'transfer': return this.formTransfer();
        case 'add-category': return this.formCategory();
        case 'edit-category': return this.formCategory(id);
        case 'delete-category': return this.deleteCategory(id);
        case 'add-expense': return this.formExpense();
        case 'delete-expense': return this.deleteExpense(id);
        case 'add-credit': return this.formCredit();
        case 'edit-credit': return this.formCredit(id);
        case 'pay-credit': return this.payCredit(id);
        case 'early-pay-credit': return this.earlyPayCredit(id);
        case 'delete-credit': return this.deleteCredit(id);
        case 'add-utility': return this.formUtility();
        case 'pay-utility': return this.payUtility(id);
        case 'delete-utility': return this.deleteUtility(id);
        case 'add-goal': return this.formGoal();
        case 'contribute-goal': return this.contributeGoal(id);
        case 'delete-goal': return this.deleteGoal(id);
        case 'cal-prev': return this.shiftCalendar(-1);
        case 'cal-next': return this.shiftCalendar(1);
        case 'edit-plan': return this.formPlan();
        case 'compare-periods': return this.comparePeriods();
        case 'open-archive': return this.switchPeriod(id);
        case 'unlock-period': return this.unlockPeriod(id);
        case 'export-json':
        case 'download-backup':
          settingsService.downloadBackup();
          this.ui.toast('Резервная копия скачана', 'success');
          break;
        case 'import-json':
        case 'restore-backup':
          return this.importData();
        case 'clear-all':
          return this.clearAll();
        default:
          break;
      }
    } catch (error) {
      this.ui.toast(error.message || 'Ошибка', 'error');
    }
  }

  envelopeOptions() {
    return budgetService.getCategories().map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }));
  }

  async formDialog(title, fields, onSubmit) {
    const action = await this.ui.modal({
      title,
      body: this.ui.formFields(fields),
      actions: [
        { id: 'cancel', label: 'Отмена', className: 'btn-ghost' },
        { id: 'save', label: 'Сохранить', className: 'btn-primary' }
      ],
      wide: true
    });
    if (action !== 'save') return null;
    const data = this.ui.getModalFormData();
    return onSubmit(data);
  }

  async formIncome(id = null) {
    const existing = id ? incomeService.getById(id) : null;
    await this.formDialog(existing ? 'Изменить доход' : 'Новый доход', [
      { name: 'title', label: 'Название', value: existing?.title || '', required: true },
      { name: 'source', label: 'Источник', type: 'select', options: incomeService.getSources(), value: existing?.source || 'Зарплата', required: true },
      { name: 'amount', label: 'Сумма', type: 'number', step: '0.01', min: 0, value: existing?.amount ?? '', required: true },
      { name: 'date', label: 'Дата', type: 'date', value: existing?.date || todayISO(), required: true },
      { name: 'comment', label: 'Комментарий', type: 'textarea', value: existing?.comment || '' }
    ], (data) => {
      const result = existing ? incomeService.update(id, data) : incomeService.add(data);
      this.ui.toast(result.message || (result.success ? 'Сохранено' : 'Ошибка'), result.success ? 'success' : 'error');
      if (result.success) this.refresh();
      return result;
    });
  }

  async deleteIncome(id) {
    if (!(await this.ui.confirm('Удалить этот доход?', { danger: true }))) return;
    const result = incomeService.remove(id);
    this.ui.toast(result.message || (result.success ? 'Удалено' : 'Ошибка'), result.success ? 'success' : 'error');
    if (result.success) this.refresh();
  }

  async formDistribute() {
    const undistributed = incomeService.getUndistributed();
    if (!undistributed.length) {
      this.ui.toast('Нет нераспределённых доходов', 'warning');
      return;
    }
    const income = undistributed[0];
    const envelopes = budgetService.getCategories();
    const fields = [
      { name: 'incomeInfo', label: 'Доход', value: `${income.title} · остаток ${income.remaining}`, type: 'text' },
      ...envelopes.map((e) => ({
        name: `cat_${e.id}`,
        label: `${e.icon} ${e.name}`,
        type: 'number',
        step: '0.01',
        min: 0,
        value: 0
      }))
    ];
    // Make incomeInfo read-only via disabled workaround - use select with one option
    fields[0] = {
      name: 'income_id',
      label: 'Доход',
      type: 'select',
      options: undistributed.map((i) => ({ value: i.id, label: `${i.title} (остаток ${i.remaining})` })),
      value: income.id,
      required: true
    };

    await this.formDialog('Распределение дохода', fields, (data) => {
      const allocations = envelopes.map((e) => ({
        categoryId: e.id,
        amount: data[`cat_${e.id}`]
      }));
      const result = budgetService.distribute(data.income_id, allocations);
      this.ui.toast(result.message || (result.success ? 'Распределено' : 'Ошибка'), result.success ? 'success' : 'error');
      if (result.success) this.refresh();
      return result;
    });
  }

  async formTransfer() {
    const envelopes = this.envelopeOptions();
    if (envelopes.length < 2) {
      this.ui.toast('Нужно минимум два конверта', 'warning');
      return;
    }
    await this.formDialog('Перевод между конвертами', [
      { name: 'fromId', label: 'Откуда', type: 'select', options: envelopes, required: true },
      { name: 'toId', label: 'Куда', type: 'select', options: envelopes, value: envelopes[1]?.value, required: true },
      { name: 'amount', label: 'Сумма', type: 'number', step: '0.01', min: 0, required: true },
      { name: 'comment', label: 'Комментарий', type: 'textarea' }
    ], (data) => {
      const result = budgetService.transfer(data.fromId, data.toId, data.amount, data.comment);
      this.ui.toast(result.message || (result.success ? 'Переведено' : 'Ошибка'), result.success ? 'success' : 'error');
      if (result.success) this.refresh();
      return result;
    });
  }

  async formCategory(id = null) {
    const existing = id ? budgetService.getCategoryById(id) : null;
    await this.formDialog(existing ? 'Правило переноса' : 'Новый конверт', [
      { name: 'name', label: 'Название', value: existing?.name || '', required: true },
      { name: 'icon', label: 'Иконка', value: existing?.icon || '📦' },
      {
        name: 'carry_rule',
        label: 'Правило переноса',
        type: 'select',
        options: [
          { value: 'balance', label: 'Переносить остаток' },
          { value: 'always', label: 'Всегда переносить' },
          { value: 'zero', label: 'Обнулять' },
          { value: 'max', label: 'Переносить максимум' },
          { value: 'never', label: 'Не переносить' }
        ],
        value: existing?.carry_rule || 'balance'
      },
      { name: 'carry_max', label: 'Максимум переноса', type: 'number', step: '0.01', value: existing?.carry_max ?? '' }
    ], (data) => {
      const result = existing
        ? budgetService.updateCategory(id, data)
        : budgetService.createCategory(data);
      this.ui.toast(result.message || (result.success ? 'Сохранено' : 'Ошибка'), result.success ? 'success' : 'error');
      if (result.success) this.refresh();
      return result;
    });
  }

  async deleteCategory(id) {
    if (!(await this.ui.confirm('Удалить конверт?', { danger: true }))) return;
    const result = budgetService.deleteCategory(id);
    this.ui.toast(result.message || (result.success ? 'Удалено' : 'Ошибка'), result.success ? 'success' : 'error');
    if (result.success) this.refresh();
  }

  async formExpense() {
    await this.formDialog('Новая покупка', [
      { name: 'title', label: 'Название', required: true },
      { name: 'amount', label: 'Сумма', type: 'number', step: '0.01', min: 0, required: true },
      { name: 'date', label: 'Дата', type: 'date', value: todayISO(), required: true },
      { name: 'category', label: 'Категория покупки', type: 'select', options: expensesService.getCategories(), required: true },
      { name: 'budget_category', label: 'Конверт', type: 'select', options: this.envelopeOptions(), required: true },
      { name: 'shop', label: 'Магазин' },
      { name: 'comment', label: 'Комментарий', type: 'textarea' }
    ], (data) => {
      const result = expensesService.add(data);
      this.ui.toast(result.message || (result.success ? 'Сохранено' : 'Ошибка'), result.success ? 'success' : 'error');
      if (result.success) this.refresh();
      return result;
    });
  }

  async deleteExpense(id) {
    if (!(await this.ui.confirm('Удалить расход?', { danger: true }))) return;
    const result = expensesService.remove(id);
    this.ui.toast(result.message || (result.success ? 'Удалено' : 'Ошибка'), result.success ? 'success' : 'error');
    if (result.success) this.refresh();
  }

  async formCredit(id = null) {
    const existing = id ? creditsService.getById(id) : null;
    await this.formDialog(existing ? 'Изменить кредит' : 'Новый кредит', [
      { name: 'bank', label: 'Банк', value: existing?.bank || '', required: true },
      { name: 'title', label: 'Название', value: existing?.title || '', required: true },
      { name: 'initial_amount', label: 'Начальная сумма', type: 'number', step: '0.01', value: existing?.initial_amount ?? '', required: true },
      { name: 'current_balance', label: 'Остаток', type: 'number', step: '0.01', value: existing?.current_balance ?? '', required: true },
      { name: 'monthly_payment', label: 'Ежемесячный платёж', type: 'number', step: '0.01', value: existing?.monthly_payment ?? '', required: true },
      { name: 'interest_rate', label: 'Ставка %', type: 'number', step: '0.01', value: existing?.interest_rate ?? 0 },
      { name: 'payment_day', label: 'День платежа', type: 'number', min: 1, value: existing?.payment_day ?? 1, required: true },
      { name: 'start_date', label: 'Дата начала', type: 'date', value: existing?.start_date || todayISO() },
      { name: 'end_date', label: 'Дата окончания', type: 'date', value: existing?.end_date || '' },
      { name: 'notes', label: 'Заметки', type: 'textarea', value: existing?.notes || '' }
    ], (data) => {
      const result = existing ? creditsService.update(id, data) : creditsService.add(data);
      this.ui.toast(result.message || (result.success ? 'Сохранено' : 'Ошибка'), result.success ? 'success' : 'error');
      if (result.success) this.refresh();
      return result;
    });
  }

  async payCredit(id) {
    const credit = creditsService.getById(id);
    if (!credit) return;
    await this.formDialog(`Платёж: ${credit.title}`, [
      { name: 'amount', label: 'Сумма', type: 'number', step: '0.01', value: credit.monthly_payment, required: true },
      { name: 'budget_category', label: 'Конверт', type: 'select', options: this.envelopeOptions(), required: true },
      { name: 'date', label: 'Дата', type: 'date', value: todayISO() }
    ], (data) => {
      const result = creditsService.pay(id, data.amount, data.budget_category, data.date);
      this.ui.toast(
        result.message || (result.success ? (result.closed ? 'Кредит закрыт' : 'Платёж проведён') : 'Ошибка'),
        result.success ? 'success' : 'error'
      );
      if (result.success) this.refresh();
      return result;
    });
  }

  async earlyPayCredit(id) {
    const credit = creditsService.getById(id);
    if (!credit) return;
    const balance = Number(credit.current_balance) || 0;
    if (!(balance > 0)) {
      this.ui.toast('Остаток уже нулевой', 'warning');
      return;
    }
    await this.formDialog(`Досрочное погашение: ${credit.title}`, [
      { name: 'amount', label: 'Сумма', type: 'number', step: '0.01', value: balance, required: true },
      { name: 'budget_category', label: 'Конверт', type: 'select', options: this.envelopeOptions(), required: true },
      { name: 'date', label: 'Дата', type: 'date', value: todayISO() }
    ], (data) => {
      const result = creditsService.pay(
        id,
        data.amount,
        data.budget_category,
        data.date,
        `Досрочное погашение «${credit.title}»`
      );
      this.ui.toast(
        result.message || (result.success ? (result.closed ? 'Кредит закрыт досрочно' : 'Платёж проведён') : 'Ошибка'),
        result.success ? 'success' : 'error'
      );
      if (result.success) this.refresh();
      return result;
    });
  }

  async deleteCredit(id) {
    if (!(await this.ui.confirm('Удалить кредит?', { danger: true }))) return;
    const result = creditsService.remove(id);
    this.ui.toast(result.message || (result.success ? 'Удалено' : 'Ошибка'), result.success ? 'success' : 'error');
    if (result.success) this.refresh();
  }

  async formUtility() {
    await this.formDialog('Коммунальная услуга', [
      { name: 'service', label: 'Услуга', type: 'select', options: utilitiesService.getServices(), required: true },
      { name: 'amount', label: 'Сумма', type: 'number', step: '0.01', required: true },
      { name: 'due_date', label: 'Срок оплаты', type: 'date', value: todayISO(), required: true },
      { name: 'comment', label: 'Комментарий', type: 'textarea' }
    ], (data) => {
      const result = utilitiesService.add(data);
      this.ui.toast(result.message || (result.success ? 'Добавлено' : 'Ошибка'), result.success ? 'success' : 'error');
      if (result.success) this.refresh();
      return result;
    });
  }

  async payUtility(id) {
    await this.formDialog('Оплата КУслуги', [
      { name: 'budget_category', label: 'Конверт', type: 'select', options: this.envelopeOptions(), required: true },
      { name: 'date', label: 'Дата', type: 'date', value: todayISO() }
    ], (data) => {
      const result = utilitiesService.pay(id, data.budget_category, data.date);
      this.ui.toast(result.message || (result.success ? 'Оплачено' : 'Ошибка'), result.success ? 'success' : 'error');
      if (result.success) this.refresh();
      return result;
    });
  }

  async deleteUtility(id) {
    if (!(await this.ui.confirm('Удалить услугу?', { danger: true }))) return;
    const result = utilitiesService.remove(id);
    this.ui.toast(result.message || (result.success ? 'Удалено' : 'Ошибка'), result.success ? 'success' : 'error');
    if (result.success) this.refresh();
  }

  async formGoal() {
    await this.formDialog('Новая цель', [
      { name: 'title', label: 'Название', required: true },
      { name: 'target', label: 'Цель (сумма)', type: 'number', step: '0.01', required: true },
      { name: 'saved', label: 'Уже накоплено', type: 'number', step: '0.01', value: 0 },
      { name: 'deadline', label: 'Дедлайн', type: 'date' },
      { name: 'icon', label: 'Иконка', value: '🎯' },
      { name: 'comment', label: 'Комментарий', type: 'textarea' }
    ], (data) => {
      const result = goalsService.add(data);
      this.ui.toast(result.message || (result.success ? 'Цель создана' : 'Ошибка'), result.success ? 'success' : 'error');
      if (result.success) this.refresh();
      return result;
    });
  }

  async contributeGoal(id) {
    await this.formDialog('Вклад в цель', [
      { name: 'amount', label: 'Сумма', type: 'number', step: '0.01', required: true },
      { name: 'budget_category', label: 'Конверт', type: 'select', options: this.envelopeOptions(), required: true },
      { name: 'date', label: 'Дата', type: 'date', value: todayISO() }
    ], (data) => {
      const result = goalsService.contribute(id, data.amount, data.budget_category, data.date);
      this.ui.toast(result.message || (result.success ? 'Вклад внесён' : 'Ошибка'), result.success ? 'success' : 'error');
      if (result.success) this.refresh();
      return result;
    });
  }

  async deleteGoal(id) {
    if (!(await this.ui.confirm('Удалить цель?', { danger: true }))) return;
    const result = goalsService.remove(id);
    this.ui.toast(result.message || (result.success ? 'Удалено' : 'Ошибка'), result.success ? 'success' : 'error');
    if (result.success) this.refresh();
  }

  shiftCalendar(delta) {
    if (!this.calendarCursor) return;
    let { year, monthIndex } = this.calendarCursor;
    monthIndex += delta;
    if (monthIndex < 0) { monthIndex = 11; year -= 1; }
    if (monthIndex > 11) { monthIndex = 0; year += 1; }
    this.calendarCursor = { year, monthIndex };
    this.refresh();
  }

  async formPlan() {
    const plan = analyticsService.getPlanFact();
    if (!plan) return;
    await this.formDialog('План месяца', [
      { name: 'planned_income', label: 'План дохода', type: 'number', step: '0.01', value: plan.income.planned },
      { name: 'planned_expense', label: 'План расхода', type: 'number', step: '0.01', value: plan.expense.planned },
      { name: 'planned_savings', label: 'План накоплений', type: 'number', step: '0.01', value: plan.savings.planned },
      { name: 'planned_credits', label: 'План по кредитам', type: 'number', step: '0.01', value: plan.credits.planned }
    ], (data) => {
      const result = analyticsService.updatePlan(data);
      this.ui.toast(result.message || (result.success ? 'План сохранён' : 'Ошибка'), result.success ? 'success' : 'error');
      if (result.success) this.refresh();
      return result;
    });
  }

  async comparePeriods() {
    const periods = budgetService.getAllPeriods();
    if (periods.length < 2) {
      this.ui.toast('Нужно минимум два периода', 'warning');
      return;
    }
    const options = periods.map((p) => ({ value: p.id, label: budgetService.formatPeriodTitle(p) }));
    await this.formDialog('Сравнение периодов', [
      { name: 'a', label: 'Период A', type: 'select', options, value: options[0].value },
      { name: 'b', label: 'Период B', type: 'select', options, value: options[1]?.value }
    ], async (data) => {
      const result = analyticsService.comparePeriods(data.a, data.b);
      if (!result.success) {
        this.ui.toast(result.message, 'error');
        return result;
      }
      await this.ui.modal({
        title: 'Результат сравнения',
        body: `
          <p><strong>${result.a.title}</strong>: доход ${result.a.summary.income}, расход ${result.a.summary.expenses}</p>
          <p><strong>${result.b.title}</strong>: доход ${result.b.summary.income}, расход ${result.b.summary.expenses}</p>
          <p>Δ доход: ${result.delta.income}, Δ расход: ${result.delta.expenses}, Δ накопления: ${result.delta.savings}</p>
        `,
        actions: [{ id: 'close', label: 'Закрыть', className: 'btn-primary' }]
      });
      return result;
    });
  }

  switchPeriod(periodId) {
    const result = budgetService.switchPeriod(periodId);
    this.ui.toast(result.message || (result.success ? 'Период переключён' : 'Ошибка'), result.success ? 'success' : 'error');
    if (result.success) {
      this.calendarCursor = null;
      this.navigate(this.page === 'archive' ? 'dashboard' : this.page);
    }
  }

  async openPeriodDialog() {
    const now = new Date();
    await this.formDialog('Открыть период', [
      { name: 'year', label: 'Год', type: 'number', value: now.getFullYear(), required: true },
      { name: 'month', label: 'Месяц', type: 'number', min: 1, value: now.getMonth() + 1, required: true }
    ], (data) => {
      const result = budgetService.openPeriod(Number(data.year), Number(data.month));
      this.ui.toast(result.message || (result.success ? 'Период открыт' : 'Ошибка'), result.success ? 'success' : 'error');
      if (result.success) this.refresh();
      return result;
    });
  }

  async closeMonth() {
    const period = storage.getCurrentPeriod();
    if (!period) return;
    const title = budgetService.formatPeriodTitle(period);
    if (!(await this.ui.confirm(
      `Закрыть месяц «${title}» и открыть следующий? Остатки перенесутся по правилам конвертов.`,
      { title: 'Закрытие месяца' }
    ))) return;

    const result = budgetService.closePeriod({ transferBalances: true });
    this.ui.toast(result.message || (result.success ? 'Месяц закрыт' : 'Ошибка'), result.success ? 'success' : 'error');
    if (result.success) {
      notificationService.add({
        title: 'Месяц закрыт',
        text: result.message || title,
        type: 'success'
      });
      this.calendarCursor = null;
      this.refresh();
    }
  }

  async unlockPeriod(id) {
    if (!(await this.ui.confirm('Разблокировать редактирование закрытого периода?'))) return;
    const result = budgetService.unlockPeriod(id);
    this.ui.toast(result.success ? 'Период разблокирован' : 'Ошибка', result.success ? 'success' : 'error');
    if (result.success) this.refresh();
  }

  async showNotifications() {
    const items = notificationService.getAll();
    const action = await this.ui.renderNotifications(items);
    if (action === 'read-all') {
      notificationService.markAllRead();
      this.ui.toast('Все уведомления прочитаны', 'success');
    }
    this.refreshChrome();
  }

  async importData() {
    const input = document.getElementById('import-file') || (() => {
      const el = document.createElement('input');
      el.type = 'file';
      el.accept = 'application/json,.json';
      el.id = 'import-file-temp';
      document.body.appendChild(el);
      return el;
    })();
    input.value = '';
    input.click();
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!(await this.ui.confirm('Импорт заменит все текущие данные. Продолжить?', { danger: true, title: 'Импорт данных' }))) return;
      const result = await settingsService.importJSON(file);
      this.ui.toast(result.message || (result.success ? 'Импортировано' : 'Ошибка'), result.success ? 'success' : 'error');
      if (result.success) {
        settingsService.applyTheme();
        this.currency = settingsService.get().currency || 'RUB';
        this.calendarCursor = null;
        this.navigate('dashboard');
      }
      if (input.id === 'import-file-temp') input.remove();
    };
  }

  async clearAll() {
    if (!(await this.ui.confirm(
      'Это удалит ВСЕ данные приложения без возможности восстановления (если нет резервной копии). Продолжить?',
      { danger: true, title: 'Очистить все данные' }
    ))) return;
    if (!(await this.ui.confirm('Точно очистить все данные?', { danger: true, title: 'Последнее предупреждение' }))) return;
    const result = settingsService.clearAll(true);
    this.ui.toast(result.message || 'Очищено', 'success');
    settingsService.applyTheme();
    this.calendarCursor = null;
    this.navigate('dashboard');
  }
}

const app = new App();

function boot() {
  if (!document.getElementById('app')) {
    console.error('Элемент #app не найден');
    return;
  }
  app.init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

export default app;
