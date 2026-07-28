/**
 * services/GoalsService.js + Profile / Notification / Settings / Analytics / Calendar
 * Разнесены по файлам ниже — этот файл: цели.
 */
import { TABLES } from '../config.js';
import { databaseService } from './DatabaseService.js';
import { budgetService } from './BudgetService.js';
import {
  generateId, parseAmount, percent, roundMoney, sortByDate, sumBy,
  todayISO, validateRequired
} from '../helpers/utils.js';

export class GoalsService {
  getAll() {
    return sortByDate(databaseService.list(TABLES.goals), (g) => g.created_at || g.deadline, true);
  }

  getById(id) {
    return databaseService.find(TABLES.goals, id);
  }

  getActive() {
    return this.getAll().filter((g) => g.status === 'active');
  }

  enrich(goal) {
    const target = Number(goal.target) || 0;
    const saved = Number(goal.saved) || 0;
    return {
      ...goal,
      remaining: roundMoney(Math.max(0, target - saved)),
      progress: percent(saved, target),
      isCompleted: saved >= target && target > 0
    };
  }

  getAllEnriched() {
    return this.getAll().map((g) => this.enrich(g));
  }

  getTotalSaved() {
    return sumBy(this.getAll(), (g) => Number(g.saved) || 0);
  }

  getTotalTarget() {
    return sumBy(this.getActive(), (g) => Number(g.target) || 0);
  }

  getUpcomingDeadlines(limit = 5) {
    return this.getActive()
      .filter((g) => g.deadline)
      .map((g) => this.enrich(g))
      .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)))
      .slice(0, limit)
      .map((goal) => ({
        id: goal.id, type: 'goal', title: goal.title,
        subtitle: 'Осталось накопить', amount: goal.remaining,
        date: goal.deadline, icon: goal.icon || '🎯'
      }));
  }

  getSummary() {
    return {
      goals: this.getAllEnriched(),
      activeCount: this.getActive().length,
      totalSaved: this.getTotalSaved(),
      totalTarget: this.getTotalTarget(),
      upcoming: this.getUpcomingDeadlines()
    };
  }

  async add(data) {
    const validation = validateRequired(data, ['title', 'target']);
    if (!validation.valid) return { success: false, errors: validation.errors, message: 'Проверьте форму' };
    const target = roundMoney(parseAmount(data.target));
    if (!(target > 0)) return { success: false, message: 'Цель должна быть больше нуля' };

    const row = {
      id: generateId(),
      title: String(data.title).trim(),
      target,
      saved: roundMoney(parseAmount(data.saved || 0)),
      deadline: data.deadline || null,
      icon: String(data.icon || '🎯').trim() || '🎯',
      status: 'active',
      comment: String(data.comment || '').trim(),
      contributions: []
    };
    await databaseService.insert(TABLES.goals, row);
    await databaseService.insert(TABLES.history, {
      id: generateId(), type: 'goal_create', title: `Создана цель: ${row.title}`,
      amount: row.target, icon: row.icon, date: new Date().toISOString()
    });
    return { success: true, data: this.enrich(row) };
  }

  async update(id, data) {
    const existing = this.getById(id);
    if (!existing) return { success: false, message: 'Цель не найдена' };
    const target = roundMoney(parseAmount(data.target));
    if (!(target > 0)) return { success: false, message: 'Некорректная сумма' };
    const updated = await databaseService.update(TABLES.goals, id, {
      title: String(data.title).trim(),
      icon: String(data.icon || existing.icon || '🎯').trim(),
      target,
      deadline: data.deadline !== undefined ? data.deadline : existing.deadline,
      comment: data.comment !== undefined ? String(data.comment).trim() : existing.comment
    });
    return { success: true, data: this.enrich(updated) };
  }

  async contribute(goalId, data) {
    const goal = this.getById(goalId);
    if (!goal) return { success: false, message: 'Цель не найдена' };
    const amount = roundMoney(parseAmount(data.amount));
    if (!(amount > 0)) return { success: false, message: 'Сумма должна быть больше нуля' };
    const envelopeId = data.envelopeId || data.budget_category;
    if (!envelopeId) return { success: false, message: 'Выберите конверт' };
    const envelope = budgetService.getCategoryById(envelopeId);
    if (!envelope) return { success: false, message: 'Конверт не найден' };
    if (amount > budgetService.getCategoryBalance(envelopeId).balance) {
      return { success: false, message: `Недостаточно средств в «${envelope.name}»` };
    }

    const date = data.date || todayISO();
    const newSaved = roundMoney(Number(goal.saved) + amount);
    const completed = newSaved >= Number(goal.target);
    const contributions = [...(goal.contributions || []), {
      id: generateId(), amount, envelopeId, date, comment: String(data.comment || '').trim()
    }];

    await databaseService.batch(async (db) => {
      await db.insert(TABLES.budgetTransactions, {
        id: generateId(), category_id: envelopeId, amount: -amount,
        type: 'goal_contribution', date, comment: `Пополнение цели «${goal.title}»`
      });
      await db.update(TABLES.goals, goalId, {
        saved: newSaved, contributions,
        status: completed ? 'completed' : 'active'
      });
      await db.insert(TABLES.history, {
        id: generateId(), type: 'goal_fund', title: `Пополнение цели: ${goal.title}`,
        amount, icon: goal.icon || '🎯', date: new Date().toISOString()
      });
    });

    return { success: true, data: this.enrich(this.getById(goalId)) };
  }

  async complete(id) {
    const goal = this.getById(id);
    if (!goal) return { success: false, message: 'Цель не найдена' };
    await databaseService.update(TABLES.goals, id, { status: 'completed' });
    return { success: true };
  }

  async remove(id) {
    if (!this.getById(id)) return { success: false, message: 'Цель не найдена' };
    await databaseService.remove(TABLES.goals, id);
    return { success: true };
  }
}

export const goalsService = new GoalsService();
export default goalsService;
