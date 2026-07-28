/**
 * goals.js
 * Финансовые цели: создание, пополнение из конвертов, прогресс.
 */

import { storage } from './storage.js';
import { historyService } from './history.js';
import { budgetService } from './budget.js';
import {
  generateId,
  parseAmount,
  percent,
  roundMoney,
  sortByDate,
  sumBy,
  todayISO,
  validateRequired
} from './utils.js';

/**
 * Сервис финансовых целей.
 */
export class GoalsService {
  /**
   * @param {import('./storage.js').Storage} [store]
   */
  constructor(store = storage) {
    this.store = store;
  }

  /**
   * Все цели.
   * @returns {Array<object>}
   */
  getAll() {
    return sortByDate(
      this.store.getCollection('goals'),
      (item) => item.createdAt || item.deadline,
      true
    );
  }

  /**
   * Цель по ID.
   * @param {string} id
   * @returns {object|null}
   */
  getById(id) {
    return this.store.findById('goals', id);
  }

  /**
   * Активные цели.
   * @returns {Array<object>}
   */
  getActive() {
    return this.getAll().filter((goal) => goal.status === 'active');
  }

  /**
   * Обогащает цель вычисляемыми полями.
   * @param {object} goal
   * @returns {object}
   */
  enrich(goal) {
    const target = Number(goal.targetAmount) || 0;
    const saved = Number(goal.savedAmount) || 0;
    const remaining = roundMoney(Math.max(0, target - saved));

    return {
      ...goal,
      remaining,
      progress: percent(saved, target),
      isCompleted: saved >= target && target > 0
    };
  }

  /**
   * Список целей с прогрессом.
   * @returns {Array<object>}
   */
  getAllEnriched() {
    return this.getAll().map((goal) => this.enrich(goal));
  }

  /**
   * Общая сумма накоплений по целям.
   * @returns {number}
   */
  getTotalSaved() {
    return sumBy(this.getAll(), (goal) => Number(goal.savedAmount) || 0);
  }

  /**
   * Общая целевая сумма активных целей.
   * @returns {number}
   */
  getTotalTarget() {
    return sumBy(this.getActive(), (goal) => Number(goal.targetAmount) || 0);
  }

  /**
   * Валидация цели.
   * @param {object} data
   * @returns {{ valid: boolean, errors: Object.<string, string> }}
   */
  validate(data) {
    const base = validateRequired(data, ['name', 'targetAmount']);
    const errors = { ...base.errors };
    const target = parseAmount(data.targetAmount);

    if (!(target > 0)) {
      errors.targetAmount = 'Целевая сумма должна быть больше нуля';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors
    };
  }

  /**
   * Создаёт финансовую цель.
   * @param {object} data
   * @returns {{ success: boolean, data?: object, errors?: object, message?: string }}
   */
  add(data) {
    const validation = this.validate(data);
    if (!validation.valid) {
      return { success: false, errors: validation.errors, message: 'Проверьте заполнение формы' };
    }

    const record = {
      id: generateId(),
      name: String(data.name).trim(),
      icon: String(data.icon || '🎯').trim() || '🎯',
      targetAmount: roundMoney(parseAmount(data.targetAmount)),
      savedAmount: roundMoney(parseAmount(data.savedAmount || 0)),
      deadline: data.deadline || null,
      comment: String(data.comment || '').trim(),
      status: 'active',
      contributions: [],
      createdAt: new Date().toISOString()
    };

    this.store.batch((store) => {
      store.add('goals', record, false);
      historyService.add({
        type: 'goal_create',
        title: `Создана цель: ${record.name}`,
        description: record.comment || `Цель ${record.targetAmount}`,
        amount: record.targetAmount,
        meta: { goalId: record.id },
        icon: record.icon
      }, false);
    });

    return { success: true, data: this.enrich(record) };
  }

  /**
   * Обновляет параметры цели.
   * @param {string} id
   * @param {object} data
   * @returns {{ success: boolean, data?: object, errors?: object, message?: string }}
   */
  update(id, data) {
    const existing = this.getById(id);
    if (!existing) {
      return { success: false, message: 'Цель не найдена' };
    }

    const validation = this.validate({ ...existing, ...data });
    if (!validation.valid) {
      return { success: false, errors: validation.errors, message: 'Проверьте заполнение формы' };
    }

    const targetAmount = roundMoney(parseAmount(data.targetAmount));
    const savedAmount = Number(existing.savedAmount) || 0;

    const updated = this.store.update('goals', id, {
      name: String(data.name).trim(),
      icon: String(data.icon || existing.icon || '🎯').trim(),
      targetAmount,
      deadline: data.deadline !== undefined ? data.deadline : existing.deadline,
      comment: data.comment !== undefined ? String(data.comment).trim() : existing.comment,
      status: savedAmount >= targetAmount ? 'completed' : existing.status === 'completed' && savedAmount < targetAmount
        ? 'active'
        : existing.status
    });

    return { success: true, data: this.enrich(updated) };
  }

  /**
   * Пополняет цель из выбранного конверта.
   * @param {string} goalId
   * @param {object} data
   * @returns {{ success: boolean, data?: object, message?: string }}
   */
  contribute(goalId, data) {
    const goal = this.getById(goalId);
    if (!goal) {
      return { success: false, message: 'Цель не найдена' };
    }
    if (goal.status === 'cancelled') {
      return { success: false, message: 'Цель отменена' };
    }

    const amount = roundMoney(parseAmount(data.amount));
    if (!(amount > 0)) {
      return { success: false, message: 'Сумма должна быть больше нуля' };
    }

    const envelopeId = data.envelopeId;
    if (!envelopeId) {
      return { success: false, message: 'Выберите конверт для списания' };
    }

    const envelope = budgetService.getCategoryById(envelopeId);
    if (!envelope) {
      return { success: false, message: 'Конверт не найден' };
    }

    const balance = budgetService.getCategoryBalance(envelopeId).balance;
    if (amount > balance) {
      return {
        success: false,
        message: `Недостаточно средств в конверте «${envelope.name}» (доступно ${balance})`
      };
    }

    const date = data.date || todayISO();
    const contributionId = generateId();
    const newSaved = roundMoney(Number(goal.savedAmount) + amount);
    const completed = newSaved >= Number(goal.targetAmount);

    this.store.batch((store) => {
      const spend = budgetService.spendFromEnvelope({
        categoryId: envelopeId,
        amount,
        type: 'goal_contribution',
        comment: `Пополнение цели «${goal.name}»`,
        date,
        meta: { goalId, contributionId },
        autoSave: false
      });

      if (!spend.success) {
        throw new Error(spend.message);
      }

      const contributions = [...(goal.contributions || []), {
        id: contributionId,
        amount,
        envelopeId,
        date,
        comment: String(data.comment || '').trim(),
        transactionId: spend.transaction.id
      }];

      store.update('goals', goalId, {
        savedAmount: newSaved,
        contributions,
        status: completed ? 'completed' : 'active',
        completedAt: completed ? new Date().toISOString() : goal.completedAt || null
      }, false);

      historyService.add({
        type: 'goal_fund',
        title: `Пополнение цели: ${goal.name}`,
        description: `Из конверта «${envelope.name}»`,
        amount,
        meta: { goalId, envelopeId, contributionId },
        icon: goal.icon || '🎯'
      }, false);

      if (completed) {
        historyService.add({
          type: 'goal_complete',
          title: `Цель достигнута: ${goal.name}`,
          description: 'Поздравляем!',
          amount: newSaved,
          meta: { goalId },
          icon: '🏆'
        }, false);
      }
    });

    return { success: true, data: this.enrich(this.getById(goalId)) };
  }

  /**
   * Отмечает цель выполненной вручную.
   * @param {string} id
   * @returns {{ success: boolean, message?: string }}
   */
  complete(id) {
    const goal = this.getById(id);
    if (!goal) {
      return { success: false, message: 'Цель не найдена' };
    }

    this.store.batch((store) => {
      store.update('goals', id, {
        status: 'completed',
        completedAt: new Date().toISOString()
      }, false);

      historyService.add({
        type: 'goal_complete',
        title: `Цель отмечена выполненной: ${goal.name}`,
        amount: Number(goal.savedAmount) || 0,
        meta: { goalId: id },
        icon: '🏆'
      }, false);
    });

    return { success: true };
  }

  /**
   * Удаляет цель.
   * @param {string} id
   * @returns {{ success: boolean, message?: string }}
   */
  remove(id) {
    const goal = this.getById(id);
    if (!goal) {
      return { success: false, message: 'Цель не найдена' };
    }

    this.store.batch((store) => {
      store.remove('goals', id, false);
      historyService.add({
        type: 'goal_create',
        title: `Удалена цель: ${goal.name}`,
        amount: Number(goal.savedAmount) || 0,
        meta: { goalId: id },
        icon: '🎯'
      }, false);
    });

    return { success: true };
  }

  /**
   * Ближайшие дедлайны целей.
   * @param {number} [limit=5]
   * @returns {Array<object>}
   */
  getUpcomingDeadlines(limit = 5) {
    return this.getActive()
      .filter((goal) => goal.deadline)
      .map((goal) => this.enrich(goal))
      .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)))
      .slice(0, limit)
      .map((goal) => ({
        id: goal.id,
        type: 'goal',
        title: goal.name,
        subtitle: `Осталось ${goal.remaining}`,
        amount: goal.remaining,
        date: goal.deadline,
        icon: goal.icon || '🎯'
      }));
  }

  /**
   * Сводка для Dashboard.
   * @returns {object}
   */
  getSummary() {
    const goals = this.getAllEnriched();
    return {
      goals,
      activeCount: this.getActive().length,
      totalSaved: this.getTotalSaved(),
      totalTarget: this.getTotalTarget(),
      upcoming: this.getUpcomingDeadlines()
    };
  }
}

/** Единственный экземпляр сервиса целей. */
export const goalsService = new GoalsService();

export default goalsService;
