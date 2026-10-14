import { host, send } from './util';
(() => {
  const ID = 'glimpse-region-host';
  const { el, root } = host(ID);
  el.style.cssText += 'width:100vw;height:100vh;';
  root.innerHTML = `<style>
  .layer{position:fixed;inset:0;cursor:crosshair;background:rgba(0,0,0,.4);user-select:none}
  .sel{position:fixed;border:2px solid #22d3ee;box-shadow:0 0 0 9999px rgba(0,0,0,.4);display:none}
  .layer.drag{background:transparent}
  .lbl{position:absolute;right:0;bottom:-22px;font:600 11px system-ui,sans-serif;color:#fff;background:#0e7490;padding:2px 6px;border-radius:4px}
  .pill{position:fixed;top:14px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;font:500 13px system-ui,sans-serif;color:#fff;background:#1f2330;padding:6px 8px 6px 14px;border-radius:999px;cursor:default}
  .pill button{all:unset;background:#4f46e5;padding:5px 12px;border-radius:999px;cursor:pointer} .pill button.c{background:#3b4256}</style>
  <div class="layer"></div><div class="sel"><span class="lbl"></span></div>
  <div class="pill">Drag to select an area · Esc to cancel <button class="f">Full visible tab</button><button class="c">Cancel</button></div>`;
  const layer = root.querySelector('.layer') as HTMLElement, box = root.querySelector('.sel') as HTMLElement, lbl = root.querySelector('.lbl') as HTMLElement;
  let sx = 0, sy = 0, dragging = false, r = { x: 0, y: 0, w: 0, h: 0 };
  const cleanup = () => { document.removeEventListener('keydown', onKey, true); el.remove(); };
  const afterFrames = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn));
  const cancel = () => { cleanup(); send({ type: 'REGION_CANCELLED' }); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); } };
  document.addEventListener('keydown', onKey, true);
  layer.addEventListener('contextmenu', (e) => { e.preventDefault(); cancel(); });
  root.querySelector('.c')!.addEventListener('click', cancel);
  root.querySelector('.f')!.addEventListener('click', () => { cleanup(); afterFrames(() => send({ type: 'REGION_FULL_TAB' })); });
  layer.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true; sx = e.clientX; sy = e.clientY; layer.classList.add('drag'); box.style.display = 'block'; update(e);
  });
  const update = (e: MouseEvent) => {
    r = { x: Math.min(sx, e.clientX), y: Math.min(sy, e.clientY), w: Math.abs(e.clientX - sx), h: Math.abs(e.clientY - sy) };
    Object.assign(box.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    lbl.textContent = `${Math.round(r.w)} × ${Math.round(r.h)}`;
  };
  layer.addEventListener('mousemove', (e) => dragging && update(e));
  window.addEventListener('mouseup', (e) => {
    if (!dragging) return; dragging = false; update(e);
    if (r.w < 8 || r.h < 8) { layer.classList.remove('drag'); box.style.display = 'none'; return; }
    const rect = { ...r, dpr: window.devicePixelRatio || 1 };
    cleanup();
    afterFrames(() => send({ type: 'REGION_SELECTED', ...rect }));
  }, { once: false });
})();
