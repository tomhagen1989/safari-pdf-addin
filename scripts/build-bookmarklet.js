#!/usr/bin/env node
/**
 * scripts/build-bookmarklet.js
 * Minifies bookmarklet/bookmarklet.js and injects it into bookmarklet/index.html
 * so the "Save as PDF" button has a ready-to-use javascript: href.
 *
 * Run:  node scripts/build-bookmarklet.js
 *
 * No external dependencies — pure Node.js string processing.
 * For a production build, swap the simple minifier below for terser/uglify-js.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT      = path.join(__dirname, '..');
const SRC       = path.join(ROOT, 'bookmarklet', 'bookmarklet.js');
const INDEX     = path.join(ROOT, 'bookmarklet', 'index.html');

// ── Simple minifier ──────────────────────────────────────────────────────────
function minify(src) {
  return src
    // Remove block comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Remove single-line comments
    .replace(/\/\/[^\n]*/g, '')
    // Collapse whitespace (newlines, tabs, multiple spaces → single space)
    .replace(/\s+/g, ' ')
    // Remove spaces around common operators / punctuation
    .replace(/\s*([{}();,=+\-*/<>!&|?:])\s*/g, '$1')
    // Restore spaces after keywords that need them
    .replace(/\b(var|let|const|function|return|if|else|for|while|new|typeof|instanceof|in|of|delete|throw|try|catch|finally)\b(?=[^\s])/g, '$1 ')
    .trim();
}

// ── Read and minify the bookmarklet source ────────────────────────────────────
const src = fs.readFileSync(SRC, 'utf8');
const min = minify(src);

// Encode for safe use in a javascript: URL
const encoded = encodeURIComponent(min);

console.log(`Source:  ${src.length} chars`);
console.log(`Minified: ${min.length} chars  (${Math.round((1 - min.length / src.length) * 100)}% reduction)`);

// ── Inject into index.html ────────────────────────────────────────────────────
let html = fs.readFileSync(INDEX, 'utf8');

if (html.includes('"BOOKMARKLET_PLACEHOLDER"')) {
  html = html.replace('"BOOKMARKLET_PLACEHOLDER"', JSON.stringify(encoded));
  fs.writeFileSync(INDEX, html, 'utf8');
  console.log(`\nInjected bookmarklet into ${INDEX}`);
} else {
  // Already injected — update the existing value
  html = html.replace(/var BOOKMARKLET = "[^"]*";/, `var BOOKMARKLET = ${JSON.stringify(encoded)};`);
  fs.writeFileSync(INDEX, html, 'utf8');
  console.log(`\nUpdated bookmarklet in ${INDEX}`);
}

// ── Also write a standalone .txt file with the ready-to-paste javascript: URL ──
const txt = 'javascript:' + encoded;
const outTxt = path.join(ROOT, 'bookmarklet', 'bookmarklet-url.txt');
fs.writeFileSync(outTxt, txt, 'utf8');
console.log(`Written: ${outTxt}  (paste this as a bookmark URL in Safari)`);
