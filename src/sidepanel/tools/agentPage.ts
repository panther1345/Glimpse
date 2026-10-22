/* Functions injected into the controlled tab with chrome.scripting (must be self-contained). */
export function pgOverlay(on: boolean, status: string) {
  const ID = 'glimpse-agent-overlay';
  let host = document.getElementById(ID) as HTMLElement | null;
  if (!on) { host?.remove(); return; }
  if (!host) {
    host = document.createElement('div'); host.id = ID;
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none';
    const sh = host.attachShadow({ mode: 'open' });
    sh.innerHTML = `<style>
    .glow{position:fixed;inset:0;border:3px solid #7c5cff;box-shadow:inset 0 0 28px 6px rgba(124,92,255,.55);animation:g 1.6s ease-in-out infinite;pointer-events:none}
    @keyframes g{50%{box-shadow:inset 0 0 44px 12px rgba(124,92,255,.85);border-color:#a78bfa}}
    .pill{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);display:flex;align-items:center;gap:10px;pointer-events:auto;background:#17151f;color:#fff;
      font:600 13.5px system-ui,sans-serif;padding:9px 10px 9px 16px;border-radius:999px;box-shadow:0 8px 30px rgba(124,92,255,.55),0 0 0 1px #7c5cff;max-width:80vw}
    .dot{width:9px;height:9px;border-radius:50%;background:#a78bfa;animation:p 1s infinite}@keyframes p{50%{opacity:.3}}
    .st{color:#c9c2ff;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:46vw}
    button{all:unset;cursor:pointer;background:#e5484d;color:#fff;padding:5px 12px;border-radius:999px;font-weight:700}
    .cur{position:fixed;width:22px;height:22px;left:-40px;top:-40px;transition:left .55s cubic-bezier(.2,.8,.2,1),top .55s cubic-bezier(.2,.8,.2,1);filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))}
    .ring{position:fixed;border:2px solid #7c5cff;border-radius:8px;background:rgba(124,92,255,.15);transition:all .4s;pointer-events:none;opacity:0}
    .ring.on{opacity:1}.click{animation:c .5s}@keyframes c{0%{transform:scale(1)}50%{transform:scale(.7)}100%{transform:scale(1)}}
    </style><div class="glow"></div><div class="ring"></div>
    <svg class="cur" viewBox="0 0 24 24"><path d="M4 2l15 9-7 1.6L8.6 20z" fill="#7c5cff" stroke="#fff" stroke-width="1.5"/></svg>
    <div class="pill"><span class="dot"></span><span style="white-space:nowrap">Glimpse is controlling this tab</span><span class="st"></span><button>Stop</button></div>`;
    sh.querySelector('button')!.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'AGENT_STOP' }).catch(() => {}));
    document.documentElement.appendChild(host);
  }
  host.shadowRoot!.querySelector('.st')!.textContent = status ? '· ' + status : '';
}
/** Visible interactive elements, tagged with data-glimpse-id. */
export function pgObserve() {
  const vis = (e: Element) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > -200 && r.top < innerHeight * 3; };
  const els = [...document.querySelectorAll('a[href],button,input,select,textarea,[role=button],[role=link],[role=tab],[contenteditable=true],summary')].filter(vis).slice(0, 160);
  const items = els.map((e, i) => {
    e.setAttribute('data-glimpse-id', String(i));
    const el = e as HTMLInputElement;
    const txt = (el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || el.title || el.name || '').replace(/\s+/g, ' ').trim().slice(0, 70);
    return `[${i}] <${e.tagName.toLowerCase()}${el.type ? ' type=' + el.type : ''}> ${txt}`;
  });
  const clone = document.body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script,style,noscript,svg,iframe,#glimpse-agent-overlay').forEach((x) => x.remove());
  return { url: location.href, title: document.title, elements: items.join('\n'), text: clone.innerText.replace(/\n{3,}/g, '\n\n').slice(0, 9000), fullText: clone.innerText.slice(0, 50000), scrollY: Math.round(scrollY), height: document.body.scrollHeight };
}
export async function pgAct(kind: string, id: number, text: string, enter: boolean) {
  const e = document.querySelector(`[data-glimpse-id="${id}"]`) as HTMLElement | null;
  if (!e) return { ok: false, msg: 'element not found' };
  const el = e as HTMLInputElement;
  const meta = `${el.type} ${el.name} ${el.id} ${el.getAttribute('autocomplete') || ''} ${el.placeholder || ''}`;
  if (kind === 'type' && (el.type === 'password' || /card|cc-|cvv|cvc|otp|password/i.test(meta))) return { ok: false, msg: 'blocked: Glimpse never types passwords, card numbers or OTPs' };
  e.scrollIntoView({ block: 'center', behavior: 'smooth' }); await new Promise((r) => setTimeout(r, 450));
  const r = e.getBoundingClientRect(); const sh = document.getElementById('glimpse-agent-overlay')?.shadowRoot;
  if (sh) {
    const cur = sh.querySelector('.cur') as HTMLElement, ring = sh.querySelector('.ring') as HTMLElement;
    Object.assign(ring.style, { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' }); ring.classList.add('on');
    cur.style.left = r.left + Math.min(r.width / 2, 40) + 'px'; cur.style.top = r.top + r.height / 2 + 'px';
    await new Promise((res) => setTimeout(res, 650)); cur.classList.remove('click'); void cur.offsetWidth; cur.classList.add('click');
  }
  if (kind === 'click') { e.focus(); e.click(); }
  else {
    e.focus();
    if (e.isContentEditable) e.textContent = text;
    else if (el.tagName === 'SELECT') { const s = el as unknown as HTMLSelectElement; const o = [...s.options].find((x) => x.text.trim().toLowerCase() === text.toLowerCase()) || [...s.options].find((x) => x.text.toLowerCase().includes(text.toLowerCase())); if (o) s.value = o.value; }
    else { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, text); }
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    if (enter) {
      const k = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true };
      el.dispatchEvent(new KeyboardEvent('keydown', k)); el.dispatchEvent(new KeyboardEvent('keypress', k)); el.dispatchEvent(new KeyboardEvent('keyup', k));
      if (el.form) setTimeout(() => el.form!.requestSubmit(), 50);
    }
  }
  setTimeout(() => sh?.querySelector('.ring')?.classList.remove('on'), 900);
  return { ok: true, msg: '' };
}
export function pgScroll(dir: string) { scrollBy({ top: (dir === 'up' ? -1 : 1) * innerHeight * 0.8, behavior: 'smooth' }); return true; }
export function pgElemInfo(id: number) {
  const e = document.querySelector(`[data-glimpse-id="${id}"]`) as HTMLInputElement | null;
  if (!e) return null;
  return { text: (e.innerText || e.value || e.getAttribute('aria-label') || '').trim().slice(0, 80), type: e.type || '', inForm: !!e.closest('form'), formHasPassword: !!e.closest('form')?.querySelector('input[type=password]') };
}
