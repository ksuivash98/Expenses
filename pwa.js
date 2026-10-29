let installPrompt;
const button = document.createElement('button');
button.type = 'button';
button.className = 'btn btn-ghost btn-sm';
button.textContent = 'Установить приложение';
button.hidden = true;
button.id = 'install-app';
const attach = () => {
  const target = document.querySelector('.topbar-actions');
  if (target && !button.isConnected) target.prepend(button);
};
new MutationObserver(attach).observe(document.getElementById('app'), { childList: true, subtree: true });
attach();
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  button.hidden = false;
  attach();
});
button.addEventListener('click', async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  button.hidden = true;
});
window.addEventListener('appinstalled', () => { button.hidden = true; installPrompt = null; });
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Не удалось включить офлайн-режим', error));
}
