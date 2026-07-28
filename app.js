/**
 * app.js
 * Точка входа приложения «Личный финансовый кабинет».
 * Связывает бизнес-модули с интерфейсом и подпиской на Storage.
 */

import { storage } from './storage.js';
import { incomeService } from './income.js';
import { budgetService } from './budget.js';
import { expensesService } from './expenses.js';
import { creditsService } from './credits.js';
import { utilitiesService } from './utilities.js';
import { goalsService } from './goals.js';
import { notificationsService } from './notifications.js';
import { settingsService } from './settings.js';
import { UI } from './ui.js';

/**
 * Главный класс приложения.
 */
class FinanceApp {
  /**
   * Создаёт приложение и инициализирует UI.
   */
  constructor() {
    this.ui = new UI(this);
    this.unsubscribe = null;
  }

  /**
   * Запуск приложения.
   */
  start() {
    settingsService.init();
    this.ui.init();

    this.unsubscribe = storage.subscribe(() => {
      // Не вызываем refreshFromData здесь — иначе возможна повторная запись в storage.
      this.ui.refresh();
    });

    this.ui.navigate('dashboard');

    notificationsService.refreshFromData({
      credits: creditsService.getAll(),
      utilities: utilitiesService.getAll(),
      goals: goalsService.getAll()
    });
    this.ui.updateNotificationBadge();

    window.addEventListener('resize', () => {
      if (this.ui.currentPage === 'analytics') {
        this.ui.refresh();
      }
    });
  }

  /* ---------- Доходы ---------- */

  /**
   * Добавляет доход.
   * @param {object} data
   * @returns {object}
   */
  addIncome(data) {
    return incomeService.add(data);
  }

  /**
   * Обновляет доход.
   * @param {string} id
   * @param {object} data
   * @returns {object}
   */
  updateIncome(id, data) {
    return incomeService.update(id, data);
  }

  /**
   * Удаляет доход.
   * @param {string} id
   */
  deleteIncome(id) {
    const result = incomeService.remove(id);
    if (result.success) {
      this.ui.toast('Доход удалён', 'success');
    } else {
      this.ui.toast(result.message || 'Не удалось удалить', 'error');
    }
    this.ui.refresh();
  }

  /* ---------- Бюджет ---------- */

  /**
   * Распределяет доход по конвертам.
   * @param {string} incomeId
   * @param {Array} allocations
   * @returns {object}
   */
  distribute(incomeId, allocations) {
    return budgetService.distribute(incomeId, allocations);
  }

  /**
   * Перевод между конвертами.
   * @param {string} fromId
   * @param {string} toId
   * @param {number|string} amount
   * @param {string} comment
   * @returns {object}
   */
  transfer(fromId, toId, amount, comment) {
    return budgetService.transfer(fromId, toId, amount, comment);
  }

  /**
   * Создаёт конверт.
   * @param {object} data
   * @returns {object}
   */
  createCategory(data) {
    return budgetService.createCategory(data);
  }

  /**
   * Обновляет конверт.
   * @param {string} id
   * @param {object} data
   * @returns {object}
   */
  updateCategory(id, data) {
    return budgetService.updateCategory(id, data);
  }

  /**
   * Удаляет конверт.
   * @param {string} id
   */
  deleteCategory(id) {
    const result = budgetService.deleteCategory(id);
    if (result.success) {
      this.ui.toast('Конверт удалён', 'success');
    } else {
      this.ui.toast(result.message || 'Не удалось удалить', 'error');
    }
    this.ui.refresh();
  }

  /* ---------- Расходы ---------- */

  /**
   * Добавляет покупку.
   * @param {object} data
   * @returns {object}
   */
  addExpense(data) {
    return expensesService.add(data);
  }

  /**
   * Удаляет покупку.
   * @param {string} id
   */
  deleteExpense(id) {
    const result = expensesService.remove(id);
    if (result.success) {
      this.ui.toast('Покупка удалена', 'success');
    } else {
      this.ui.toast(result.message || 'Ошибка', 'error');
    }
    this.ui.refresh();
  }

  /* ---------- Кредиты ---------- */

  /**
   * Добавляет кредит.
   * @param {object} data
   * @returns {object}
   */
  addCredit(data) {
    return creditsService.add(data);
  }

  /**
   * Обновляет кредит.
   * @param {string} id
   * @param {object} data
   * @returns {object}
   */
  updateCredit(id, data) {
    return creditsService.update(id, data);
  }

  /**
   * Платёж по кредиту.
   * @param {string} id
   * @param {object} data
   * @returns {object}
   */
  payCredit(id, data) {
    return creditsService.makePayment(id, data);
  }

  /**
   * Закрывает кредит.
   * @param {string} id
   */
  closeCredit(id) {
    const result = creditsService.close(id);
    if (result.success) {
      this.ui.toast('Кредит закрыт', 'success');
    } else {
      this.ui.toast(result.message || 'Ошибка', 'error');
    }
    this.ui.refresh();
  }

  /**
   * Удаляет кредит.
   * @param {string} id
   */
  deleteCredit(id) {
    const result = creditsService.remove(id);
    if (result.success) {
      this.ui.toast('Кредит удалён', 'success');
    } else {
      this.ui.toast(result.message || 'Ошибка', 'error');
    }
    this.ui.refresh();
  }

  /* ---------- Коммуналка ---------- */

  /**
   * Создаёт записи коммунальных услуг на текущий месяц.
   */
  ensureUtilityMonth() {
    const result = utilitiesService.ensureMonthRecords();
    this.ui.toast(result.message || 'Готово', result.created ? 'success' : 'info');
    this.ui.refresh();
  }

  /**
   * Обновляет коммунальную запись.
   * @param {string} id
   * @param {object} data
   * @returns {object}
   */
  updateUtility(id, data) {
    return utilitiesService.update(id, data);
  }

  /**
   * Оплачивает коммунальную услугу.
   * @param {string} id
   * @param {object} data
   * @returns {object}
   */
  payUtility(id, data) {
    return utilitiesService.markPaid(id, data);
  }

  /**
   * Удаляет коммунальную запись.
   * @param {string} id
   */
  deleteUtility(id) {
    const result = utilitiesService.remove(id);
    if (result.success) {
      this.ui.toast('Запись удалена', 'success');
    } else {
      this.ui.toast(result.message || 'Ошибка', 'error');
    }
    this.ui.refresh();
  }

  /* ---------- Цели ---------- */

  /**
   * Создаёт цель.
   * @param {object} data
   * @returns {object}
   */
  addGoal(data) {
    return goalsService.add(data);
  }

  /**
   * Обновляет цель.
   * @param {string} id
   * @param {object} data
   * @returns {object}
   */
  updateGoal(id, data) {
    return goalsService.update(id, data);
  }

  /**
   * Пополняет цель.
   * @param {string} id
   * @param {object} data
   * @returns {object}
   */
  fundGoal(id, data) {
    return goalsService.contribute(id, data);
  }

  /**
   * Отмечает цель выполненной.
   * @param {string} id
   */
  completeGoal(id) {
    const result = goalsService.complete(id);
    if (result.success) {
      this.ui.toast('Цель выполнена', 'success');
    } else {
      this.ui.toast(result.message || 'Ошибка', 'error');
    }
    this.ui.refresh();
  }

  /**
   * Удаляет цель.
   * @param {string} id
   */
  deleteGoal(id) {
    const result = goalsService.remove(id);
    if (result.success) {
      this.ui.toast('Цель удалена', 'success');
    } else {
      this.ui.toast(result.message || 'Ошибка', 'error');
    }
    this.ui.refresh();
  }

  /* ---------- Настройки ---------- */

  /**
   * Импортирует JSON-файл.
   * @param {File} file
   */
  async importData(file) {
    const result = await settingsService.importData(file);
    if (result.success) {
      this.ui.toast(result.message, 'success');
      this.ui.navigate('dashboard');
    } else {
      this.ui.toast(result.message || 'Ошибка импорта', 'error');
    }
  }
}

/** Глобальный экземпляр приложения. */
const app = new FinanceApp();

document.addEventListener('DOMContentLoaded', () => {
  app.start();
});

export default app;
