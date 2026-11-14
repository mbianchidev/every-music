import { createRequire } from 'node:module';

const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const sharp = requireBackend('sharp');

// Abstract, generated artwork only: gradients and simple shapes, never photos,
// faces, or logos. The same seed always draws the same picture.
const palettes = [
  ['#2b1a5a', '#7a4fd6', '#f2b8ff', '#ffd27a'],
  ['#0f3b4c', '#2fa3a0', '#c9f2e3', '#ffb36b'],
  ['#3d1230', '#d1495b', '#ffd6a5', '#ffe9c7'],
  ['#14213d', '#3a6ea5', '#a7c4ff', '#fca311'],
  ['#1b2a1e', '#4f8a5b', '#d8f3c4', '#f6c453'],
  ['#2d1e12', '#c46a2f', '#ffd9b0', '#7fd1c7'],
  ['#1d1530', '#5b3fa8', '#ff8fb1', '#9be7ff'],
  ['#102a2a', '#1f7a7a', '#f4e285', '#f08a5d'],
];

function hash(value) {
  let state = 2166136261;
  for (const character of String(value)) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return state >>> 0;
}

function random(seed) {
  let state = hash(seed);
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const paletteFor = seed => palettes[hash(`palette:${seed}`) % palettes.length];

function background(width, height, [dark, mid], next) {
  const angle = Math.round(next() * 360);
  return `<defs>
    <linearGradient id="bg" gradientTransform="rotate(${angle} .5 .5)">
      <stop offset="0" stop-color="${dark}"/><stop offset="1" stop-color="${mid}"/>
    </linearGradient>
    <radialGradient id="glow" cx="${(0.2 + next() * 0.6).toFixed(2)}" cy="${(0.2 + next() * 0.6).toFixed(2)}" r=".7">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".35"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>`;
}

function wave(width, height, color, next, opacity = 0.7) {
  const base = height * (0.35 + next() * 0.4);
  const amplitude = height * (0.05 + next() * 0.12);
  const length = width / (1.5 + next() * 2.5);
  let path = `M0 ${base.toFixed(1)}`;
  for (let x = 0; x <= width; x += 8) {
    path += ` L${x} ${(base + Math.sin((x / length) * Math.PI * 2) * amplitude).toFixed(1)}`;
  }
  return `<path d="${path}" fill="none" stroke="${color}" stroke-width="${Math.max(3, width / 120).toFixed(1)}" stroke-linecap="round" opacity="${opacity}"/>`;
}

function orbs(width, height, colors, next, count = 5) {
  let shapes = '';
  for (let index = 0; index < count; index += 1) {
    const radius = Math.min(width, height) * (0.08 + next() * 0.28);
    shapes += `<circle cx="${(next() * width).toFixed(1)}" cy="${(next() * height).toFixed(1)}" r="${radius.toFixed(1)}"
      fill="${colors[index % colors.length]}" opacity="${(0.25 + next() * 0.45).toFixed(2)}"/>`;
  }
  return shapes;
}

function bars(width, height, color, next) {
  const count = 18;
  const gap = width / (count * 2 + 1);
  let shapes = '';
  for (let index = 0; index < count; index += 1) {
    const barHeight = height * (0.12 + next() * 0.5);
    shapes += `<rect x="${(gap + index * gap * 2).toFixed(1)}" y="${(height * 0.86 - barHeight).toFixed(1)}" width="${gap.toFixed(1)}"
      height="${barHeight.toFixed(1)}" rx="${(gap / 2).toFixed(1)}" fill="${color}" opacity=".8"/>`;
  }
  return shapes;
}

function rings(width, height, color, next) {
  const cx = width * (0.3 + next() * 0.4);
  const cy = height * (0.3 + next() * 0.4);
  let shapes = '';
  for (let radius = Math.min(width, height) * 0.08; radius < Math.max(width, height); radius += Math.min(width, height) * 0.07) {
    shapes += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${radius.toFixed(1)}" fill="none" stroke="${color}" stroke-width="2" opacity=".35"/>`;
  }
  return shapes;
}

const svg = (width, height, body) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
);

const render = async (width, height, body) => sharp(svg(width, height, body)).png().toBuffer();

export function avatar(seed) {
  const next = random(`avatar:${seed}`);
  const palette = paletteFor(seed);
  return render(512, 512, `${background(512, 512, palette, next)}${orbs(512, 512, [palette[2], palette[3]], next, 4)}
    ${wave(512, 512, palette[3], next, 0.8)}`);
}

export function cover(seed, { width = 960, height = 640 } = {}) {
  const next = random(`cover:${seed}`);
  const palette = paletteFor(seed);
  const pattern = hash(`pattern:${seed}`) % 3;
  const detail = pattern === 0 ? bars(width, height, palette[2], next)
    : pattern === 1 ? rings(width, height, palette[2], next) : orbs(width, height, [palette[2], palette[3]], next, 6);
  return render(width, height, `${background(width, height, palette, next)}${detail}
    ${wave(width, height, palette[3], next)}${wave(width, height, palette[2], next, 0.5)}`);
}

export function poster(seed) {
  const width = 1200;
  const height = 675;
  const next = random(`poster:${seed}`);
  const palette = paletteFor(seed);
  let rays = '';
  const cx = width * (0.25 + next() * 0.5);
  const cy = height * 0.95;
  for (let index = 0; index < 14; index += 1) {
    const angle = Math.PI + (index / 13) * Math.PI;
    rays += `<line x1="${cx.toFixed(1)}" y1="${cy}" x2="${(cx + Math.cos(angle) * width).toFixed(1)}" y2="${(cy + Math.sin(angle) * width).toFixed(1)}"
      stroke="${index % 2 ? palette[2] : palette[3]}" stroke-width="18" opacity=".18"/>`;
  }
  return render(width, height, `${background(width, height, palette, next)}${rays}
    <circle cx="${cx.toFixed(1)}" cy="${cy}" r="${(height * 0.32).toFixed(1)}" fill="${palette[3]}" opacity=".85"/>
    ${bars(width, height, palette[2], next)}${wave(width, height, '#ffffff', next, 0.45)}`);
}

// Stylized gear drawn from basic shapes, so listings have recognizable but
// clearly synthetic pictures.
const gearShapes = {
  guitar: (c) => `<g transform="rotate(-28 500 375)">
      <rect x="470" y="70" width="60" height="330" rx="10" fill="${c.dark}"/>
      <rect x="455" y="40" width="90" height="70" rx="16" fill="${c.dark}"/>
      <ellipse cx="500" cy="470" rx="150" ry="130" fill="${c.accent}"/>
      <ellipse cx="500" cy="590" rx="185" ry="140" fill="${c.accent}"/>
      <circle cx="500" cy="510" r="42" fill="${c.dark}" opacity=".85"/>
      <rect x="440" y="610" width="120" height="22" rx="8" fill="${c.dark}"/>
      <line x1="485" y1="60" x2="485" y2="620" stroke="${c.light}" stroke-width="3"/>
      <line x1="515" y1="60" x2="515" y2="620" stroke="${c.light}" stroke-width="3"/></g>`,
  amp: (c) => `<rect x="260" y="190" width="480" height="380" rx="28" fill="${c.dark}"/>
      <rect x="290" y="220" width="420" height="70" rx="12" fill="${c.accent}"/>
      ${[0, 1, 2, 3, 4, 5].map(index => `<circle cx="${330 + index * 68}" cy="255" r="16" fill="${c.dark}"/>`).join('')}
      <rect x="290" y="310" width="420" height="235" rx="16" fill="${c.light}" opacity=".25"/>
      <circle cx="500" cy="428" r="98" fill="${c.dark}" stroke="${c.accent}" stroke-width="10"/>
      <rect x="440" y="150" width="120" height="44" rx="18" fill="none" stroke="${c.dark}" stroke-width="14"/>`,
  drums: (c) => `<ellipse cx="500" cy="470" rx="170" ry="170" fill="${c.accent}"/>
      <ellipse cx="500" cy="470" rx="120" ry="120" fill="${c.light}" opacity=".5"/>
      <ellipse cx="320" cy="300" rx="90" ry="40" fill="${c.dark}"/><rect x="230" y="300" width="180" height="90" fill="${c.dark}"/>
      <ellipse cx="320" cy="390" rx="90" ry="40" fill="${c.accent}"/>
      <ellipse cx="690" cy="300" rx="90" ry="40" fill="${c.dark}"/><rect x="600" y="300" width="180" height="90" fill="${c.dark}"/>
      <ellipse cx="690" cy="390" rx="90" ry="40" fill="${c.accent}"/>
      <line x1="200" y1="180" x2="200" y2="640" stroke="${c.dark}" stroke-width="10"/>
      <ellipse cx="200" cy="180" rx="110" ry="18" fill="${c.light}"/>
      <line x1="820" y1="160" x2="820" y2="640" stroke="${c.dark}" stroke-width="10"/>
      <ellipse cx="820" cy="160" rx="120" ry="20" fill="${c.light}"/>`,
  keys: (c) => `<rect x="140" y="260" width="720" height="240" rx="24" fill="${c.dark}"/>
      <rect x="170" y="290" width="660" height="40" rx="10" fill="${c.accent}"/>
      ${Array.from({ length: 14 }, (_, index) => `<rect x="${170 + index * 47.1}" y="350" width="44" height="125" rx="5" fill="${c.light}"/>`).join('')}
      ${[0, 1, 3, 4, 5, 7, 8, 10, 11, 12].map(index => `<rect x="${200 + index * 47.1}" y="350" width="28" height="78" rx="4" fill="${c.dark}"/>`).join('')}`,
  synth: (c) => `<rect x="150" y="230" width="700" height="300" rx="26" fill="${c.dark}"/>
      ${Array.from({ length: 8 }, (_, index) => `<circle cx="${210 + index * 83}" cy="300" r="26" fill="${c.accent}"/>
        <line x1="${210 + index * 83}" y1="300" x2="${210 + index * 83 + 14}" y2="282" stroke="${c.dark}" stroke-width="6"/>`).join('')}
      ${Array.from({ length: 12 }, (_, index) => `<rect x="${185 + index * 53}" y="370" width="48" height="130" rx="5" fill="${c.light}"/>`).join('')}`,
  mic: (c) => `<rect x="440" y="180" width="120" height="230" rx="60" fill="${c.dark}"/>
      ${Array.from({ length: 6 }, (_, index) => `<line x1="450" y1="${215 + index * 30}" x2="550" y2="${215 + index * 30}" stroke="${c.accent}" stroke-width="6"/>`).join('')}
      <path d="M390 330 Q390 500 500 500 Q610 500 610 330" fill="none" stroke="${c.light}" stroke-width="16"/>
      <rect x="490" y="500" width="20" height="120" fill="${c.light}"/><rect x="420" y="615" width="160" height="20" rx="10" fill="${c.light}"/>`,
  van: (c) => `<rect x="180" y="300" width="560" height="200" rx="30" fill="${c.accent}"/>
      <path d="M740 330 L840 380 L840 500 L740 500 Z" fill="${c.accent}"/>
      <rect x="760" y="360" width="60" height="50" rx="8" fill="${c.light}"/>
      <rect x="220" y="340" width="120" height="70" rx="10" fill="${c.light}" opacity=".7"/>
      <rect x="370" y="340" width="120" height="70" rx="10" fill="${c.light}" opacity=".7"/>
      <circle cx="310" cy="510" r="52" fill="${c.dark}"/><circle cx="700" cy="510" r="52" fill="${c.dark}"/>
      <circle cx="310" cy="510" r="20" fill="${c.light}"/><circle cx="700" cy="510" r="20" fill="${c.light}"/>`,
  desk: (c) => `<rect x="150" y="250" width="700" height="320" rx="26" fill="${c.dark}"/>
      ${Array.from({ length: 10 }, (_, index) => `<line x1="${210 + index * 65}" y1="300" x2="${210 + index * 65}" y2="520" stroke="${c.light}" stroke-width="6" opacity=".5"/>
        <rect x="${192 + index * 65}" y="${330 + ((index * 37) % 150)}" width="36" height="22" rx="5" fill="${c.accent}"/>`).join('')}`,
};

export function gear(kind, seed) {
  const next = random(`gear:${seed}`);
  const palette = paletteFor(seed);
  const colors = { dark: '#1c1726', accent: palette[3], light: '#f7f2ea' };
  return render(1000, 750, `${background(1000, 750, [palette[1], palette[2]], next)}
    ${orbs(1000, 750, ['#ffffff'], next, 3)}${(gearShapes[kind] ?? gearShapes.amp)(colors)}`);
}
