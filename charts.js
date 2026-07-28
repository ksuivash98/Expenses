/**
 * charts.js — Canvas/SVG диаграммы
 */
import { formatMoney, hexToRgba } from './utils.js';

export function drawDonut(canvas, items, options = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const size = options.size || 220;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const data = (items || []).filter((i) => Number(i.amount) > 0);
  const total = data.reduce((s, i) => s + Number(i.amount), 0);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.38;
  const thickness = size * 0.14;

  if (!total) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = thickness;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '600 14px Manrope, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Нет данных', cx, cy);
    return;
  }

  let start = -Math.PI / 2;
  data.forEach((item, index) => {
    const value = Number(item.amount);
    const angle = (value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, start + angle);
    ctx.strokeStyle = item.color || `hsl(${(index * 47) % 360} 70% 55%)`;
    ctx.lineWidth = thickness;
    ctx.lineCap = 'butt';
    ctx.stroke();
    start += angle;
  });

  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--chart-center').trim()
    || 'rgba(10,18,34,0.92)';
  ctx.beginPath();
  ctx.arc(cx, cy, radius - thickness / 2 - 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#fff';
  ctx.font = '700 15px Sora, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatMoney(total), cx, cy - 8);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#aaa';
  ctx.font = '500 12px Manrope, sans-serif';
  ctx.fillText(options.centerLabel || 'Всего', cx, cy + 12);
}

export function drawBars(canvas, items, options = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = options.width || canvas.clientWidth || 360;
  const height = options.height || 180;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const data = items || [];
  if (!data.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '500 13px Manrope, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Нет данных', width / 2, height / 2);
    return;
  }

  const max = Math.max(...data.map((i) => Number(i.amount) || 0), 1);
  const gap = 10;
  const barWidth = Math.max(12, (width - gap * (data.length + 1)) / data.length);
  const baseY = height - 28;

  data.forEach((item, index) => {
    const value = Number(item.amount) || 0;
    const h = (value / max) * (height - 50);
    const x = gap + index * (barWidth + gap);
    const y = baseY - h;
    const color = item.color || '#3d8bfd';
    const gradient = ctx.createLinearGradient(0, y, 0, baseY);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, hexToRgba(color, 0.35));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, barWidth, h, 8);
    } else {
      ctx.rect(x, y, barWidth, h);
    }
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '500 10px Manrope, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(item.label || '').slice(0, 8), x + barWidth / 2, height - 10);
  });
}

export function legendHtml(items) {
  return (items || []).map((item) => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${item.color || '#3d8bfd'}"></span>
      <span>${item.name || item.label || item.category || item.source || '—'}</span>
      <strong>${formatMoney(item.amount || 0)}</strong>
    </div>
  `).join('');
}
