/**
 * goals.js — финансовые цели
 */
import { storage } from './storage.js';
import { budgetService } from './budget.js';
import {
  generateId, parseAmount, percent, roundMoney, sortByDate, sumBy, todayISO, validateRequired
} from './utils.js';

export class GoalsService {
  getAll() {
    return sortByDate(storage.list('goals'), (g) => g.deadline || g.created_at, false);
  }

  getActive() {
    return this.getAll().filter((g) => g.status === 'active');
  }

  getById(id) {
    return storage.find('goals', id);
  }

  getProgress(goal) {
    const target = Number(goal.target) || 0;
    const saved = Number(goal.saved) || 0;
    return {
      saved,
      target,
      remaining: roundMoney(Math.max(0, target - saved)),
      progress: percent(saved, target)
    };
  }

  getTotalSaved() {
    return sumBy(this.getActive(), (g) => Number(g.saved) || 0);
  }

  getTotalTarget() {
    return sumBy(this.getActive(), (g) => Number(g.target) || 0);
  }

  getSummary() {
    return {
      items: this.getActive().map((g) => ({ ...g, ...this.getProgress(g) })),
      totalSaved: this.getTotalSaved(),
      totalTarget: this.getTotalTarget(),
      count: this.getActive().length
    };
  }

  validate(data) {
    const base = validateRequired(data, ['title', 'target']);
    const errors = { ...base.errors };
    if (!(parseAmount(data.target) > 0)) errors.target = 'Цель должна быть больше нуля';
    return { valid: Object.keys(errors).length === 0, errors };
  }

  add(data) {
    const validation = this.validate(data);
    if (!validation.valid) return { success: false, errors: validation.errors, message: 'Проверьте форму' };

    const row = {
      id: generateId(),
      title: String(data.title).trim(),
      target: roundMoney(parseAmount(data.target)),
      saved: roundMoney(parseAmount(data.saved || 0)),
      deadline: data.deadline || '',
      icon: String(data.icon || '🎯').trim() || '🎯',
      status: 'active',
      comment: String(data.comment || '').trim(),
      contributions: []
    };

    storage.batch((db) => {
      db.add('goals', row);
      db.add('history', {
        id: generateId(),
        type: 'goal',
        title: `Новая цель: ${row.title}`,
        amount: row.target,
        icon: row.icon,
        date: new Date().toISOString()
      });
    });

    return { success: true, data: row };
  }

  update(id, data) {
    const existing = this.getById(id);
    if (!existing) return { success: false, message: 'Цель не найдена' };
    const merged = { ...existing, ...data };
    const validation = this.validate(merged);
    if (!validation.valid) return { success: false, errors: validation.errors, message: 'Проверьте форму' };

    const updated = storage.update('goals', id, {
      title: String(merged.title).trim(),
      target: roundMoney(parseAmount(merged.target)),
      deadline: merged.deadline || '',
      icon: String(merged.icon || existing.icon).trim() || existing.icon,
      comment: String(merged.comment || '').trim()
    });
    return { success: true, data: updated };
  }

  contribute(goalId, amountValue, budgetCategoryId, date = todayISO()) {
    const goal = this.getById(goalId);
    if (!goal) return { success: false, message: 'Цель не найдена' };
    if (goal.status !== 'active') return { success: false, message: 'Цель не активна' };

    const amount = roundMoney(parseAmount(amountValue));
    if (!(amount > 0)) return { success: false, message: 'Сумма должна быть больше нуля' };

    const category = budgetService.getCategoryById(budgetCategoryId);
    if (!category) return { success: false, message: 'Конверт не найден' };
    const balance = budgetService.getCategoryBalance(category.id).balance;
    if (amount > balance) {
      return { success: false, message: `Недостаточно средств в «${category.name}»` };
    }

    const newSaved = roundMoney(Number(goal.saved) + amount);
    const completed = newSaved >= Number(goal.target);
    const contributions = [...(goal.contributions || []), {
      id: generateId(), amount, date, budget_category: budgetCategoryId
    }];

    storage.batch((db) => {
      db.update('goals', goalId, {
        saved: newSaved,
        contributions,
        status: completed ? 'completed' : 'active'
      });
      db.add('budgetTransactions', {
        id: generateId(),
        category_id: budgetCategoryId,
        amount: -amount,
        type: 'goal_contribution',
        date,
        comment: `Цель: ${goal.title}`,
        goal_id: goalId
      });
      db.add('history', {
        id: generateId(),
        type: 'goal',
        title: completed ? `Цель достигнута: ${goal.title}` : `Вклад в цель: ${goal.title}`,
        amount,
        description: category.name,
        icon: completed ? '🏆' : goal.icon,
        date: new Date().toISOString()
      });
    });

    return { success: true, completed };
  }

  remove(id) {
    const existing = this.getById(id);
    if (!existing) return { success: false, message: 'Цель не найдена' };
    storage.remove('goals', id);
    return { success: true };
  }
}

export const goalsService = new GoalsService();
export default goalsService;
