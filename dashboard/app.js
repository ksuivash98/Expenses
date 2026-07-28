/**
 * dashboard/app.js
 * Точка входа авторизованного приложения.
 */

import { authService } from '../services/AuthService.js';
import { databaseService } from '../services/DatabaseService.js';
import { syncService } from '../services/SyncService.js';
import { settingsService } from '../services/SettingsService.js';
import { profileService } from '../services/ProfileService.js';
import { notificationService } from '../services/NotificationService.js';
import { incomeService } from '../services/IncomeService.js';
import { budgetService } from '../services/BudgetService.js';
import { expenseService } from '../services/ExpenseService.js';
import { creditService } from '../services/CreditService.js';
import { utilityService } from '../services/UtilityService.js';
import { goalsService } from '../services/GoalsService.js';
import { periodService } from '../services/PeriodService.js';
import { AppUI } from '../components/AppUI.js';
import { isSupabaseConfigured } from '../config.js';

/**
 * Главное приложение личного кабинета.
 */
class FinanceApp {
  constructor() {
    this.ui = new AppUI(this);
  }

  /**
   * Запуск: проверка сессии → инициализация БД → UI.
   */
  async start() {
    if (!isSupabaseConfigured()) {
      window.location.href = 'auth/login.html';
      return;
    }

    const session = await authService.getSession();
    if (!session?.user) {
      window.location.href = 'auth/login.html';
      return;
    }

    authService.onAuthChange((event, nextSession) => {
      if (event === 'SIGNED_OUT' || !nextSession) {
        window.location.href = 'auth/login.html';
      }
    });

    await databaseService.init(session.user.id);
    await periodService.ensureBootstrapPeriod();
    settingsService.init();
    await profileService.touchLastLogin();
    syncService.start();

    await this.ui.init();
    this.ui.navigate('dashboard');

    await notificationService.refreshFromData();
    this.ui.updateNotificationBadge();
  }

  /* ---- mutations API for AppUI ---- */

  addIncome(data) { return incomeService.add(data); }
  updateIncome(id, data) { return incomeService.update(id, data); }
  async deleteIncome(id) {
    const result = await incomeService.remove(id);
    this._feedback(result, 'Доход удалён');
    return result;
  }

  distribute(incomeId, allocations) { return budgetService.distribute(incomeId, allocations); }
  transfer(fromId, toId, amount, comment) { return budgetService.transfer(fromId, toId, amount, comment); }
  createCategory(data) { return budgetService.createCategory(data); }
  updateCategory(id, data) { return budgetService.updateCategory(id, data); }
  async deleteCategory(id) {
    const result = await budgetService.deleteCategory(id);
    this._feedback(result, 'Конверт удалён');
    return result;
  }

  addExpense(data) { return expenseService.add(data); }
  async deleteExpense(id) {
    const result = await expenseService.remove(id);
    this._feedback(result, 'Покупка удалена');
    return result;
  }

  addCredit(data) { return creditService.add(data); }
  updateCredit(id, data) { return creditService.update(id, data); }
  payCredit(id, data) { return creditService.makePayment(id, data); }
  async closeCredit(id) {
    const result = await creditService.close(id);
    this._feedback(result, 'Кредит закрыт');
    return result;
  }
  async deleteCredit(id) {
    const result = await creditService.remove(id);
    this._feedback(result, 'Кредит удалён');
    return result;
  }

  async ensureUtilityMonth() {
    const result = await utilityService.ensureMonthRecords();
    this.ui.toast(result.message || 'Готово', result.created ? 'success' : 'info');
    this.ui.refresh();
    return result;
  }
  updateUtility(id, data) { return utilityService.update(id, data); }
  payUtility(id, data) { return utilityService.markPaid(id, data); }
  async deleteUtility(id) {
    const result = await utilityService.remove(id);
    this._feedback(result, 'Запись удалена');
    return result;
  }

  addGoal(data) { return goalsService.add(data); }
  updateGoal(id, data) { return goalsService.update(id, data); }
  fundGoal(id, data) { return goalsService.contribute(id, data); }
  async completeGoal(id) {
    const result = await goalsService.complete(id);
    this._feedback(result, 'Цель выполнена');
    return result;
  }
  async deleteGoal(id) {
    const result = await goalsService.remove(id);
    this._feedback(result, 'Цель удалена');
    return result;
  }

  async importData(file) {
    const result = await settingsService.importJSON(file);
    this.ui.toast(result.message || (result.success ? 'Импорт выполнен' : 'Ошибка'), result.success ? 'success' : 'error');
    if (result.success) this.ui.navigate('dashboard');
    return result;
  }

  async logout() {
    await databaseService.destroy();
    const result = await authService.signOut();
    window.location.href = 'auth/login.html';
    return result;
  }

  updateProfileName(name) { return profileService.updateName(name); }
  changePassword(password) { return profileService.changePassword(password); }
  changeAvatar(file) { return profileService.changeAvatar(file); }
  async deleteAccount() {
    const result = await profileService.deleteAccount();
    this.ui.toast(result.message || 'Готово', result.success ? 'success' : 'error');
    if (result.success) window.location.href = 'auth/login.html';
    return result;
  }

  /* ---- периоды ---- */
  switchPeriod(periodId) { return periodService.switchPeriod(periodId); }
  openPeriod(year, month, options) { return periodService.openPeriod(year, month, options); }
  closePeriod(periodId, options) { return periodService.closePeriod(periodId, options); }
  unlockPeriod(periodId, confirm) { return periodService.unlockEditing(periodId, confirm); }
  updatePlan(periodId, patch) { return periodService.updatePlan(periodId, patch); }
  updateCarryRule(categoryId, rule, max) { return periodService.updateCarryRule(categoryId, rule, max); }
  restoreArchive(periodId) { return periodService.restoreFromArchive(periodId); }
  archivePeriod(periodId) { return periodService.moveToArchive(periodId); }

  /**
   * @private
   */
  _feedback(result, successMessage) {
    if (result?.success) this.ui.toast(successMessage, 'success');
    else this.ui.toast(result?.message || 'Ошибка', 'error');
    this.ui.refresh();
  }
}

const app = new FinanceApp();
document.addEventListener('DOMContentLoaded', () => {
  app.start().catch((error) => {
    console.error(error);
    alert(error.message || 'Ошибка запуска приложения');
    window.location.href = 'auth/login.html';
  });
});

export default app;
