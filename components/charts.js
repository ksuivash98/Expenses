/**
 * charts.js
 * Р”РёР°РіСЂР°РјРјС‹ РЅР° Canvas API: РєСЂСѓРіРѕРІС‹Рµ, РєРѕР»СЊС†РµРІС‹Рµ, СЃС‚РѕР»Р±С‡Р°С‚С‹Рµ, Р»РёРЅРµР№РЅС‹Рµ.
 */

import { colorByIndex, hexToRgba, DEFAULT_COLORS } from '../helpers/utils.js';
import { formatMoney } from '../helpers/format.js';

/**
 * РЈС‚РёР»РёС‚С‹ Рё РѕС‚СЂРёСЃРѕРІРєР° РіСЂР°С„РёРєРѕРІ.
 */
export class ChartsService {
  /**
   * РџРѕРґРіРѕРЅСЏРµС‚ СЂР°Р·РјРµСЂ canvas РїРѕРґ CSS-СЂР°Р·РјРµСЂ Рё devicePixelRatio.
   * @param {HTMLCanvasElement} canvas
   * @returns {{ ctx: CanvasRenderingContext2D, width: number, height: number }}
   */
  prepareCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(rect.width || canvas.clientWidth || 300, 100);
    const height = Math.max(rect.height || canvas.clientHeight || 220, 100);

    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    return { ctx, width, height };
  }

  /**
   * РќРѕСЂРјР°Р»РёР·СѓРµС‚ РЅР°Р±РѕСЂ РґР°РЅРЅС‹С… РґР»СЏ РґРёР°РіСЂР°РјРј.
   * @param {Array<{ label: string, value: number, color?: string }>} items
   * @returns {Array<object>}
   */
  normalizeData(items = []) {
    return items
      .map((item, index) => ({
        label: item.label || `Р­Р»РµРјРµРЅС‚ ${index + 1}`,
        value: Math.max(0, Number(item.value) || 0),
        color: item.color || colorByIndex(index)
      }))
      .filter((item) => item.value > 0);
  }

  /**
   * Р РёСЃСѓРµС‚ РєРѕР»СЊС†РµРІСѓСЋ (donut) РґРёР°РіСЂР°РјРјСѓ.
   * @param {HTMLCanvasElement} canvas
   * @param {Array<object>} items
   * @param {object} [options]
   */
  drawDonut(canvas, items, options = {}) {
    const data = this.normalizeData(items);
    const { ctx, width, height } = this.prepareCanvas(canvas);
    const {
      currency = 'RUB',
      centerLabel = 'РС‚РѕРіРѕ',
      animate = true,
      thickness = 0.42
    } = options;

    if (!data.length) {
      this.drawEmpty(ctx, width, height, 'РќРµС‚ РґР°РЅРЅС‹С…');
      return;
    }

    const total = data.reduce((sum, item) => sum + item.value, 0);
    const cx = width / 2;
    const cy = height / 2 - 4;
    const radius = Math.min(width, height) * 0.36;
    const inner = radius * (1 - thickness);

    const draw = (progress = 1) => {
      ctx.clearRect(0, 0, width, height);
      let start = -Math.PI / 2;

      data.forEach((item) => {
        const slice = (item.value / total) * Math.PI * 2 * progress;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, start, start + slice);
        ctx.arc(cx, cy, inner, start + slice, start, true);
        ctx.closePath();
        ctx.fillStyle = item.color;
        ctx.fill();
        start += slice;
      });

      ctx.beginPath();
      ctx.arc(cx, cy, inner - 1, 0, Math.PI * 2);
      ctx.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--chart-center')
        .trim() || 'rgba(12, 18, 34, 0.92)';
      ctx.fill();

      ctx.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--text-primary')
        .trim() || '#fff';
      ctx.textAlign = 'center';
      ctx.font = '600 12px Manrope, sans-serif';
      ctx.fillText(centerLabel, cx, cy - 6);
      ctx.font = '700 16px Manrope, sans-serif';
      ctx.fillText(formatMoney(total * progress, currency), cx, cy + 14);
    };

    if (!animate) {
      draw(1);
      return;
    }

    const startTime = performance.now();
    const duration = 800;

    const frame = (now) => {
      const p = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      draw(eased);
      if (p < 1) requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  }

  /**
   * Р РёСЃСѓРµС‚ РєСЂСѓРіРѕРІСѓСЋ РґРёР°РіСЂР°РјРјСѓ (pie).
   * @param {HTMLCanvasElement} canvas
   * @param {Array<object>} items
   * @param {object} [options]
   */
  drawPie(canvas, items, options = {}) {
    const data = this.normalizeData(items);
    const { ctx, width, height } = this.prepareCanvas(canvas);
    const { animate = true } = options;

    if (!data.length) {
      this.drawEmpty(ctx, width, height, 'РќРµС‚ РґР°РЅРЅС‹С…');
      return;
    }

    const total = data.reduce((sum, item) => sum + item.value, 0);
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.38;

    const draw = (progress = 1) => {
      ctx.clearRect(0, 0, width, height);
      let start = -Math.PI / 2;

      data.forEach((item) => {
        const slice = (item.value / total) * Math.PI * 2 * progress;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, start, start + slice);
        ctx.closePath();
        ctx.fillStyle = item.color;
        ctx.fill();
        start += slice;
      });
    };

    if (!animate) {
      draw(1);
      return;
    }

    const startTime = performance.now();
    const frame = (now) => {
      const p = Math.min((now - startTime) / 750, 1);
      draw(1 - Math.pow(1 - p, 3));
      if (p < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /**
   * Р РёСЃСѓРµС‚ СЃС‚РѕР»Р±С‡Р°С‚СѓСЋ РґРёР°РіСЂР°РјРјСѓ.
   * @param {HTMLCanvasElement} canvas
   * @param {Array<object>} items
   * @param {object} [options]
   */
  drawBars(canvas, items, options = {}) {
    const data = this.normalizeData(items);
    const { ctx, width, height } = this.prepareCanvas(canvas);
    const {
      animate = true,
      currency = 'RUB',
      valueKey = 'value'
    } = options;

    if (!data.length) {
      this.drawEmpty(ctx, width, height, 'РќРµС‚ РґР°РЅРЅС‹С…');
      return;
    }

    const padding = { top: 24, right: 16, bottom: 40, left: 16 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;
    const maxValue = Math.max(...data.map((d) => d[valueKey] || d.value), 1);
    const gap = 10;
    const barWidth = Math.max(12, (chartW - gap * (data.length - 1)) / data.length);

    const draw = (progress = 1) => {
      ctx.clearRect(0, 0, width, height);

      ctx.strokeStyle = hexToRgba('#ffffff', 0.08);
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i += 1) {
        const y = padding.top + (chartH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
      }

      data.forEach((item, index) => {
        const value = item[valueKey] || item.value;
        const h = (value / maxValue) * chartH * progress;
        const x = padding.left + index * (barWidth + gap);
        const y = padding.top + chartH - h;

        const gradient = ctx.createLinearGradient(x, y, x, y + h);
        gradient.addColorStop(0, item.color);
        gradient.addColorStop(1, hexToRgba(item.color, 0.35));

        ctx.fillStyle = gradient;
        this.roundRect(ctx, x, y, barWidth, Math.max(h, 2), 8);
        ctx.fill();

        ctx.fillStyle = getComputedStyle(document.documentElement)
          .getPropertyValue('--text-secondary')
          .trim() || 'rgba(255,255,255,0.65)';
        ctx.font = '11px Manrope, sans-serif';
        ctx.textAlign = 'center';
        const label = item.label.length > 8 ? `${item.label.slice(0, 7)}вЂ¦` : item.label;
        ctx.fillText(label, x + barWidth / 2, height - 14);

        if (progress > 0.85) {
          ctx.fillStyle = getComputedStyle(document.documentElement)
            .getPropertyValue('--text-primary')
            .trim() || '#fff';
          ctx.font = '600 10px Manrope, sans-serif';
          ctx.fillText(formatMoney(value, currency, true), x + barWidth / 2, y - 8);
        }
      });
    };

    if (!animate) {
      draw(1);
      return;
    }

    const startTime = performance.now();
    const frame = (now) => {
      const p = Math.min((now - startTime) / 800, 1);
      draw(1 - Math.pow(1 - p, 3));
      if (p < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /**
   * Р РёСЃСѓРµС‚ СЃРіСЂСѓРїРїРёСЂРѕРІР°РЅРЅС‹Рµ СЃС‚РѕР»Р±С†С‹ (РґРѕС…РѕРґ/СЂР°СЃС…РѕРґ РїРѕ РјРµСЃСЏС†Р°Рј).
   * @param {HTMLCanvasElement} canvas
   * @param {Array<{ label: string, income: number, expense: number }>} items
   * @param {object} [options]
   */
  drawGroupedBars(canvas, items = [], options = {}) {
    const { ctx, width, height } = this.prepareCanvas(canvas);
    const { animate = true, currency = 'RUB' } = options;

    const data = items.filter((item) => (item.income || 0) > 0 || (item.expense || 0) > 0);
    if (!data.length) {
      this.drawEmpty(ctx, width, height, 'РќРµС‚ РґР°РЅРЅС‹С… Р·Р° РїРµСЂРёРѕРґ');
      return;
    }

    const padding = { top: 28, right: 16, bottom: 36, left: 16 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;
    const maxValue = Math.max(...data.flatMap((d) => [d.income || 0, d.expense || 0]), 1);
    const groupWidth = chartW / data.length;
    const barWidth = Math.max(6, groupWidth * 0.28);

    const incomeColor = DEFAULT_COLORS[1];
    const expenseColor = DEFAULT_COLORS[3];

    const draw = (progress = 1) => {
      ctx.clearRect(0, 0, width, height);

      ctx.strokeStyle = hexToRgba('#ffffff', 0.08);
      for (let i = 0; i <= 4; i += 1) {
        const y = padding.top + (chartH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
      }

      data.forEach((item, index) => {
        const baseX = padding.left + groupWidth * index + groupWidth / 2;
        const incomeH = ((item.income || 0) / maxValue) * chartH * progress;
        const expenseH = ((item.expense || 0) / maxValue) * chartH * progress;

        ctx.fillStyle = incomeColor;
        this.roundRect(ctx, baseX - barWidth - 3, padding.top + chartH - incomeH, barWidth, Math.max(incomeH, 1), 6);
        ctx.fill();

        ctx.fillStyle = expenseColor;
        this.roundRect(ctx, baseX + 3, padding.top + chartH - expenseH, barWidth, Math.max(expenseH, 1), 6);
        ctx.fill();

        ctx.fillStyle = getComputedStyle(document.documentElement)
          .getPropertyValue('--text-secondary')
          .trim() || 'rgba(255,255,255,0.65)';
        ctx.font = '11px Manrope, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(item.label, baseX, height - 12);
      });

      ctx.font = '11px Manrope, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = incomeColor;
      ctx.fillRect(padding.left, 8, 10, 10);
      ctx.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--text-primary')
        .trim() || '#fff';
      ctx.fillText(`Р”РѕС…РѕРґ (${currency})`, padding.left + 16, 17);

      ctx.fillStyle = expenseColor;
      ctx.fillRect(padding.left + 110, 8, 10, 10);
      ctx.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--text-primary')
        .trim() || '#fff';
      ctx.fillText('Р Р°СЃС…РѕРґ', padding.left + 126, 17);
    };

    if (!animate) {
      draw(1);
      return;
    }

    const startTime = performance.now();
    const frame = (now) => {
      const p = Math.min((now - startTime) / 850, 1);
      draw(1 - Math.pow(1 - p, 3));
      if (p < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /**
   * Р РёСЃСѓРµС‚ Р»РёРЅРµР№РЅС‹Р№ РіСЂР°С„РёРє.
   * @param {HTMLCanvasElement} canvas
   * @param {Array<{ label: string, value: number }>} items
   * @param {object} [options]
   */
  drawLine(canvas, items = [], options = {}) {
    const data = items.map((item, index) => ({
      label: item.label,
      value: Number(item.value) || 0,
      color: options.color || colorByIndex(index)
    }));

    const { ctx, width, height } = this.prepareCanvas(canvas);
    if (!data.length) {
      this.drawEmpty(ctx, width, height, 'РќРµС‚ РґР°РЅРЅС‹С…');
      return;
    }

    const padding = { top: 24, right: 16, bottom: 36, left: 16 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;
    const maxValue = Math.max(...data.map((d) => d.value), 1);
    const color = options.color || DEFAULT_COLORS[0];

    const points = data.map((item, index) => {
      const x = padding.left + (data.length === 1 ? chartW / 2 : (chartW / (data.length - 1)) * index);
      const y = padding.top + chartH - (item.value / maxValue) * chartH;
      return { x, y, ...item };
    });

    const draw = (progress = 1) => {
      ctx.clearRect(0, 0, width, height);

      ctx.strokeStyle = hexToRgba('#ffffff', 0.08);
      for (let i = 0; i <= 4; i += 1) {
        const y = padding.top + (chartH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
      }

      const visibleCount = Math.max(2, Math.ceil(points.length * progress));
      const visible = points.slice(0, visibleCount);

      ctx.beginPath();
      visible.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      if (visible.length > 1) {
        ctx.lineTo(visible[visible.length - 1].x, padding.top + chartH);
        ctx.lineTo(visible[0].x, padding.top + chartH);
        ctx.closePath();
        const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
        gradient.addColorStop(0, hexToRgba(color, 0.35));
        gradient.addColorStop(1, hexToRgba(color, 0.02));
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      visible.forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.fillStyle = getComputedStyle(document.documentElement)
          .getPropertyValue('--text-secondary')
          .trim() || 'rgba(255,255,255,0.65)';
        ctx.font = '11px Manrope, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(point.label, point.x, height - 12);
      });
    };

    const startTime = performance.now();
    const frame = (now) => {
      const p = Math.min((now - startTime) / 800, 1);
      draw(1 - Math.pow(1 - p, 3));
      if (p < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /**
   * Р РёСЃСѓРµС‚ РіРѕСЂРёР·РѕРЅС‚Р°Р»СЊРЅС‹Р№ РїСЂРѕРіСЂРµСЃСЃ-Р±Р°СЂ РЅР° canvas.
   * @param {HTMLCanvasElement} canvas
   * @param {number} progress 0вЂ“100
   * @param {object} [options]
   */
  drawProgress(canvas, progress, options = {}) {
    const { ctx, width, height } = this.prepareCanvas(canvas);
    const value = Math.max(0, Math.min(100, Number(progress) || 0));
    const color = options.color || DEFAULT_COLORS[1];
    const radius = height / 2;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = hexToRgba('#ffffff', 0.1);
    this.roundRect(ctx, 0, 0, width, height, radius);
    ctx.fill();

    const fillWidth = Math.max(radius * 2, (width * value) / 100);
    const gradient = ctx.createLinearGradient(0, 0, fillWidth, 0);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, hexToRgba(color, 0.65));
    ctx.fillStyle = gradient;
    this.roundRect(ctx, 0, 0, fillWidth, height, radius);
    ctx.fill();
  }

  /**
   * РЎРѕРѕР±С‰РµРЅРёРµ РїСЂРё РѕС‚СЃСѓС‚СЃС‚РІРёРё РґР°РЅРЅС‹С….
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} width
   * @param {number} height
   * @param {string} text
   */
  drawEmpty(ctx, width, height, text) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--text-muted')
      .trim() || 'rgba(255,255,255,0.45)';
    ctx.font = '14px Manrope, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height / 2);
  }

  /**
   * РЎРєСЂСѓРіР»С‘РЅРЅС‹Р№ РїСЂСЏРјРѕСѓРіРѕР»СЊРЅРёРє.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {number} r
   */
  roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  /**
   * HTML-Р»РµРіРµРЅРґР° РґР»СЏ РґРёР°РіСЂР°РјРјС‹.
   * @param {Array<object>} items
   * @param {string} [currency='RUB']
   * @returns {string}
   */
  buildLegendHtml(items, currency = 'RUB') {
    const data = this.normalizeData(items);
    if (!data.length) return '<div class="chart-legend empty">РќРµС‚ РґР°РЅРЅС‹С…</div>';

    const total = data.reduce((sum, item) => sum + item.value, 0);

    return `
      <ul class="chart-legend">
        ${data.map((item) => {
          const pct = total ? Math.round((item.value / total) * 100) : 0;
          return `
            <li>
              <span class="legend-dot" style="background:${item.color}"></span>
              <span class="legend-label">${item.label}</span>
              <span class="legend-value">${formatMoney(item.value, currency)}</span>
              <span class="legend-pct">${pct}%</span>
            </li>
          `;
        }).join('')}
      </ul>
    `;
  }
}

/** Р•РґРёРЅСЃС‚РІРµРЅРЅС‹Р№ СЌРєР·РµРјРїР»СЏСЂ СЃРµСЂРІРёСЃР° РґРёР°РіСЂР°РјРј. */
export const chartsService = new ChartsService();

export default chartsService;

