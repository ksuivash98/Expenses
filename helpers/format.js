/**
 * helpers/format.js — форматирование денег и валют
 */

export const CURRENCY_SYMBOLS = {
  RUB: '₽',
  USD: '$',
  EUR: '€',
  KZT: '₸',
  BYN: 'Br'
};

/**
 * Форматирует денежную сумму.
 * @param {number} amount
 * @param {string} [currency='RUB']
 * @param {boolean} [withSymbol=true]
 * @returns {string}
 */
export function formatMoney(amount, currency = 'RUB', withSymbol = true) {
  const value = Math.round((Number(amount) || 0) * 100) / 100;
  const absolute = Math.abs(value);
  const formatted = absolute
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    .replace('.00', '');
  const sign = value < 0 ? '−' : '';
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  return withSymbol ? `${sign}${formatted} ${symbol}` : `${sign}${formatted}`;
}
