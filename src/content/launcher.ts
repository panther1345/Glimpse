import { host, loadSettings, send, saveSettingsPatch } from './util';
import type { Settings } from '../lib/storage';
// The floating launcher is ONLY a shortcut. Hiding/disabling it never affects other features
// (selection toolbar, in-page popup, context menus, shortcuts, side panel, background worker).
const ID = 'glimpse-launcher-host';
const site = () => location.hostname;
let S: Partial<Settings> = {};
let hiddenThisPage = false;
const shouldShow = () => S.launcher !== false && !(S.launcherHiddenSites || []).includes(site()) && !hiddenThisPage;
const unmount = () => document.getElementById(ID)?.remove();
function mount() {
  if (window.top !== window || document.getElementById(ID)) return;
  const { root } = host(ID);
  root.innerHTML = `<style>
  .b{position:fixed;right:0;top:45%;width:36px;height:36px;border:none;border-radius:10px 0 0 10px;cursor:pointer;
  background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;opacity:.75;transition:width .15s,opacity .15s;padding:0}
  .b:hover{opacity:1;width:44px} img{width:22px;height:22px}
  .x{position:fixed;right:2px;top:calc(45% - 14px);font:11px sans-serif;color:#555;background:#eee;border-radius:50%;width:14px;height:14px;line-height:14px;text-align:center;cursor:pointer;display:none}
  :host(:hover) .x{display:block}
  .m{position:fixed;right:48px;top:calc(45% - 20px);background:#1c1f27;color:#e8eaf0;border:1px solid #2f3340;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.4);padding:5px 0;font:500 13px system-ui,sans-serif;min-width:230px;display:none}
  .m.on{display:block} .m div{padding:7px 14px;cursor:pointer} .m div:hover{background:#272b36}
  .m small{display:block;padding:4px 14px 6px;color:#8f96a8;font-size:11.5px;border-top:1px solid #2f3340;margin-top:4px}</style>
  <button class="b" title="Open Glimpse (Alt+Shift+G)"><img src="${chrome.runtime.getURL('icons/icon32.png')}" alt=""></button><div class="x" title="Hide button">×</div>
  <div class="m"><div data-a="page">Hide until next visit</div><div data-a="site">Disable on this site</div><div data-a="all">Disable on all sites</div>
  <small>Only hides this button. Glimpse keeps working (selection toolbar, shortcuts, right-click, side panel). Re-enable in Glimpse Settings.</small></div>`;
  const menu = root.querySelector('.m')!;
  root.querySelector('.b')!.addEventListener('click', () => send({ type: 'OPEN_PANEL' }));
  root.querySelector('.x')!.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('on'); });
  menu.addEventListener('click', async (e) => {
    const a = (e.target as HTMLElement).dataset?.a; if (!a) return;
    unmount();
    if (a === 'page') hiddenThisPage = true;
    else if (a === 'site') { const s = await loadSettings(); await saveSettingsPatch({ launcherHiddenSites: [...new Set([...(s.launcherHiddenSites || []), site()])] }); }
    else if (a === 'all') await saveSettingsPatch({ launcher: false });
  });
  document.addEventListener('click', () => menu.classList.remove('on'));
}
const sync = () => (shouldShow() ? mount() : unmount());
loadSettings().then((s) => { S = s; sync(); });
chrome.storage.onChanged.addListener((c) => { if (c.settings) { S = (c.settings.newValue as Partial<Settings>) || {}; sync(); } });
