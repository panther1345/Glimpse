let el: HTMLDivElement | null = null; let t: number | undefined;
export function toast(msg: string) {
  el ??= Object.assign(document.body.appendChild(document.createElement('div')), { className: 'toast' });
  el.textContent = msg; el.classList.add('show');
  clearTimeout(t); t = window.setTimeout(() => el?.classList.remove('show'), 1400);
}
