/**
 * utilities.js
 * Коммунальные услуги: ежемесячные записи, статусы, статистика.
 */

import { storage } from './storage.js';
import { historyService } from './history.js';
import { budgetService } from './budget.js';
import {
  generateId,
  getMonthName,
  parseAmount,
  roundMoney,
  sortByDate,
  sumBy,
  todayISO,
  validateRequired
} from './utils.js';

/**
 * Сервис коммунальных платежей.
 */
export class UtilitiesService {
  /**
   * @param {import('./storage.js').Storage} [store]
   */
  constructor(store = storage) {
    this.store = store;
  }

  /**
   * Типы коммунальных услуг.
   * @returns {Array<object>}
   */
  getTypes() {
    return this.store.getCollection('utilityTypes');
  }

  /**
   * Все записи коммунальных платежей.
   * @returns {Array<object>}
   */
  getAll() {
    return sortByDate(
      this.store.getCollection('utilities'),
      (item) => item.dueDate || item.createdAt,
      true
    );
  }

  /**
   * Запись по ID.
   * @param {string} id
   * @returns {object|null}
   */
  getById(id) {
    return this.store.findById('utilities', id);
  }

  /**
   * Обогащённый список записей.
   * @returns {Array<object>}
   */
  getAllEnriched() {
    const types = this.getTypes();
    return this.getAll().map((item) => {
      const type = types.find((t) => t.id === item.typeId);
      return {
        ...item,
        typeName: type?.name || item.name || 'Услуга',
        typeIcon: type?.icon || '🏠',
        typeColor: type?.color || '#5B8DEF'
      };
    });
  }

  /**
   * Записи за конкретный месяц (YYYY-MM).
   * @param {string} monthKey Например "2026-07"
   * @returns {Array<object>}
   */
  getByMonthKey(monthKey) {
    return this.getAllEnriched().filter((item) => item.monthKey === monthKey);
  }

  /**
   * Текущий ключ месяца YYYY-MM.
   * @returns {string}
   */
  getCurrentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Создаёт набор записей на месяц для всех типов услуг (если ещё нет).
   * @param {string} [monthKey]
   * @returns {{ success: boolean, created: number, message?: string }}
   */
  ensureMonthRecords(monthKey = this.getCurrentMonthKey()) {
    const existing = this.getByMonthKey(monthKey);
    const existingTypeIds = new Set(existing.map((item) => item.typeId));
    const types = this.getTypes();
    let created = 0;

    const [year, month] = monthKey.split('-').map(Number);
    const dueDate = `${monthKey}-${String(Math.min(10, new Date(year, month, 0).getDate())).padStart(2, '0')}`;

    this.store.batch((store) => {
      types.forEach((type) => {
        if (existingTypeIds.has(type.id)) return;

        store.add('utilities', {
          id: generateId(),
          typeId: type.id,
          name: type.name,
          monthKey,
          amount: 0,
          dueDate,
          status: 'pending',
          paidAt: null,
          comment: '',
          receipt: '',
          envelopeId: null,
          createdAt: new Date().toISOString()
        }, false);
        created += 1;
      });
    });

    return {
      success: true,
      created,
      message: created
        ? `Создано записей: ${created} на ${getMonthName(month - 1)} ${year}`
        : 'Записи на этот месяц уже существуют'
    };
  }

  /**
   * Добавляет произвольную запись коммунального платежа.
   * @param {object} data
   * @returns {{ success: boolean, data?: object, errors?: object, message?: string }}
   */
  add(data) {
    const validation = validateRequired(data, ['typeId', 'amount', 'dueDate', 'monthKey']);
    if (!validation.valid) {
      return { success: false, errors: validation.errors, message: 'Проверьте заполнение формы' };
    }

    const type = this.getTypes().find((t) => t.id === data.typeId);
    if (!type) {
      return { success: false, message: 'Тип услуги не найден' };
    }

    const amount = roundMoney(parseAmount(data.amount));
    if (amount < 0) {
      return { success: false, message: 'Сумма не может быть отрицательной' };
    }

    const record = {
      id: generateId(),
      typeId: data.typeId,
      name: type.name,
      monthKey: data.monthKey,
      amount,
      dueDate: data.dueDate,
      status: data.status || 'pending',
      paidAt: data.paidAt || null,
      comment: String(data.comment || '').trim(),
      receipt: String(data.receipt || '').trim(),
      envelopeId: data.envelopeId || null,
      createdAt: new Date().toISOString()
    };

    this.store.add('utilities', record);

    historyService.add({
      type: 'utility',
      title: `Коммунальная услуга: ${type.name}`,
      description: `Период ${record.monthKey}`,
      amount: record.amount,
      meta: { utilityId: record.id },
      icon: type.icon
    });

    return { success: true, data: record };
  }

  /**
   * Обновляет запись (сумма, комментарий, квитанция и т.д.).
   * @param {string} id
   * @param {object} data
   * @returns {{ success: boolean, data?: object, message?: string }}
   */
  update(id, data) {
    const existing = this.getById(id);
    if (!existing) {
      return { success: false, message: 'Запись не найдена' };
    }

    if (existing.status === 'paid' && data.amount !== undefined) {
      const newAmount = roundMoney(parseAmount(data.amount));
      if (!Object.is(newAmount, Number(existing.amount))) {
        return { success: false, message: 'Нельзя менять сумму оплаченной записи' };
      }
    }

    const patch = {};
    if (data.amount !== undefined) patch.amount = roundMoney(parseAmount(data.amount));
    if (data.dueDate !== undefined) patch.dueDate = data.dueDate;
    if (data.comment !== undefined) patch.comment = String(data.comment).trim();
    if (data.receipt !== undefined) patch.receipt = String(data.receipt).trim();
    if (data.monthKey !== undefined) patch.monthKey = data.monthKey;

    const updated = this.store.update('utilities', id, patch);
    return { success: true, data: updated };
  }

  /**
   * Отмечает услугу как оплаченную, опционально списывая из конверта.
   * @param {string} id
   * @param {object} [data]
   * @returns {{ success: boolean, data?: object, message?: string }}
   */
  markPaid(id, data = {}) {
    const item = this.getById(id);
    if (!item) {
      return { success: false, message: 'Запись не найдена' };
    }
    if (item.status === 'paid') {
      return { success: false, message: 'Уже оплачено' };
    }

    const amount = roundMoney(parseAmount(data.amount ?? item.amount));
    if (!(amount > 0)) {
      return { success: false, message: 'Укажите сумму оплаты больше нуля' };
    }

    const envelopeId = data.envelopeId || item.envelopeId || null;
    if (envelopeId) {
      const balance = budgetService.getCategoryBalance(envelopeId).balance;
      if (amount > balance) {
        const envelope = budgetService.getCategoryById(envelopeId);
        return {
          success: false,
          message: `Недостаточно средств в конверте «${envelope?.name || ''}»`
        };
      }
    }

    const paidAt = data.paidAt || todayISO();

    this.store.batch((store) => {
      if (envelopeId) {
        const spend = budgetService.spendFromEnvelope({
          categoryId: envelopeId,
          amount,
          type: 'utility_payment',
          comment: `Оплата: ${item.name}`,
          date: paidAt,
          meta: { utilityId: id },
          autoSave: false
        });
        if (!spend.success) {
          throw new Error(spend.message);
        }
      }

      store.update('utilities', id, {
        amount,
        status: 'paid',
        paidAt,
        envelopeId,
        comment: data.comment !== undefined ? String(data.comment).trim() : item.comment,
        receipt: data.receipt !== undefined ? String(data.receipt).trim() : item.receipt
      }, false);

      historyService.add({
        type: 'utility',
        title: `Оплачено: ${item.name}`,
        description: `Период ${item.monthKey}`,
        amount,
        meta: { utilityId: id },
        icon: '🏠'
      }, false);
    });

    return { success: true, data: this.getById(id) };
  }

  /**
   * Снимает отметку оплаты (без автоматического возврата в конверт —
   * возврат делается отдельной корректировкой при необходимости).
   * @param {string} id
   * @returns {{ success: boolean, message?: string }}
   */
  markUnpaid(id) {
    const item = this.getById(id);
    if (!item) {
      return { success: false, message: 'Запись не найдена' };
    }

    this.store.update('utilities', id, {
      status: 'pending',
      paidAt: null
    });

    return { success: true };
  }

  /**
   * Удаляет запись.
   * @param {string} id
   * @returns {{ success: boolean, message?: string }}
   */
  remove(id) {
    const item = this.getById(id);
    if (!item) {
      return { success: false, message: 'Запись не найдена' };
    }

    this.store.remove('utilities', id);
    return { success: true };
  }

  /**
   * Статистика по типу услуги.
   * @param {string} typeId
   * @returns {object}
   */
  getStatsForType(typeId) {
    const paid = this.getAll()
      .filter((item) => item.typeId === typeId && item.status === 'paid' && Number(item.amount) > 0);

    const amounts = paid.map((item) => Number(item.amount));
    const total = sumBy(paid, (item) => Number(item.amount) || 0);
    const count = amounts.length;

    return {
      count,
      total,
      average: count ? roundMoney(total / count) : 0,
      max: count ? Math.max(...amounts) : 0,
      min: count ? Math.min(...amounts) : 0
    };
  }

  /**
   * Общая статистика за год / месяц.
   * @param {number} [year]
   * @returns {object}
   */
  getStats(year = new Date().getFullYear()) {
    const all = this.getAllEnriched().filter((item) => Number(item.amount) > 0);
    const yearItems = all.filter((item) => String(item.monthKey).startsWith(String(year)));
    const monthKey = this.getCurrentMonthKey();
    const monthItems = all.filter((item) => item.monthKey === monthKey);
    const paidYear = yearItems.filter((item) => item.status === 'paid');
    const paidMonth = monthItems.filter((item) => item.status === 'paid');

    const yearAmounts = paidYear.map((i) => Number(i.amount));
    const yearTotal = sumBy(paidYear, (i) => Number(i.amount) || 0);

    const byType = this.getTypes().map((type) => {
      const stats = this.getStatsForType(type.id);
      return {
        ...type,
        ...stats
      };
    });

    return {
      year,
      monthKey,
      yearTotal,
      yearAverage: yearAmounts.length ? roundMoney(yearTotal / yearAmounts.length) : 0,
      yearMax: yearAmounts.length ? Math.max(...yearAmounts) : 0,
      yearMin: yearAmounts.length ? Math.min(...yearAmounts) : 0,
      monthTotal: sumBy(paidMonth, (i) => Number(i.amount) || 0),
      monthPending: sumBy(
        monthItems.filter((i) => i.status === 'pending'),
        (i) => Number(i.amount) || 0
      ),
      byType,
      pendingCount: this.getAll().filter((i) => i.status === 'pending').length
    };
  }

  /**
   * Ближайшие неоплаченные платежи.
   * @param {number} [limit=5]
   * @returns {Array<object>}
   */
  getUpcoming(limit = 5) {
    return this.getAllEnriched()
      .filter((item) => item.status === 'pending' && Number(item.amount) > 0)
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        type: 'utility',
        title: item.typeName,
        subtitle: item.monthKey,
        amount: Number(item.amount) || 0,
        date: item.dueDate,
        icon: item.typeIcon
      }));
  }

  /**
   * Сводка для Dashboard.
   * @returns {object}
   */
  getSummary() {
    const stats = this.getStats();
    return {
      ...stats,
      upcoming: this.getUpcoming()
    };
  }
}

/** Единственный экземпляр сервиса коммунальных услуг. */
export const utilitiesService = new UtilitiesService();

export default utilitiesService;
