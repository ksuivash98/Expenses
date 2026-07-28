/**
 * utils.js — вспомогательные функции
 */

export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function toISODate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return todayISO();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ru-RU');
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export function getMonthName(monthIndex, genitive = false) {
  const nominative = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];
  const genitiveList = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  return (genitive ? genitiveList : nominative)[monthIndex] || '';
}

export function getWeekdayShort(dayIndex) {
  return ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][dayIndex] || '';
}

export function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

export function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return toISODate(d);
}

export function getMonthBounds(year, month) {
  return {
    start: toISODate(new Date(year, month, 1)),
    end: toISODate(new Date(year, month + 1, 0))
  };
}

export function isDateInRange(dateISO, startISO, endISO) {
  return dateISO >= startISO && dateISO <= endISO;
}

export function parseAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === '') return 0;
  const normalized = String(value).replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function moneyEquals(a, b, epsilon = 0.01) {
  return Math.abs(roundMoney(a) - roundMoney(b)) < epsilon;
}

export function percent(part, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, roundMoney((part / total) * 100)));
}

export function sumBy(items, fn) {
  return roundMoney((items || []).reduce((s, i) => s + (fn(i) || 0), 0));
}

export function sortByDate(items, dateFn, desc = true) {
  return [...(items || [])].sort((a, b) => {
    const da = new Date(dateFn(a)).getTime();
    const db = new Date(dateFn(b)).getTime();
    return desc ? db - da : da - db;
  });
}

export function groupBy(items, keyFn) {
  return (items || []).reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function validateRequired(fields, required) {
  const errors = {};
  required.forEach((key) => {
    const value = fields[key];
    if (value === null || value === undefined || String(value).trim() === '') {
      errors[key] = 'Обязательное поле';
    }
  });
  return { valid: Object.keys(errors).length === 0, errors };
}

export const CURRENCY_SYMBOLS = {
  RUB: '₽', USD: '$', EUR: '€', KZT: '₸', BYN: 'Br'
};

export function formatMoney(amount, currency = 'RUB', withSymbol = true) {
  const value = roundMoney(amount);
  const absolute = Math.abs(value);
  const formatted = absolute.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ').replace('.00', '');
  const sign = value < 0 ? '−' : '';
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  return withSymbol ? `${sign}${formatted} ${symbol}` : `${sign}${formatted}`;
}

export function downloadText(filename, content, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsText(file, 'UTF-8');
  });
}

export function animateNumber(element, targetValue, options = {}) {
  if (!element) return;
  const { duration = 700, currency = 'RUB' } = options;
  const startValue = Number(element.dataset.rawValue || 0);
  const endValue = roundMoney(targetValue);
  element.dataset.rawValue = String(endValue);
  const startTime = performance.now();
  const formatter = options.formatter || ((v) => formatMoney(v, currency));

  function frame(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - (1 - progress) ** 3;
    element.textContent = formatter(startValue + (endValue - startValue) * eased);
    if (progress < 1) requestAnimationFrame(frame);
    else element.textContent = formatter(endValue);
  }
  requestAnimationFrame(frame);
}

export const DEFAULT_COLORS = [
  '#5B8DEF', '#36C6A0', '#F5A524', '#F31260', '#9353D3',
  '#00B7C3', '#FF6B6B', '#7CFFB2', '#FFB347', '#6C8CFF'
];

export function colorByIndex(index) {
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

export function hexToRgba(hex, alpha = 1) {
  const clean = String(hex || '#888888').replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((ch) => ch + ch).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const PERIOD_STATUS_LABELS = {
  current: 'Текущий',
  future: 'Будущий',
  closed: 'Закрытый',
  archive: 'Архивный'
};

export const CARRY_RULE_LABELS = {
  always: 'Всегда переносить остаток',
  balance: 'Переносить остаток',
  zero: 'Обнулять',
  max: 'Переносить максимум',
  never: 'Не переносить'
};
