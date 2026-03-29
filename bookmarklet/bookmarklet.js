/**
 * PDF Saver Bookmarklet — unminified source
 *
 * Zero-install fallback. Save this as a bookmark URL in Safari (after minifying).
 * The CI pipeline produces a ready-to-use minified version as a release artifact.
 *
 * Usage on iPhone:
 *   1. Open bookmarklet/index.html in Safari and follow the install steps.
 *   2. On any article page, open Bookmarks and tap "Save as PDF".
 *   3. A clean article page opens → tap Share → Print → Save to Files.
 */
(function () {
  'use strict';

  // ── Utilities ────────────────────────────────────────────────────
  function escHtml(s) {
    return (s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Title ────────────────────────────────────────────────────────
  function getTitle() {
    var og = document.querySelector('meta[property="og:title"]');
    if (og && og.content) return og.content.trim();
    var h1 = document.querySelector('article h1, main h1, h1');
    if (h1) return h1.textContent.trim();
    return document.title.split(/\s*[|\-\u2013\u2014]\s*/)[0].trim();
  }

  // ── Byline ───────────────────────────────────────────────────────
  function getByline() {
    var sels = [
      'meta[name="author"]', '[rel="author"]', '[itemprop="author"]',
      '.author', '.byline', '[class*="author"]', '[class*="byline"]'
    ];
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (!el) continue;
      var t = (el.tagName === 'META' ? el.getAttribute('content') : el.textContent);
      if (!t) continue;
      var clean = t.trim().replace(/^by\s+/i, '');
      if (clean.length > 0 && clean.length < 150) return clean;
    }
    return null;
  }

  // ── Site name ────────────────────────────────────────────────────
  function getSiteName() {
    var og = document.querySelector('meta[property="og:site_name"]');
    if (og && og.content) return og.content.trim();
    return window.location.hostname.replace(/^www\./, '');
  }

  // ── Scoring ──────────────────────────────────────────────────────
  var NEG = /comment|footer|footnote|foot|nav|header|side|sidebar|sponsor|ad-|^ads$| ads |popup|subscribe|social|share|related|widget|cookie/i;
  var POS = /article|body|content|entry|main|page|post|text|blog|story/i;

  function scoreEl(el) {
    var s = 0;
    var ci = ((el.className || '') + ' ' + (el.id || '')).toLowerCase();
    if (NEG.test(ci)) s -= 20;
    if (POS.test(ci)) s += 20;
    var txt = el.innerText || el.textContent || '';
    s += Math.min(Math.floor(txt.length / 100), 10);
    s += Math.min((txt.match(/,/g) || []).length, 5);
    var links = el.querySelectorAll('a');
    var lt = Array.prototype.reduce.call(links, function (n, a) { return n + (a.textContent || '').length; }, 0);
    if (txt.length > 0 && lt / txt.length > 0.5) s -= 10;
    return s;
  }

  // ── Content extraction ───────────────────────────────────────────
  function findBestEl() {
    var sels = [
      'article', '[role="article"]', '[role="main"]', 'main',
      '.post-content', '.article-content', '.entry-content',
      '.story-body', '#article-body', '#content', '.content'
    ];
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (el && (el.innerText || el.textContent || '').trim().length > 300) return el;
    }
    var all = document.querySelectorAll('div, section, article');
    var best = document.body, bs = -Infinity;
    for (var j = 0; j < all.length; j++) {
      var sc = scoreEl(all[j]);
      if (sc > bs) { bs = sc; best = all[j]; }
    }
    return best;
  }

  var STRIP = 'script,noscript,style,iframe,form,button,input,select,textarea,nav,header,footer,aside';
  var STRIP_CLS = /comment|footer|nav|sidebar|social|share|related|sponsor|ad-|popup|subscribe|cookie|widget/i;
  var SAFE = { href: 1, src: 1, alt: 1, title: 1, width: 1, height: 1 };

  function cleanEl(el) {
    var clone = el.cloneNode(true);
    STRIP.split(',').forEach(function (tag) {
      clone.querySelectorAll(tag).forEach(function (n) { n.remove(); });
    });
    clone.querySelectorAll('[class],[id]').forEach(function (n) {
      if (STRIP_CLS.test(((n.className || '') + ' ' + (n.id || '')).toLowerCase())) n.remove();
    });
    clone.querySelectorAll('*').forEach(function (n) {
      Array.prototype.slice.call(n.attributes).forEach(function (a) {
        if (!SAFE[a.name]) n.removeAttribute(a.name);
      });
    });
    clone.querySelectorAll('img[src]').forEach(function (img) {
      try { img.src = new URL(img.getAttribute('src'), window.location.href).href; }
      catch (e) { img.remove(); }
    });
    clone.querySelectorAll('a[href]').forEach(function (a) {
      try { a.href = new URL(a.getAttribute('href'), window.location.href).href; }
      catch (e) {}
    });
    return clone.innerHTML;
  }

  // ── Build & open print page ──────────────────────────────────────
  var title    = getTitle();
  var byline   = getByline();
  var siteName = getSiteName();
  var content  = cleanEl(findBestEl());
  var url      = window.location.href;

  var metaParts = [];
  if (byline)   metaParts.push(escHtml(byline));
  if (siteName) metaParts.push(escHtml(siteName));
  metaParts.push('<a href="' + escHtml(url) + '">' + escHtml(url) + '</a>');

  var css = [
    '@page{margin:1.5cm 2cm}',
    // Main bar — fixed at top, hidden when printing
    '#pbar{position:fixed;top:0;left:0;right:0;background:#007aff;color:white;'
      + 'display:flex;align-items:center;justify-content:space-between;'
      + 'padding:10px 16px;z-index:9999;font-family:-apple-system,sans-serif;'
      + 'box-shadow:0 2px 8px rgba(0,0,0,.25)}',
    '#pbar span{font-size:14px;font-weight:600}',
    '#pbar button{background:white;color:#007aff;border:none;border-radius:8px;'
      + 'padding:8px 18px;font-weight:700;font-size:14px;cursor:pointer}',
    '#pspacer{height:52px}',  // pushes content below the bar
    'body{font-family:Georgia,serif;font-size:18px;line-height:1.75;color:#1a1a1a;max-width:680px;margin:0 auto;padding:1rem 1.5rem 3rem}',
    'h1{font-size:1.85em;line-height:1.2;margin-bottom:.4em}',
    '.meta{font-family:-apple-system,sans-serif;font-size:.78em;color:#666;margin-bottom:2rem;padding-bottom:1rem;border-bottom:2px solid #e0e0e0}',
    '.meta a{color:#0070c9}',
    'img{max-width:100%;height:auto;display:block;margin:1.5rem auto}',
    'a{color:#0070c9}',
    'blockquote{margin:1.5rem 0;padding:.6rem 1rem;border-left:3px solid #ccc;color:#555;font-style:italic}',
    'pre{background:#f5f5f5;padding:1rem;border-radius:5px;overflow-x:auto;white-space:pre-wrap;font-size:.85em}',
    'code{font-family:monospace;font-size:.85em;background:#f0f0f0;padding:.15em .35em;border-radius:3px}',
    'pre code{background:none;padding:0}',
    'h2,h3,h4{margin:2rem 0 .5rem;line-height:1.3}',
    '@media print{'
      + '#pbar,#pspacer{display:none!important}'
      + 'body{font-size:11pt;max-width:none;padding:0}'
      + 'a{color:inherit}a[href]::after{content:none!important}'
      + 'img{page-break-inside:avoid}h1,h2,h3{page-break-after:avoid}'
      + 'p,li{orphans:3;widows:3}}',
  ].join('');

  // Sticky bar with Print button — more reliable than auto window.print() on iOS
  var bar = '<div id="pbar">'
    + '<span>PDF Saver</span>'
    + '<button onclick="window.print()">Save as PDF</button>'
    + '</div>'
    + '<div id="pspacer"></div>';

  var backLink = '<p style="margin-top:2rem;font-family:-apple-system,sans-serif;font-size:.85rem;color:#888">'
    + '<a href="' + escHtml(url) + '" style="color:#0070c9">&larr; Back to original article</a></p>';

  var html = '<!DOCTYPE html><html lang="en"><head>'
    + '<meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + escHtml(title) + '</title>'
    + '<style>' + css + '</style>'
    + '</head><body>'
    + bar
    + '<h1>' + escHtml(title) + '</h1>'
    + '<p class="meta">' + metaParts.join(' &mdash; ') + '</p>'
    + content
    + backLink
    + '</body></html>';

  // Replace the current page content — no popup needed, works on iOS without
  // any pop-up blocker issues.
  document.open();
  document.write(html);
  document.close();
})();
