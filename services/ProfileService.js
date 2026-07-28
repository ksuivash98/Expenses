/**
 * services/ProfileService.js
 */
import { TABLES } from '../config.js';
import { databaseService } from './DatabaseService.js';
import { storageService } from './StorageService.js';
import { authService } from './AuthService.js';
import { incomeService } from './IncomeService.js';
import { expenseService } from './ExpenseService.js';
import { creditService } from './CreditService.js';
import { budgetService } from './BudgetService.js';

export class ProfileService {
  getProfile() {
    return databaseService.cache?.getProfile() || null;
  }

  getStats() {
    const capital = budgetService.getTotalAllocatedBalance() + incomeService.getFreeMoney();
    return {
      incomeCount: incomeService.getAll().length,
      expenseCount: expenseService.getAll().length,
      creditCount: creditService.getAll().length,
      totalCapital: capital
    };
  }

  async touchLastLogin() {
    const profile = this.getProfile();
    if (!profile) return null;
    return databaseService.upsertSingleton(TABLES.profiles, {
      ...profile,
      last_login_at: new Date().toISOString()
    });
  }

  async updateName(name) {
    const profile = this.getProfile();
    if (!profile) return { success: false, message: 'Профиль не найден' };
    const trimmed = String(name || '').trim();
    if (!trimmed) return { success: false, message: 'Укажите имя' };
    const updated = await databaseService.upsertSingleton(TABLES.profiles, {
      ...profile,
      name: trimmed
    });
    return { success: true, data: updated };
  }

  async changePassword(newPassword) {
    if (!newPassword || newPassword.length < 6) {
      return { success: false, message: 'Пароль не короче 6 символов' };
    }
    return authService.updatePassword(newPassword);
  }

  async changeAvatar(file) {
    const user = await authService.getUser();
    const profile = this.getProfile();
    if (!user || !profile) return { success: false, message: 'Нет сессии' };

    const upload = await storageService.uploadAvatar(user.id, file);
    if (!upload.success) return upload;

    if (profile.avatar) {
      await storageService.removeAvatar(user.id, profile.avatar);
    }

    const updated = await databaseService.upsertSingleton(TABLES.profiles, {
      ...profile,
      avatar: upload.url
    });
    return { success: true, data: updated };
  }

  async deleteAccount() {
    // Удаление пользователя требует service role; на клиенте — очистка данных + выход.
    // Для полного удаления аккаунта настройте Edge Function в Supabase.
    const snapshot = databaseService.getSnapshot();
    const tables = [
      TABLES.notifications, TABLES.history, TABLES.goals, TABLES.utilities,
      TABLES.creditPayments, TABLES.credits, TABLES.expenses,
      TABLES.budgetTransactions, TABLES.budgetCategories, TABLES.income
    ];

    for (const table of tables) {
      const rows = databaseService.list(table);
      for (const row of rows) {
        await databaseService.remove(table, row.id);
      }
    }

    await authService.signOut();
    return {
      success: true,
      message: 'Данные очищены и выполнен выход. Для полного удаления аккаунта используйте поддержку / Edge Function.'
    };
  }

  getProfileView(user) {
    const profile = this.getProfile();
    const stats = this.getStats();
    return {
      ...profile,
      email: user?.email || '',
      ...stats
    };
  }
}

export const profileService = new ProfileService();
export default profileService;
