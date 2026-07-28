/**
 * utils.js
 * Универсальные вспомогательные функции приложения.
 * Не содержат бизнес-логики и не обращаются к DOM напрямую,
 * за исключением утилитарных анимаций чисел.
 */

/**
 * Генерирует уникальный идентификатор записи.
 * @returns {string} Уникальный ID на основе времени и случайного числа.
 */
export function generateId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Возвращает текущую дату в формате YYYY-MM-DD.
 * @returns {string}
 */
export function todayISO() {
  return toISODate(new Date());
}

/**
 * Преобразует Date или строку даты в формат YYYY-MM-DD.
 * @param {Date|string|number} value
 * @returns {string}
 */
export function toISODate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return todayISO();
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Форматирует дату для отображения пользователю (DD.MM.YYYY).
 * @param {Date|string|number} value
 * @returns {string}
 */
export function formatDate(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Форматирует дату и время для истории (DD.MM.YYYY HH:MM).
 * @param {Date|string|number} value
 * @returns {string}
 */
export function formatDateTime(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${formatDate(date)} ${hours}:${minutes}`;
}

/**
 * Возвращает название месяца на русском языке.
 * @param {number} monthIndex Индекс месяца (0–11).
 * @param {boolean} [genitive=false] Родительный падеж.
 * @returns {string}
 */
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

/**
 * Возвращает короткое название дня недели.
 * @param {number} dayIndex Индекс дня (0–6, воскресенье = 0).
 * @returns {string}
 */
export function getWeekdayShort(dayIndex) {
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  return days[dayIndex] || '';
}

/**
 * Парсит число из строки с учётом пробелов и запятых.
 * @param {string|number} value
 * @returns {number}
 */
export function parseAmount(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const normalized = String(value)
    .replace(/\s/g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Округляет сумму до двух знаков после запятой.
 * @param {number} value
 * @returns {number}
 */
export function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Символы поддерживаемых валют.
 */
export const CURRENCY_SYMBOLS = {
  RUB: '₽',
  USD: '$',
  EUR: '€',
  KZT: '₸',
  BYN: 'Br'
};

/**
 * Форматирует денежную сумму с разделителями тысяч.
 * @param {number} amount
 * @param {string} [currency='RUB']
 * @param {boolean} [withSymbol=true]
 * @returns {string}
 */
export function formatMoney(amount, currency = 'RUB', withSymbol = true) {
  const value = roundMoney(amount);
  const absolute = Math.abs(value);
  const formatted = absolute
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    .replace('.00', '');
  const sign = value < 0 ? '−' : '';
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  return withSymbol ? `${sign}${formatted} ${symbol}` : `${sign}${formatted}`;
}

/**
 * Склоняет русское существительное по числу.
 * @param {number} count
 * @param {[string, string, string]} forms Формы: 1, 2, 5.
 * @returns {string}
 */
export function pluralize(count, forms) {
  const n = Math.abs(Math.trunc(count)) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

/**
 * Безопасное экранирование HTML-строки.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Глубокое клонирование простого JSON-совместимого объекта.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Сравнивает два числа с допуском для денежных сумм.
 * @param {number} a
 * @param {number} b
 * @param {number} [epsilon=0.01]
 * @returns {boolean}
 */
export function moneyEquals(a, b, epsilon = 0.01) {
  return Math.abs(roundMoney(a) - roundMoney(b)) < epsilon;
}

/**
 * Возвращает первый и последний день месяца.
 * @param {number} year
 * @param {number} month Индекс месяца 0–11.
 * @returns {{ start: string, end: string }}
 */
export function getMonthBounds(year, month) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return {
    start: toISODate(start),
    end: toISODate(end)
  };
}

/**
 * Проверяет, попадает ли дата в указанный диапазон (включительно).
 * @param {string} dateISO
 * @param {string} startISO
 * @param {string} endISO
 * @returns {boolean}
 */
export function isDateInRange(dateISO, startISO, endISO) {
  return dateISO >= startISO && dateISO <= endISO;
}

/**
 * Возвращает количество дней в месяце.
 * @param {number} year
 * @param {number} month
 * @returns {number}
 */
export function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Добавляет месяцы к дате.
 * @param {Date|string} date
 * @param {number} months
 * @returns {string} Дата в формате YYYY-MM-DD.
 */
export function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) {
    d.setDate(0);
  }
  return toISODate(d);
}

/**
 * Вычисляет процент с ограничением 0–100.
 * @param {number} part
 * @param {number} total
 * @returns {number}
 */
export function percent(part, total) {
  if (!total || total === 0) return 0;
  const value = (part / total) * 100;
  return Math.max(0, Math.min(100, roundMoney(value)));
}

/**
 * Группирует массив объектов по ключу.
 * @template T
 * @param {T[]} items
 * @param {function(T): string} keyFn
 * @returns {Object.<string, T[]>}
 */
export function groupBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

/**
 * Суммирует числовое поле массива объектов.
 * @template T
 * @param {T[]} items
 * @param {function(T): number} valueFn
 * @returns {number}
 */
export function sumBy(items, valueFn) {
  return roundMoney(items.reduce((sum, item) => sum + (valueFn(item) || 0), 0));
}

/**
 * Сортирует массив по дате (новые сверху по умолчанию).
 * @template T
 * @param {T[]} items
 * @param {function(T): string|number|Date} dateFn
 * @param {boolean} [desc=true]
 * @returns {T[]}
 */
export function sortByDate(items, dateFn, desc = true) {
  return [...items].sort((a, b) => {
    const da = new Date(dateFn(a)).getTime();
    const db = new Date(dateFn(b)).getTime();
    return desc ? db - da : da - db;
  });
}

/**
 * Debounce-обёртка для частых событий.
 * @param {Function} fn
 * @param {number} delay
 * @returns {Function}
 */
export function debounce(fn, delay = 250) {
  let timer = null;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Анимирует изменение числового значения в DOM-элементе.
 * @param {HTMLElement} element
 * @param {number} targetValue
 * @param {object} [options]
 * @param {number} [options.duration=700]
 * @param {string} [options.currency='RUB']
 * @param {function(number): string} [options.formatter]
 */
export function animateNumber(element, targetValue, options = {}) {
  if (!element) return;

  const {
    duration = 700,
    currency = 'RUB',
    formatter = (value) => formatMoney(value, currency)
  } = options;

  const startValue = parseAmount(element.dataset.rawValue || element.textContent || 0);
  const endValue = roundMoney(targetValue);
  element.dataset.rawValue = String(endValue);

  if (startValue === endValue) {
    element.textContent = formatter(endValue);
    return;
  }

  const startTime = performance.now();

  /**
   * Кадр анимации числа.
   * @param {number} now
   */
  function frame(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = startValue + (endValue - startValue) * eased;
    element.textContent = formatter(current);
    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      element.textContent = formatter(endValue);
    }
  }

  requestAnimationFrame(frame);
}

/**
 * Создаёт DOM-элемент с классами и атрибутами.
 * @param {string} tag
 * @param {object} [props]
 * @param {...(Node|string|null|undefined)} children
 * @returns {HTMLElement}
 */
export function createElement(tag, props = {}, ...children) {
  const el = document.createElement(tag);

  Object.entries(props).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) return;
    if (key === 'className') {
      el.className = value;
    } else if (key === 'dataset' && typeof value === 'object') {
      Object.entries(value).forEach(([dataKey, dataValue]) => {
        el.dataset[dataKey] = String(dataValue);
      });
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'html') {
      el.innerHTML = value;
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  });

  children.flat().forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    if (typeof child === 'string' || typeof child === 'number') {
      el.appendChild(document.createTextNode(String(child)));
    } else {
      el.appendChild(child);
    }
  });

  return el;
}

/**
 * Скачивает текстовый файл в браузере.
 * @param {string} filename
 * @param {string} content
 * @param {string} [mimeType='application/json']
 */
export function downloadFile(filename, content, mimeType = 'application/json') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Читает файл как текст через FileReader.
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsText(file, 'UTF-8');
  });
}

/**
 * Валидирует обязательные поля формы.
 * @param {Object.<string, *>} fields Карта имя → значение.
 * @param {string[]} required Список обязательных ключей.
 * @returns {{ valid: boolean, errors: Object.<string, string> }}
 */
export function validateRequired(fields, required) {
  const errors = {};
  required.forEach((key) => {
    const value = fields[key];
    if (value === null || value === undefined || String(value).trim() === '') {
      errors[key] = 'Обязательное поле';
    }
  });
  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Возвращает цвет с заданной прозрачностью из HEX.
 * @param {string} hex
 * @param {number} alpha 0–1
 * @returns {string} rgba(...)
 */
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

/**
 * Палитра цветов по умолчанию для категорий и диаграмм.
 */
export const DEFAULT_COLORS = [
  '#5B8DEF',
  '#36C6A0',
  '#F5A524',
  '#F31260',
  '#9353D3',
  '#00B7C3',
  '#FF6B6B',
  '#7CFFB2',
  '#FFB347',
  '#6C8CFF'
];

/**
 * Возвращает следующий цвет из палитры по индексу.
 * @param {number} index
 * @returns {string}
 */
export function colorByIndex(index) {
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}
