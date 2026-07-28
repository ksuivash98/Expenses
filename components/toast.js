/**
 * components/toast.js
 */
export class Toast {
  constructor(rootId = 'toast-root') {
    this.root = document.getElementById(rootId);
  }

  show(message, type = 'info') {
    if (!this.root) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    this.root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, 3200);
  }
}

export const toast = new Toast();
export default toast;
