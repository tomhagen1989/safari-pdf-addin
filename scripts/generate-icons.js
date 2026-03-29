#!/usr/bin/env node
/**
 * scripts/generate-icons.js
 * Generates PNG icons for the Safari extension.
 *
 * Requires:  npm install  (installs the 'canvas' package listed in package.json)
 * Run:       node scripts/generate-icons.js
 *
 * Output:    extension/icons/icon-{16,32,48,128}.png
 *
 * Icon design: blue rounded square, white page outline with text lines,
 * white down-arrow to indicate PDF download.
 */

'use strict';

const { createCanvas } = require('@napi-rs/canvas');
const fs   = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'extension', 'icons');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const SIZES = [16, 32, 48, 128];

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx    = canvas.getContext('2d');
  const s      = size;           // shorthand

  // ── Rounded blue background ──────────────────────────────────────
  const r = s * 0.14;
  ctx.fillStyle = '#0070c9';
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(s - r, 0);
  ctx.quadraticCurveTo(s, 0, s, r);
  ctx.lineTo(s, s - r);
  ctx.quadraticCurveTo(s, s, s - r, s);
  ctx.lineTo(r, s);
  ctx.quadraticCurveTo(0, s, 0, s - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  // ── White page rectangle ─────────────────────────────────────────
  const px = s * 0.16;
  const py = s * 0.11;
  const pw = s * 0.45;
  const ph = s * 0.62;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(px, py, pw, ph);

  // ── Text lines on the page (only for sizes ≥ 32) ─────────────────
  if (s >= 32) {
    ctx.fillStyle = '#0070c9';
    const lx  = px + s * 0.05;
    const lh  = s * 0.05;
    const gap = s * 0.09;
    const lw  = pw - s * 0.1;
    for (let i = 0; i < 4; i++) {
      const ly = py + s * 0.13 + i * gap;
      // Last line is shorter to look like natural text
      ctx.fillRect(lx, ly, i === 3 ? lw * 0.55 : lw, lh);
    }
  }

  // ── Down arrow (PDF save indicator) — right side ──────────────────
  const ax  = s * 0.76;
  const ay  = s * 0.52;
  const aw  = s * 0.19;
  const ah  = s * 0.24;
  const sw  = aw * 0.55;   // shaft width

  ctx.fillStyle = '#ffffff';

  // Shaft
  ctx.fillRect(ax - sw / 2, ay - ah * 0.45, sw, ah * 0.5);

  // Arrowhead triangle
  ctx.beginPath();
  ctx.moveTo(ax - aw / 2, ay);
  ctx.lineTo(ax + aw / 2, ay);
  ctx.lineTo(ax, ay + ah * 0.5);
  ctx.closePath();
  ctx.fill();

  return canvas.toBuffer('image/png');
}

SIZES.forEach(size => {
  const buf  = drawIcon(size);
  const file = path.join(OUT_DIR, `icon-${size}.png`);
  fs.writeFileSync(file, buf);
  console.log(`  ✓  ${file}`);
});

console.log('\nIcons generated successfully.');
