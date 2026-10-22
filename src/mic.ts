const s = document.getElementById('s')!;
const ask = () => navigator.mediaDevices.getUserMedia({ audio: true })
  .then((m) => { m.getTracks().forEach((t) => t.stop()); s.textContent = 'Microphone allowed. You can close this tab and return to the Glimpse side panel.'; })
  .catch(() => { s.textContent = 'Microphone was blocked. Click the site-settings icon in the address bar to allow it, then try again.'; });
document.getElementById('b')!.addEventListener('click', ask); ask();
