import sharp from 'sharp';
import fs from 'node:fs';
// Original Glimpse mark: rounded indigo square with a white lens/eye and a spark.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#06b6d4"/></linearGradient></defs>
<rect x="4" y="4" width="120" height="120" rx="28" fill="url(#g)"/>
<path d="M16 64 C34 34 94 34 112 64 C94 94 34 94 16 64 Z" fill="#fff"/>
<circle cx="64" cy="64" r="20" fill="#312e81"/><circle cx="71" cy="57" r="6" fill="#fff"/></svg>`;
fs.mkdirSync('public/icons', { recursive: true });
fs.writeFileSync('public/icons/glimpse.svg', svg);
for (const s of [16, 32, 48, 128]) await sharp(Buffer.from(svg)).resize(s, s).png().toFile(`public/icons/icon${s}.png`);
