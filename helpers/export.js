/**
 * helpers/export.js — экспорт JSON / CSV / PDF и импорт JSON
 */

import { downloadText, downloadBlob, formatDate } from './utils.js';
import { formatMoney } from './format.js';

/**
 * Сервис экспорта/импорта данных пользователя.
 */
export class ExportHelper {
  /**
   * Экспорт полного снимка в JSON.
   * @param {object} snapshot
   */
  exportJSON(snapshot) {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadText(
      `finance-backup-${stamp}.json`,
      JSON.stringify(snapshot, null, 2),
      'application/json'
    );
  }

  /**
   * Экспорт ключевых таблиц в CSV.
   * @param {object} snapshot
   * @param {string} [currency='RUB']
   */
  exportCSV(snapshot, currency = 'RUB') {
    const sections = [];

    sections.push(this._tableToCsv('income', [
      'title', 'source', 'amount', 'date', 'comment'
    ], snapshot.income || []));

    sections.push(this._tableToCsv('expenses', [
      'name', 'category', 'amount', 'date', 'store', 'comment'
    ], snapshot.expenses || []));

    sections.push(this._tableToCsv('credits', [
      'title', 'bank', 'initial_amount', 'current_balance', 'monthly_payment', 'status'
    ], snapshot.credits || []));

    sections.push(this._tableToCsv('goals', [
      'title', 'target', 'saved', 'deadline', 'status'
    ], snapshot.goals || []));

    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`finance-export-${stamp}.csv`, sections.join('\n\n'), 'text/csv;charset=utf-8');
  }

  /**
   * Преобразует массив объектов в CSV-блок.
   * @private
   */
  _tableToCsv(name, columns, rows) {
    const header = [`# ${name}`, columns.join(',')].join('\n');
    const body = rows.map((row) => columns.map((col) => this._csvEscape(row[col])).join(',')).join('\n');
    return `${header}\n${body}`;
  }

  /**
   * Экранирует значение для CSV.
   * @private
   */
  _csvEscape(value) {
    const str = value == null ? '' : String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  }

  /**
   * Простой PDF (текстовый) без сторонних библиотек.
   * @param {object} snapshot
   * @param {object} profile
   * @param {string} [currency='RUB']
   */
  exportPDF(snapshot, profile = {}, currency = 'RUB') {
    const lines = [
      'Личный финансовый кабинет',
      `Пользователь: ${profile.name || '—'}`,
      `Email: ${profile.email || '—'}`,
      `Дата отчёта: ${formatDate(new Date())}`,
      '',
      `Доходов: ${(snapshot.income || []).length}`,
      `Расходов: ${(snapshot.expenses || []).length}`,
      `Кредитов: ${(snapshot.credits || []).length}`,
      `Целей: ${(snapshot.goals || []).length}`,
      '',
      '--- Доходы ---',
      ...(snapshot.income || []).slice(0, 40).map((i) =>
        `${i.date} | ${i.title} | ${formatMoney(i.amount, currency)}`
      ),
      '',
      '--- Расходы ---',
      ...(snapshot.expenses || []).slice(0, 40).map((e) =>
        `${e.date} | ${e.name || e.category} | ${formatMoney(e.amount, currency)}`
      ),
      '',
      '--- Кредиты ---',
      ...(snapshot.credits || []).map((c) =>
        `${c.title} | остаток ${formatMoney(c.current_balance, currency)}`
      )
    ];

    const contentStreams = this._buildPdf(lines);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(`finance-report-${stamp}.pdf`, new Blob([contentStreams], { type: 'application/pdf' }));
  }

  /**
   * Минимальный одностраничный PDF.
   * @private
   * @param {string[]} lines
   * @returns {string}
   */
  _buildPdf(lines) {
    const escapePdf = (text) => String(text)
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');

    const content = [
      'BT',
      '/F1 11 Tf',
      '50 780 Td',
      '14 TL'
    ];

    lines.slice(0, 48).forEach((line, index) => {
      if (index === 0) {
        content.push(`(${escapePdf(line)}) Tj`);
      } else {
        content.push('T*');
        content.push(`(${escapePdf(line)}) Tj`);
      }
    });
    content.push('ET');

    const stream = content.join('\n');
    const objects = [];
    objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj');
    objects.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj');
    objects.push('3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj');
    objects.push(`4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream endobj`);
    objects.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj');

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((obj) => {
      offsets.push(pdf.length);
      pdf += `${obj}\n`;
    });
    const xrefPos = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i <= objects.length; i += 1) {
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
    pdf += `startxref\n${xrefPos}\n%%EOF`;
    return pdf;
  }

  /**
   * Парсит JSON-бэкап.
   * @param {string} jsonString
   * @returns {{ success: boolean, data?: object, message?: string }}
   */
  parseImportJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { success: false, message: 'Некорректный формат файла' };
      }
      return { success: true, data };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

export const exportHelper = new ExportHelper();
export default exportHelper;
