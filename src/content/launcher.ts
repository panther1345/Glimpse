import { host, loadSettings, send } from './util';
const ID = 'glimpse-launcher-host';
function mount() {
  if (window.top !== window || document.getElementById(ID)) return;
  const { root } = host(ID);
  root.innerHTML = `<style>
  button{position:fixed;right:0;top:45%;width:36px;height:36px;border:none;border-radius:10px 0 0 10px;cursor:pointer;
  background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;opacity:.75;transition:width .15s,opacity .15s;padding:0}
  button:hover{opacity:1;width:44px} img{width:22px;height:22px}
  .x{position:fixed;right:2px;top:calc(45% - 14px);font:11px sans-serif;color:#555;background:#eee;border-radius:50%;width:14px;height:14px;line-height:14px;text-align:center;cursor:pointer;display:none}
  :host(:hover) .x{display:block}</style>
  <button title="Open Glimpse (Alt+Shift+G)"><img src="${chrome.runtime.getURL('icons/icon32.png')}" alt=""></button><div class="x" title="Hide">×</div>`;
  root.querySelector('button')!.addEventListener('click', () => send({ type: 'OPEN_PANEL' }));
  root.querySelector('.x')!.addEventListener('click', () => document.getElementById(ID)?.remove());
}
loadSettings().then((s) => { if (s.launcher !== false) mount(); });
chrome.storage.onChanged.addListener((c) => {
  if (!c.settings) return;
  if ((c.settings.newValue as any)?.launcher === false) document.getElementById(ID)?.remove(); else mount();
});
