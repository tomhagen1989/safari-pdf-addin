/**
 * PDF Saver Bookmarklet — unminified source
 *
 * Extraction: Mozilla Readability.js (hosted on GitHub Pages), with
 * a fallback to our own scoring algorithm if the network request fails.
 *
 * Usage on iPhone:
 *   1. Open the installer page in Safari and follow the install steps.
 *   2. On any article page, open Bookmarks and tap "Save as PDF".
 *   3. Tap the blue "Save as PDF" button → Share → Print → pinch → Save to Files.
 */
(function () {
  'use strict';

  var READABILITY_URL = 'https:/' + '/tomhagen1989.github.io/safari-pdf-addin/readability.js';

  // ── Utilities ────────────────────────────────────────────────────
  function escHtml(s) {
    return (s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Site theme (colors + font) ───────────────────────────────────
  // Must be called BEFORE Readability modifies the DOM.
  function getSiteTheme() {
    var theme = {
      bg: '#ffffff',
      color: '#1a1a1a',
      fontFamily: 'Georgia,"Times New Roman",serif'
    };

    var para = document.querySelector('article p, [role="article"] p, main p');
    if (para) {
      var cs = window.getComputedStyle(para);
      if (cs.fontFamily) theme.fontFamily = cs.fontFamily;
      if (cs.color && cs.color !== 'rgba(0, 0, 0, 0)') theme.color = cs.color;
    }

    var bgCandidates = [
      'article', '[role="article"]', '.article-body', '.article-content',
      '.story-body', '.post-content', '.entry-content', 'main', 'body'
    ];
    for (var i = 0; i < bgCandidates.length; i++) {
      var el = document.querySelector(bgCandidates[i]);
      if (!el) continue;
      var bg = window.getComputedStyle(el).backgroundColor;
      if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') continue;
      var nums = bg.match(/\d+/g);
      if (!nums || nums.length < 3) continue;
      var bright = (parseInt(nums[0]) * 299 + parseInt(nums[1]) * 587 + parseInt(nums[2]) * 114) / 1000;
      if (bright > 140) { theme.bg = bg; break; }
    }

    return theme;
  }

  // ── Metadata helpers ─────────────────────────────────────────────
  function getTitle() {
    var og = document.querySelector('meta[property="og:title"]');
    if (og && og.content) return og.content.trim();
    var h1 = document.querySelector('article h1, main h1, h1');
    if (h1) return h1.textContent.trim();
    return document.title.split(/\s*[|\-\u2013\u2014]\s*/)[0].trim();
  }

  function getByline() {
    var sels = [
      'meta[name="author"]', '[rel="author"]', '[itemprop="author"]',
      '.author', '.byline', '[class*="author"]', '[class*="byline"]'
    ];
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (!el) continue;
      var t = el.tagName === 'META' ? el.getAttribute('content') : el.textContent;
      if (!t) continue;
      var clean = t.trim().replace(/^by\s+/i, '');
      if (clean.length > 0 && clean.length < 150) return clean;
    }
    return null;
  }

  function getDate() {
    var sels = [
      'meta[property="article:published_time"]',
      'meta[name="pubdate"]', 'meta[name="publishdate"]',
      'time[datetime]', '[itemprop="datePublished"]'
    ];
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (!el) continue;
      var raw = el.getAttribute('datetime') || el.getAttribute('content') || el.textContent;
      if (!raw) continue;
      try {
        var d = new Date(raw.trim());
        if (!isNaN(d)) return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      } catch (e) {}
    }
    return null;
  }

  function getSiteName() {
    var og = document.querySelector('meta[property="og:site_name"]');
    if (og && og.content) return og.content.trim();
    return window.location.hostname.replace(/^www\./, '');
  }

  // ── Fallback extractor (used when Readability.js can't be fetched) ──
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

  var STRIP = 'script,noscript,style,svg,iframe,form,button,input,select,textarea,nav,footer,aside,figure.ad';
  var STRIP_CLS = /comment|footer|nav|sidebar|social|share|related|sponsor|ad-|popup|subscribe|cookie|widget|flyout|overlay|modal/i;
  var SAFE_ATTRS = { href: 1, src: 1, alt: 1, width: 1, height: 1, srcset: 1, sizes: 1 };
  var DECORATIVE_QUOTE = /^[\u201c\u201d\u2018\u2019\u0022\u275b-\u275e\u00ab\u00bb]{1,4}$/;
  var PQ_SEL = '[class*="pullquote"],[class*="pull-quote"],[class*="pull_quote"],'
    + '[class*="quote-block"],[class*="blockquote--pull"],[class*="featured-quote"],'
    + '[class*="article-quote"],[class*="inset-quote"],[class*="story-quote"],'
    + '[class*="editorial-quote"],[class*="entry-quote"],[class*="post-quote"],'
    + '[class*="quote-callout"],[class*="quote-highlight"],[class*="callout-quote"]';

  function fallbackExtract(el) {

    var clone = el.cloneNode(true);

    // ── Targeted pull-quote detection (The Ken & similar sites) ───────
    // Find by pull-quote-text class → grab parent container → replace.
    // This runs BEFORE general PQ_SEL so The Ken's exact class is caught.
    try {
      var pqTextSel = '[class*="pull-quote-text"],[class*="pullquote__text"],'
        + '[class*="pullquote-text"],[class*="quote__text"],[class*="quote-body"]';
      clone.querySelectorAll(pqTextSel).forEach(function (textEl) {
        var container = textEl.parentNode;
        if (!container || !container.parentNode) return;
        var text = textEl.textContent.trim();
        if (!text) return;
        var srcEl = container.querySelector(
          '[class*="pull-quote-source"],[class*="pullquote-source"],'
          + '[class*="quote-source"],[class*="quote-attribution"],[class*="quote-cite"]'
        );
        var bq = document.createElement('blockquote');
        bq.setAttribute('data-pullquote', '1');
        var qp = document.createElement('p');
        qp.textContent = text;
        bq.appendChild(qp);
        if (srcEl) {
          var cite = document.createElement('cite');
          cite.textContent = srcEl.textContent.trim();
          bq.appendChild(cite);
        }
        container.parentNode.replaceChild(bq, container);
      });
    } catch (e) {}

    // ── General pull-quote detection (other sites) ────────────────────
    try {
      clone.querySelectorAll(PQ_SEL).forEach(function (pq) {
        var lines = (pq.textContent || '').split('\n')
          .map(function (l) { return l.trim(); })
          .filter(function (l) { return l && !DECORATIVE_QUOTE.test(l); });
        // Deduplicate consecutive identical lines
        lines = lines.filter(function (l, i) { return i === 0 || l !== lines[i - 1]; });
        if (lines.length === 0) return;

        var bq = document.createElement('blockquote');
        bq.setAttribute('data-pullquote', '1');

        var attrib = null;
        if (lines.length > 1) {
          var last = lines[lines.length - 1];
          if (last.length < 120 && last.length < lines[0].length * 0.8) {
            attrib = lines.pop();
          }
        }

        var qp = document.createElement('p');
        qp.textContent = lines.join(' ');
        bq.appendChild(qp);
        if (attrib) {
          var cite = document.createElement('cite');
          cite.textContent = attrib;
          bq.appendChild(cite);
        }
        pq.parentNode.replaceChild(bq, pq);
      });
    } catch (e) {}

    STRIP.split(',').forEach(function (tag) {
      try { clone.querySelectorAll(tag.trim()).forEach(function (n) { n.remove(); }); } catch (e) {}
    });
    clone.querySelectorAll('[class],[id]').forEach(function (n) {
      var ci = ((n.className || '') + ' ' + (n.id || '')).toLowerCase();
      if (STRIP_CLS.test(ci)) n.remove();
    });
    clone.querySelectorAll(
      '[aria-hidden="true"],[hidden],[role="tooltip"],'
      + '[class*="sr-only"],[class*="screen-reader"],[class*="visually-hidden"]'
    ).forEach(function (n) { n.remove(); });

    // Remove known pull-quote decoration elements by class (any that survived
    // container replacement, e.g. if the container class wasn't matched).
    clone.querySelectorAll(
      '[class*="pull-quote-img"],[class*="pullquote-img"],[class*="pull-quote-divider"],'
      + '[class*="pullquote-divider"],[class*="quote-divider"],[class*="quote-decoration"]'
    ).forEach(function (n) { n.remove(); });

    clone.querySelectorAll('p,div,span,h1,h2,h3,h4,h5,h6').forEach(function (n) {
      if (n.children.length === 0 && DECORATIVE_QUOTE.test(n.textContent.trim())) n.remove();
    });

    clone.querySelectorAll('img').forEach(function (img) {
      // Resolve lazy src
      var lz = img.getAttribute('data-src') || img.getAttribute('data-lazy-src')
        || img.getAttribute('data-original') || img.getAttribute('data-img-src')
        || img.getAttribute('data-delayed-url');
      if (lz) { try { img.setAttribute('src', new URL(lz, pageUrl).href); } catch (e) {} }
      // Resolve lazy srcset
      var lzSet = img.getAttribute('data-srcset') || img.getAttribute('data-lazy-srcset');
      if (lzSet) img.setAttribute('srcset', lzSet);
      // Remove decorative images: alt="" means explicitly decorative per a11y spec.
      // Extra guard: only remove if small (icon-sized) OR has no src at all.
      if (img.getAttribute('alt') === '') {
        var w = parseInt(img.getAttribute('width') || img.getAttribute('data-width') || '9999');
        var h = parseInt(img.getAttribute('height') || img.getAttribute('data-height') || '9999');
        var src = img.getAttribute('src') || img.getAttribute('data-src') || '';
        if (w < 120 || h < 120 || /icon|quote|bullet|ornament|decorat|logo/i.test(src)) {
          img.remove(); return;
        }
      }
    });
    clone.querySelectorAll('*').forEach(function (n) {
      var kpq = n.getAttribute('data-pullquote');
      Array.prototype.slice.call(n.attributes).forEach(function (a) {
        if (!SAFE_ATTRS[a.name] && a.name !== 'data-pullquote') n.removeAttribute(a.name);
      });
      if (kpq) n.setAttribute('data-pullquote', kpq);
    });
    clone.querySelectorAll('img[src]').forEach(function (img) {
      try { img.src = new URL(img.getAttribute('src'), pageUrl).href; }
      catch (e) { img.remove(); }
    });
    clone.querySelectorAll('a[href]').forEach(function (a) {
      try { a.href = new URL(a.getAttribute('href'), pageUrl).href; } catch (e) {}
    });

    var html = clone.innerHTML;

    // Prepend hero image (captured from og:image before DOM was mutated)
    if (heroHtml) html = heroHtml + html;

    return html;
  }

  // ── Post-process Readability's HTML output ───────────────────────
  // Readability already strips nav/ads/etc. We just fix images + hidden noise.
  function postProcess(html) {
    var div = document.createElement('div');
    div.innerHTML = html;

    // Resolve lazy images and remove decorative ones
    div.querySelectorAll('img').forEach(function (img) {
      var lz = img.getAttribute('data-src') || img.getAttribute('data-lazy-src')
        || img.getAttribute('data-original') || img.getAttribute('data-img-src')
        || img.getAttribute('data-delayed-url');
      if (lz) { try { img.setAttribute('src', new URL(lz, pageUrl).href); } catch (e) {} }
      var lzSet = img.getAttribute('data-srcset') || img.getAttribute('data-lazy-srcset');
      if (lzSet) img.setAttribute('srcset', lzSet);
      if (img.getAttribute('alt') === '') {
        var w = parseInt(img.getAttribute('width') || '9999');
        var h = parseInt(img.getAttribute('height') || '9999');
        var src = img.getAttribute('src') || '';
        if (w < 120 || h < 120 || /icon|quote|bullet|ornament|decorat|logo/i.test(src)) {
          img.remove(); return;
        }
      }
    });

    // Remove inline SVG icons (decorative quote marks, share icons, etc.)
    div.querySelectorAll('svg').forEach(function (n) { n.remove(); });

    // Remove hidden / tooltip popup elements
    div.querySelectorAll(
      '[aria-hidden="true"],[hidden],[role="tooltip"],'
      + '[class*="sr-only"],[class*="screen-reader"],[class*="visually-hidden"]'
    ).forEach(function (n) { n.remove(); });

    // Remove orphaned decorative quote characters
    div.querySelectorAll('p,div,span,h1,h2,h3,h4,h5,h6').forEach(function (n) {
      if (n.children.length === 0 && DECORATIVE_QUOTE.test(n.textContent.trim())) n.remove();
    });

    // Dedup short CTA links (mobile + desktop twins)
    var seenLinks = {};
    div.querySelectorAll('a').forEach(function (a) {
      var t = a.textContent.trim();
      if (!t || t.length > 80) return;
      var key = t.toLowerCase();
      if (seenLinks[key]) {
        var p = a.parentNode;
        if (p && p !== div && p.textContent.trim() === t) p.remove();
        else a.remove();
      } else {
        seenLinks[key] = true;
      }
    });

    // Ensure all URLs are absolute
    div.querySelectorAll('img[src]').forEach(function (img) {
      try { img.src = new URL(img.getAttribute('src'), pageUrl).href; }
      catch (e) { img.remove(); }
    });
    div.querySelectorAll('a[href]').forEach(function (a) {
      try { a.href = new URL(a.getAttribute('href'), pageUrl).href; } catch (e) {}
    });

    return div.innerHTML;
  }

  // ── Reading time ─────────────────────────────────────────────────
  function readingTime(html) {
    var words = (html.replace(/<[^>]+>/g, ' ').match(/\S+/g) || []).length;
    return Math.max(1, Math.round(words / 200)) + ' min read';
  }

  // ── Render the clean page ────────────────────────────────────────
  function renderPage(content, extractedTitle, extractedByline) {
    var t = extractedTitle || title;
    var b = extractedByline || byline;
    var estTime = readingTime(content);

    var metaParts = [];
    if (b)        metaParts.push(escHtml(b));
    if (pubDate)  metaParts.push(escHtml(pubDate));
    if (siteName) metaParts.push('<a href="' + escHtml(pageUrl) + '">' + escHtml(siteName) + '</a>');
    metaParts.push(escHtml(estTime));

    var css = [
      '@page{margin:2cm 2.5cm}',

      '#pbar{position:fixed;top:0;left:0;right:0;background:#1a1a1a;color:white;'
        + 'display:flex;align-items:center;justify-content:space-between;'
        + 'padding:10px 20px;z-index:9999;font-family:-apple-system,sans-serif}',
      '#pbar .logo{font-size:13px;font-weight:600;letter-spacing:.04em;opacity:.7}',
      '#pbar button{background:#fff;color:#1a1a1a;border:none;border-radius:6px;'
        + 'padding:7px 18px;font-weight:700;font-size:13px;cursor:pointer;letter-spacing:.02em}',
      '#pspacer{height:48px}',

      'body{font-family:' + theme.fontFamily + ';font-size:18px;line-height:1.6;'
        + 'color:' + theme.color + ';background:' + theme.bg + ';'
        + 'max-width:700px;margin:0 auto;padding:1.5rem 1.5rem 4rem;'
        + '-webkit-font-smoothing:antialiased}',

      'h1{font-size:2em;line-height:1.15;font-weight:700;letter-spacing:-.02em;'
        + 'margin-bottom:.5rem;word-break:break-word}',

      '.meta{font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:.75em;'
        + 'color:#888;margin-bottom:2.5rem;padding-bottom:1.2rem;'
        + 'border-bottom:1px solid rgba(0,0,0,.12);line-height:1.6}',
      '.meta a{color:inherit;text-decoration:underline;text-underline-offset:2px}',

      'p{margin:0 0 1em}',

      'h2{font-size:1.3em;font-weight:700;line-height:1.25;margin:2rem 0 .5rem;'
        + 'letter-spacing:-.01em;word-break:break-word}',
      'h3{font-size:1.1em;font-weight:700;line-height:1.3;margin:1.5rem 0 .4rem;word-break:break-word}',
      'h4,h5{font-size:1em;font-weight:700;margin:1.2rem 0 .3rem}',

      'blockquote:not([data-pullquote]){'
        + 'margin:1.5rem 0;padding:.8rem 1.4rem;'
        + 'border-left:3px solid rgba(0,0,0,.2);'
        + 'font-size:1.05em;line-height:1.6;font-style:italic;color:#444}',
      'blockquote:not([data-pullquote]) p{margin:0}',

      'blockquote[data-pullquote]{'
        + 'margin:2.5rem 0;padding:1.6rem 0;'
        + 'border:none;border-top:2px solid rgba(0,0,0,.15);border-bottom:2px solid rgba(0,0,0,.15);'
        + 'font-size:1.35em;line-height:1.45;font-style:italic;font-weight:600;'
        + 'text-align:center;color:#333}',
      'blockquote[data-pullquote] p{margin:0}',
      'blockquote[data-pullquote] cite{'
        + 'display:block;margin-top:.9rem;'
        + 'font-size:.58em;font-weight:500;font-style:normal;'
        + 'text-transform:uppercase;letter-spacing:.1em;color:#999}',

      'img{max-width:100%;height:auto;display:block;margin:1.5rem auto;border-radius:3px}',
      'figcaption{font-family:-apple-system,sans-serif;font-size:.78em;color:#999;'
        + 'text-align:center;margin:-.8rem 0 1.5rem}',

      'hr{border:none;border-top:1px solid rgba(0,0,0,.12);margin:2rem 0}',

      'ul,ol{padding-left:1.5rem;margin:0 0 1em}',
      'li{margin-bottom:.3em}',

      'table{border-collapse:collapse;width:100%;margin:1.5rem 0;font-size:.9em}',
      'th,td{border:1px solid rgba(0,0,0,.15);padding:.5rem .7rem;text-align:left;vertical-align:top}',
      'th{background:rgba(0,0,0,.05);font-weight:700}',
      'tr:nth-child(even) td{background:rgba(0,0,0,.02)}',

      'pre{background:rgba(0,0,0,.04);padding:1rem;border-radius:4px;overflow-x:auto;'
        + 'white-space:pre-wrap;font-size:.82em;margin:0 0 1em}',
      'code{font-family:"SF Mono",Menlo,monospace;font-size:.82em;'
        + 'background:rgba(0,0,0,.06);padding:.15em .35em;border-radius:3px}',
      'pre code{background:none;padding:0}',

      '.back{font-family:-apple-system,sans-serif;font-size:.8em;color:#999;'
        + 'margin-top:3rem;padding-top:1.5rem;border-top:1px solid rgba(0,0,0,.1)}',
      '.back a{color:#999}',

      '@media print{'
        + '#pbar,#pspacer{display:none!important}'
        + 'body{font-size:11pt;max-width:none;padding:0;line-height:1.6}'
        + 'h1{font-size:22pt}h2{font-size:14pt}h3{font-size:12pt}'
        + 'a{color:inherit;text-decoration:none}'
        + 'a[href]::after{content:none!important}'
        + 'img{max-height:4in;page-break-inside:avoid}'
        + 'h1,h2,h3{page-break-after:avoid}'
        + 'p,li{orphans:3;widows:3}'
        + 'blockquote[data-pullquote]{page-break-inside:avoid}'
        + 'table{page-break-inside:avoid}'
        + '*:not(body){background-color:transparent!important;box-shadow:none!important}'
        + '}',
    ].join('');

    var bar = '<div id="pbar">'
      + '<span class="logo">PDF SAVER</span>'
      + '<button onclick="window.print()">Save as PDF</button>'
      + '</div><div id="pspacer"></div>';

    var backLink = '<p class="back"><a href="' + escHtml(pageUrl) + '">&larr; Back to original article</a></p>';

    var html = '<!DOCTYPE html><html lang="en"><head>'
      + '<meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>' + escHtml([t, siteName, pubDate].filter(Boolean).join(' \u2013 ')) + '</title>'
      + '<style>' + css + '</style>'
      + '</head><body>'
      + bar
      + '<h1>' + escHtml(t) + '</h1>'
      + '<p class="meta">' + metaParts.join(' &nbsp;&middot;&nbsp; ') + '</p>'
      + content
      + backLink
      + '</body></html>';

    document.open();
    document.write(html);
    document.close();
  }

  // ── Capture metadata NOW, before Readability mutates the DOM ─────
  var theme    = getSiteTheme();
  var title    = getTitle();
  var byline   = getByline();
  var pubDate  = getDate();
  var siteName = getSiteName();
  var pageUrl  = window.location.href;

  // ── Hero image: og:image is the most reliable source ────────────
  // WordPress / CMSes always populate this with the featured image.
  // We capture it before Readability can mutate the DOM, and prepend
  // it in both the Readability and fallback code paths.
  var heroHtml = '';
  var heroSrc  = '';
  try {
    var ogImgEl = document.querySelector('meta[property="og:image"]');
    if (ogImgEl && ogImgEl.content) {
      heroSrc  = new URL(ogImgEl.content.trim(), pageUrl).href;
      heroHtml = '<figure><img src="' + escHtml(heroSrc) + '" alt=""></figure>';
    }
  } catch (e) {}

  // ── Show loading overlay immediately ─────────────────────────────
  // Gives instant visual feedback. Disappears when document.write() fires.
  // We inject into the live DOM (not document.write) so our script tag
  // injection below is not disrupted.
  try {
    var overlay = document.createElement('div');
    overlay.id = 'pdfSaverOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;'
      + 'background:rgba(26,26,26,.7);display:flex;align-items:center;'
      + 'justify-content:center;z-index:2147483647;'
      + 'font-family:-apple-system,sans-serif;font-size:17px;color:#fff;'
      + 'letter-spacing:.02em;pointer-events:none';
    overlay.textContent = 'Loading article\u2026';
    document.body.appendChild(overlay);
  } catch (e) {}

  // ── Extract and render ───────────────────────────────────────────
  var done = false;

  function finish(content, exTitle, exByline) {
    if (done) return;
    done = true;
    renderPage(content, exTitle || null, exByline || null);
  }

  // ── The Ken fast path ────────────────────────────────────────────
  // Skip Readability.js entirely: use the known article selector directly.
  if (/\bthe-ken\.com\b/.test(window.location.hostname)) {
    var kenEl = document.querySelector('main.story-content') || document.body;
    // Strip Ken-specific CTAs before extraction
    try {
      kenEl.querySelectorAll('a, p, div').forEach(function (n) {
        if (/^\s*see more visual stories\s*$/i.test(n.textContent)) n.remove();
      });
    } catch (e) {}
    finish(fallbackExtract(kenEl));
  } else {
    // ── Generic path: Readability.js with CSP-timeout fallback ─────
    // CSP violations do NOT fire script.onerror on iOS Safari, so we use
    // a timeout as the safety net.
    var cspTimeout = setTimeout(function () {
      finish(fallbackExtract(findBestEl()));
    }, 4000);

    var script = document.createElement('script');
    script.src = READABILITY_URL;

    script.onload = function () {
      clearTimeout(cspTimeout);
      try {
        var article = new Readability(document).parse(); // eslint-disable-line no-undef
        if (article && article.content && article.content.length > 300) {
          var processed = postProcess(article.content);
          var prefix = (heroHtml && heroSrc && processed.indexOf(heroSrc) === -1) ? heroHtml : '';
          finish(prefix + processed, article.title, article.byline);
          return;
        }
      } catch (e) {}
      finish(fallbackExtract(findBestEl()));
    };

    script.onerror = function () {
      clearTimeout(cspTimeout);
      finish(fallbackExtract(findBestEl()));
    };

    document.head.appendChild(script);
  }
})();
