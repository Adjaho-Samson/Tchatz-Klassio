// Génère les icônes PWA (PNG) à partir du logo vectoriel Klassio.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'icons');
mkdirSync(out, { recursive: true });

const K = `
  <path d="M26 26h12v56H26z" fill="#2563EB"/>
  <path d="M38 54 62 26h15L52 54z" fill="#FFFFFF"/>
  <path d="M52 54 77 82H62L38 54z" fill="#FFFFFF"/>
  <path d="M66 26h14v12H66z" fill="#93C5FD"/>
`;

const svg = (size, { maskable = false, radius = 24 } = {}) => {
  // Pour l'icône « maskable », le logo est réduit dans la zone de sécurité.
  const scale = maskable ? 0.62 : 1;
  const offset = maskable ? (108 - 108 * scale) / 2 : 0;
  const bg = maskable
    ? `<rect width="108" height="108" fill="#163B70"/>`
    : `<rect width="108" height="108" rx="${radius}" fill="#163B70"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 108 108">
    ${bg}
    <g transform="translate(${offset} ${offset}) scale(${scale})">${K}</g>
  </svg>`;
};

const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { radius: 0 }],
];

for (const [name, size, opts] of targets) {
  await sharp(Buffer.from(svg(size, opts))).png().toFile(join(out, name));
  console.log('✓', name);
}
console.log('Icônes générées dans public/icons/');
