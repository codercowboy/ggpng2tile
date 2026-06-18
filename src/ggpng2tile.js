#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

// --- Color helpers ---

// Scale 8-bit to 4-bit (Game Gear uses 4 bits per channel)
function to4bit(v) {
  return (v >> 4) & 0xF;
}

// Pack RGB (0-255 each) into a 12-bit GG palette word stored in 16-bit LE:
//   bits 0-3: red, bits 4-7: green, bits 8-11: blue, bits 12-15: unused
function packGGColor(r, g, b) {
  return (to4bit(b) << 8) | (to4bit(g) << 4) | to4bit(r);
}

// Squared euclidean distance in RGB space for nearest-color search
function colorDist(r1, g1, b1, r2, g2, b2) {
  return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
}

// --- Palette building ---

function buildPalette(png) {
  const { data, width, height } = png;
  // palette[i] = { r, g, b } — index 0 reserved for transparent
  const palette = [{ r: 0, g: 0, b: 0 }];
  // Map "r,g,b" -> palette index for opaque colors
  const seen = new Map();
  let overflow = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a < 128) continue; // treat as transparent
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const key = `${r},${g},${b}`;
      if (!seen.has(key)) {
        if (palette.length >= 16) {
          overflow = true;
          continue;
        }
        seen.set(key, palette.length);
        palette.push({ r, g, b });
      }
    }
  }

  return { palette, seen, overflow };
}

// fallback is 'nearest' | 'transparent' | 0-15
function getPaletteIndex(palette, seen, r, g, b, a, fallback) {
  if (a < 128) return 0;
  const key = `${r},${g},${b}`;
  if (seen.has(key)) return seen.get(key);

  // Color not in palette — apply fallback
  if (fallback === 'transparent') return 0;
  if (typeof fallback === 'number') return fallback;

  // nearest: find closest color in palette (skip index 0 / transparent slot)
  let best = 1, bestDist = Infinity;
  for (let i = 1; i < palette.length; i++) {
    const d = colorDist(r, g, b, palette[i].r, palette[i].g, palette[i].b);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

// --- Tile encoding ---

// Encode one 8x8 tile at tile grid position (tileX, tileY).
// Returns 32 bytes: 4 bitplanes × 8 rows.
function encodeTile(png, palette, seen, tileX, tileY, fallback) {
  const { data, width } = png;
  const bytes = [];

  for (let row = 0; row < 8; row++) {
    let bp = [0, 0, 0, 0];
    for (let col = 0; col < 8; col++) {
      const px = tileX * 8 + col;
      const py = tileY * 8 + row;
      const i = (py * width + px) * 4;
      const idx = getPaletteIndex(palette, seen, data[i], data[i+1], data[i+2], data[i+3], fallback);
      const bit = 7 - col; // pixel 0 → MSB
      for (let p = 0; p < 4; p++) {
        if (idx & (1 << p)) bp[p] |= (1 << bit);
      }
    }
    bytes.push(...bp);
  }

  return bytes;
}

// --- C output ---

function hex2(v) { return `0x${v.toString(16).padStart(2, '0')}`; }
function hex4(v) { return `0x${v.toString(16).padStart(4, '0')}`; }

function formatByteArray(name, bytes, cols = 16) {
  const lines = [`const unsigned char ${name}[${bytes.length}] = {`];
  for (let i = 0; i < bytes.length; i += cols) {
    const chunk = bytes.slice(i, i + cols).map(hex2).join(', ');
    lines.push(`    ${chunk},`);
  }
  lines.push(`};`);
  return lines.join('\n');
}

function formatWordArray(name, words) {
  const hex = words.map(hex4).join(', ');
  return `const unsigned short ${name}[16] = {\n    ${hex}\n};`;
}

// --- Main conversion ---

function convert(inputPath, varName, fallback) {
  const raw = fs.readFileSync(inputPath);
  const png = PNG.sync.read(raw);
  const { width, height } = png;

  if (width % 8 !== 0 || height % 8 !== 0) {
    console.error(`Error: image size ${width}x${height} is not a multiple of 8`);
    process.exit(1);
  }

  const { palette, seen, overflow } = buildPalette(png);

  if (overflow) {
    const fallbackDesc = fallback === 'nearest' ? 'nearest palette color'
      : fallback === 'transparent' ? 'transparent (index 0)'
      : `palette index ${fallback}`;
    console.warn(`Warning: more than 15 opaque colors found; excess pixels mapped to ${fallbackDesc}. Use --fallback to change this behavior.`);
  }

  // Build 16-entry GG palette word array (unused slots = 0x0000)
  const paletteWords = new Array(16).fill(0);
  for (let i = 1; i < palette.length; i++) {
    const { r, g, b } = palette[i];
    paletteWords[i] = packGGColor(r, g, b);
  }

  // Encode all 8x8 tiles left-to-right, top-to-bottom
  const tilesX = width / 8;
  const tilesY = height / 8;
  const tileBytes = [];
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      tileBytes.push(...encodeTile(png, palette, seen, tx, ty, fallback));
    }
  }

  const numTiles = tilesX * tilesY;
  const numColors = palette.length - 1; // exclude transparent slot

  const header = [
    `/* Generated by ggpng2tile from ${path.basename(inputPath)} */`,
    `/* ${width}x${height} px — ${numTiles} tile${numTiles !== 1 ? 's' : ''}, ${numColors} color${numColors !== 1 ? 's' : ''} + transparent */`,
    ``,
  ].join('\n');

  const c = [
    header,
    formatByteArray(`${varName}_tiles`, tileBytes),
    ``,
    formatWordArray(`${varName}_palette`, paletteWords),
    ``,
  ].join('\n');

  const h = [
    header,
    `#ifndef ${varName.toUpperCase()}_H`,
    `#define ${varName.toUpperCase()}_H`,
    ``,
    `extern const unsigned char ${varName}_tiles[${tileBytes.length}];`,
    `extern const unsigned short ${varName}_palette[16];`,
    ``,
    `#define ${varName.toUpperCase()}_NUM_TILES ${numTiles}`,
    ``,
    `#endif`,
    ``,
  ].join('\n');

  return { c, h, numTiles, numColors, width, height };
}

// --- CLI ---

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {};
  const positional = [];

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        flags[arg.slice(2)] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

function parseFallback(value) {
  if (value === undefined || value === 'nearest') return 'nearest';
  if (value === 'transparent') return 'transparent';
  const n = parseInt(value, 10);
  if (!isNaN(n) && n >= 0 && n <= 15) return n;
  console.error(`Error: --fallback must be 'nearest', 'transparent', or a palette index 0-15 (got '${value}')`);
  process.exit(1);
}

const { flags, positional } = parseArgs(process.argv);
const [input, outputName] = positional;

if (!input || flags['help'] || flags['h']) {
  console.log('Usage: ggpng2tile <input.png> [output_name] [options]');
  console.log('');
  console.log('  input.png      source image (dimensions must be multiples of 8)');
  console.log('  output_name    C variable/file prefix (default: filename without extension)');
  console.log('');
  console.log('Options:');
  console.log('  --fallback=<value>   behavior when palette is full (default: nearest)');
  console.log('    nearest            map excess colors to the closest palette entry');
  console.log('    transparent        map excess colors to transparent (index 0)');
  console.log('    0-15               map excess colors to a specific palette index');
  process.exit(input ? 0 : 1);
}

const fallback = parseFallback(flags['fallback']);
const varName = (outputName || path.basename(input, '.png')).replace(/[^a-zA-Z0-9]/g, '_');
const { c, h, numTiles, numColors, width, height } = convert(input, varName, fallback);

fs.writeFileSync(`${varName}.c`, c);
fs.writeFileSync(`${varName}.h`, h);

console.log(`${width}x${height} → ${numTiles} tile(s), ${numColors} color(s) + transparent`);
console.log(`Wrote ${varName}.c and ${varName}.h`);
