/**
 * PDF Saver Bookmarklet — unminified source
 *
 * Usage on iPhone:
 *   1. Open bookmarklet/index.html in Safari and follow the install steps.
 *   2. On any article page, open Bookmarks and tap "Save as PDF".
 *   3. Tap the blue "Save as PDF" button → Share → Print → pinch preview → Save to Files.
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

  // ── Site theme (colors + font) ───────────────────────────────────
  // Reads computed styles from the live page so the PDF inherits the
  // site's background colour and body font rather than using white/Georgia.
  function getSiteTheme() {
    var theme = {
      bg: '#ffffff',
      color: '#1a1a1a',
      fontFamily: 'Georgia,"Times New Roman",serif'
    };

    // Font-family + text colour — sample a body paragraph
    var para = document.querySelector('article p, [role="article"] p, main p');
    if (para) {
      var cs = window.getComputedStyle(para);
      if (cs.fontFamily) theme.fontFamily = cs.fontFamily;
      if (cs.color && cs.color !== 'rgba(0, 0, 0, 0)') theme.color = cs.color;
    }

    // Background colour — walk from article outward; skip transparent/dark
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
      // Perceived brightness (Rec. 601): only use light backgrounds
      var bright = (parseInt(nums[0]) * 299 + parseInt(nums[1]) * 587 + parseInt(nums[2]) * 114) / 1000;
      if (bright > 140) { theme.bg = bg; break; }
    }

    return theme;
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

  // ── Published date ───────────────────────────────────────────────
  function getDate() {
    var sels = [
      'meta[property="article:published_time"]',
      'meta[name="pubdate"]',
      'meta[name="publishdate"]',
      'time[datetime]',
      '[itemprop="datePublished"]'
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

  var STRIP = 'script,noscript,style,iframe,form,button,input,select,textarea,nav,header,footer,aside,figure.ad';
  var STRIP_CLS = /comment|footer|nav|sidebar|social|share|related|sponsor|ad-|popup|subscribe|cookie|widget|flyout|overlay|modal/i;
  var SAFE = { href: 1, src: 1, alt: 1, width: 1, height: 1 };

  // Matches elements whose entire text is decorative quote punctuation
  // U+201C " U+201D " U+2018 ' U+2019 ' U+275B ❛ U+275C ❜ U+275D ❝ U+275E ❞
  var DECORATIVE_QUOTE = /^[\u201c\u201d\u2018\u2019\u0022\u275b-\u275e\u00ab\u00bb]{1,4}$/;

  // Pull-quote container selectors (detected before class-stripping)
  var PQ_SEL = '[class*="pullquote"],[class*="pull-quote"],[class*="pull_quote"],'
    + '[class*="quote-block"],[class*="blockquote--pull"],[class*="featured-quote"],'
    + '[class*="article-quote"],[class*="inset-quote"],[class*="story-quote"]';

  function cleanEl(el) {
    var clone = el.cloneNode(true);

    // ── Step 1: Normalise pull-quote containers ────────────────────
    // Do this BEFORE stripping classes so we can still detect them.
    try {
      clone.querySelectorAll(PQ_SEL).forEach(function (pq) {
        var texts = [];
        // Collect non-decorative text lines from direct children
        pq.querySelectorAll('p, blockquote, div').forEach(function (child) {
          // Skip deeply nested nodes (only want top-level paragraphs)
          if (child.parentNode !== pq && child.parentNode.parentNode !== pq) return;
          var t = child.textContent.trim();
          if (!t || DECORATIVE_QUOTE.test(t)) return;
          if (texts.indexOf(t) === -1) texts.push(t);
        });
        if (texts.length === 0) return;

        var bq = document.createElement('blockquote');
        bq.setAttribute('data-pullquote', '1');

        // Last short item is likely an attribution line
        var last = texts[texts.length - 1];
        var attrib = null;
        if (texts.length > 1 && last.length < 120 && last.length < texts[0].length * 0.8) {
          attrib = texts.pop();
        }

        var qp = document.createElement('p');
        qp.textContent = texts.join(' ');
        bq.appendChild(qp);

        if (attrib) {
          var cite = document.createElement('cite');
          cite.textContent = attrib;
          bq.appendChild(cite);
        }

        pq.parentNode.replaceChild(bq, pq);
      });
    } catch (e) {}

    // ── Step 2: Remove structural noise ───────────────────────────
    STRIP.split(',').forEach(function (tag) {
      try { clone.querySelectorAll(tag.trim()).forEach(function (n) { n.remove(); }); } catch(e) {}
    });

    clone.querySelectorAll('[class],[id]').forEach(function (n) {
      var ci = ((n.className || '') + ' ' + (n.id || '')).toLowerCase();
      if (STRIP_CLS.test(ci)) n.remove();
    });

    // Remove hidden/assistive elements and tooltip POPUPS.
    // Important: do NOT use [class*="tooltip"] here — tooltip wrapper elements
    // often contain the real visible link text (e.g. The Ken's footnote links).
    // [role="tooltip"] targets only the popup bubble, not the trigger.
    clone.querySelectorAll(
      '[aria-hidden="true"],[hidden],[role="tooltip"],'
      + '[class*="sr-only"],[class*="screen-reader"],[class*="visually-hidden"]'
    ).forEach(function (n) { n.remove(); });

    // ── Step 3: Remove orphaned decorative quote characters ────────
    // e.g. a lone " or " left behind after pull-quote or CSS-icon elements
    clone.querySelectorAll('p,div,span,h1,h2,h3,h4,h5,h6').forEach(function (n) {
      if (n.children.length === 0 && DECORATIVE_QUOTE.test(n.textContent.trim())) {
        n.remove();
      }
    });

    // ── Step 4: Resolve lazy-loaded images ────────────────────────
    clone.querySelectorAll('img').forEach(function (img) {
      var lazySrc = img.getAttribute('data-src')
        || img.getAttribute('data-lazy-src')
        || img.getAttribute('data-original')
        || img.getAttribute('data-img-src')
        || img.getAttribute('data-delayed-url');
      if (lazySrc) {
        try { img.setAttribute('src', new URL(lazySrc, window.location.href).href); }
        catch (e) {}
      }
    });

    // ── Step 5: Strip all attributes except safe allow-list ───────
    clone.querySelectorAll('*').forEach(function (n) {
      // Preserve data-pullquote we added above
      var keepPQ = n.getAttribute('data-pullquote');
      Array.prototype.slice.call(n.attributes).forEach(function (a) {
        if (!SAFE[a.name] && a.name !== 'data-pullquote') n.removeAttribute(a.name);
      });
      if (keepPQ) n.setAttribute('data-pullquote', keepPQ);
    });

    // ── Step 6: Resolve relative URLs ─────────────────────────────
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

  // ── Reading time estimate ────────────────────────────────────────
  function readingTime(html) {
    var words = (html.replace(/<[^>]+>/g, ' ').match(/\S+/g) || []).length;
    var mins = Math.max(1, Math.round(words / 200));
    return mins + ' min read';
  }

  // ── Gather everything ────────────────────────────────────────────
  var theme    = getSiteTheme();
  var title    = getTitle();
  var byline   = getByline();
  var pubDate  = getDate();
  var siteName = getSiteName();
  var content  = cleanEl(findBestEl());
  var url      = window.location.href;
  var estTime  = readingTime(content);

  // Meta line: Author · Date · Site · Reading time
  var metaParts = [];
  if (byline)   metaParts.push(escHtml(byline));
  if (pubDate)  metaParts.push(escHtml(pubDate));
  if (siteName) metaParts.push('<a href="' + escHtml(url) + '">' + escHtml(siteName) + '</a>');
  metaParts.push(escHtml(estTime));

  // ── Styles ───────────────────────────────────────────────────────
  var css = [
    '@page{margin:2cm 2.5cm}',

    // ── Sticky bar (hidden in print) ──────────────────────────────
    '#pbar{position:fixed;top:0;left:0;right:0;background:#1a1a1a;color:white;'
      + 'display:flex;align-items:center;justify-content:space-between;'
      + 'padding:10px 20px;z-index:9999;font-family:-apple-system,sans-serif}',
    '#pbar .logo{font-size:13px;font-weight:600;letter-spacing:.04em;opacity:.7}',
    '#pbar button{background:#fff;color:#1a1a1a;border:none;border-radius:6px;'
      + 'padding:7px 18px;font-weight:700;font-size:13px;cursor:pointer;letter-spacing:.02em}',
    '#pspacer{height:48px}',

    // ── Article layout — use site's own bg + font ─────────────────
    'body{font-family:' + theme.fontFamily + ';font-size:20px;line-height:1.8;'
      + 'color:' + theme.color + ';background:' + theme.bg + ';'
      + 'max-width:700px;margin:0 auto;padding:1.5rem 1.5rem 4rem;'
      + '-webkit-font-smoothing:antialiased}',

    'h1{font-size:2.1em;line-height:1.15;font-weight:700;letter-spacing:-.02em;'
      + 'margin-bottom:.5rem}',

    '.meta{font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:.75em;'
      + 'color:#888;margin-bottom:2.5rem;padding-bottom:1.2rem;'
      + 'border-bottom:1px solid rgba(0,0,0,.12);line-height:1.6}',
    '.meta a{color:inherit;text-decoration:underline;text-underline-offset:2px}',

    'p{margin:0 0 1.4em}',

    'h2{font-size:1.35em;font-weight:700;line-height:1.25;margin:2.5rem 0 .6rem;letter-spacing:-.01em}',
    'h3{font-size:1.1em;font-weight:700;line-height:1.3;margin:2rem 0 .5rem}',
    'h4,h5{font-size:1em;font-weight:700;margin:1.5rem 0 .4rem}',

    // ── Regular inline blockquotes ────────────────────────────────
    'blockquote:not([data-pullquote]){'
      + 'margin:2rem 0;padding:.8rem 1.4rem;'
      + 'border-left:3px solid rgba(0,0,0,.2);'
      + 'font-size:1.05em;line-height:1.65;font-style:italic;color:#444}',
    'blockquote:not([data-pullquote]) p{margin:0}',

    // ── Pull quotes — magazine style ──────────────────────────────
    // Centred, large, separated from body text by rules, no border-left
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

    'img{max-width:100%;height:auto;display:block;margin:2rem auto;border-radius:3px}',
    'figcaption{font-family:-apple-system,sans-serif;font-size:.78em;color:#999;'
      + 'text-align:center;margin:-1rem 0 2rem}',

    'hr{border:none;border-top:1px solid rgba(0,0,0,.12);margin:2rem 0}',

    'ul,ol{padding-left:1.5rem;margin:0 0 1.4em}',
    'li{margin-bottom:.4em}',

    'pre{background:rgba(0,0,0,.04);padding:1rem;border-radius:4px;overflow-x:auto;'
      + 'white-space:pre-wrap;font-size:.82em;margin:0 0 1.4em}',
    'code{font-family:"SF Mono",Menlo,monospace;font-size:.82em;'
      + 'background:rgba(0,0,0,.06);padding:.15em .35em;border-radius:3px}',
    'pre code{background:none;padding:0}',

    '.back{font-family:-apple-system,sans-serif;font-size:.8em;color:#999;'
      + 'margin-top:3rem;padding-top:1.5rem;border-top:1px solid rgba(0,0,0,.1)}',
    '.back a{color:#999}',

    // ── Print overrides ───────────────────────────────────────────
    '@media print{'
      + '#pbar,#pspacer{display:none!important}'
      + 'body{font-size:11pt;max-width:none;padding:0;line-height:1.65}'
      + 'h1{font-size:22pt}h2{font-size:14pt}h3{font-size:12pt}'
      + 'a{color:inherit;text-decoration:none}'
      + 'a[href]::after{content:none!important}'
      + 'img{max-height:4in;page-break-inside:avoid}'
      + 'h1,h2,h3{page-break-after:avoid}'
      + 'p,li{orphans:3;widows:3}'
      + 'blockquote[data-pullquote]{page-break-inside:avoid}'
      + '}',
  ].join('');

  var bar = '<div id="pbar">'
    + '<span class="logo">PDF SAVER</span>'
    + '<button onclick="window.print()">Save as PDF</button>'
    + '</div>'
    + '<div id="pspacer"></div>';

  var backLink = '<p class="back"><a href="' + escHtml(url) + '">&larr; Back to original article</a></p>';

  var html = '<!DOCTYPE html><html lang="en"><head>'
    + '<meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + escHtml(title) + '</title>'
    + '<style>' + css + '</style>'
    + '</head><body>'
    + bar
    + '<h1>' + escHtml(title) + '</h1>'
    + '<p class="meta">' + metaParts.join(' &nbsp;&middot;&nbsp; ') + '</p>'
    + content
    + backLink
    + '</body></html>';

  document.open();
  document.write(html);
  document.close();
})();
