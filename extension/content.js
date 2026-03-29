/**
 * content.js — Article extractor
 * Injected into every page. Listens for an 'extract' message from popup.js
 * and replies with { title, byline, siteName, content } extracted from the page.
 */
(function () {
  'use strict';

  const api = typeof browser !== 'undefined' ? browser : chrome;

  // ---------------------------------------------------------------------------
  // Title
  // ---------------------------------------------------------------------------
  function getTitle() {
    const og = document.querySelector('meta[property="og:title"]');
    if (og && og.content) return og.content.trim();

    const articleH1 = document.querySelector('article h1, main h1, [role="main"] h1');
    if (articleH1) return articleH1.textContent.trim();

    const h1 = document.querySelector('h1');
    if (h1) return h1.textContent.trim();

    // Strip site-name suffixes like " | Site Name" or " - Site Name"
    return document.title.split(/\s*[|\-–—]\s*/)[0].trim();
  }

  // ---------------------------------------------------------------------------
  // Byline
  // ---------------------------------------------------------------------------
  function getByline() {
    const selectors = [
      'meta[name="author"]',
      '[rel="author"]',
      '[itemprop="author"]',
      '.author',
      '.byline',
      '[class*="author"]',
      '[class*="byline"]',
      '[data-testid*="author"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const text = el.tagName === 'META'
        ? el.getAttribute('content')
        : el.textContent;
      if (!text) continue;
      const clean = text.trim().replace(/^by\s+/i, '');
      if (clean.length > 0 && clean.length < 150) return clean;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Site name
  // ---------------------------------------------------------------------------
  function getSiteName() {
    const og = document.querySelector('meta[property="og:site_name"]');
    if (og && og.content) return og.content.trim();
    try {
      return new URL(window.location.href).hostname.replace(/^www\./, '');
    } catch (_) {
      return window.location.hostname;
    }
  }

  // ---------------------------------------------------------------------------
  // Content extraction
  // ---------------------------------------------------------------------------

  // Patterns used when scoring or cleaning elements
  const NEGATIVE_RE = /comment|meta|footer|footnote|foot|nav|header|side|sidebar|sponsor|ad-|^ads$| ads |popup|subscribe|newsletter|social|share|related|recommended|widget|cookie|gdpr|banner/i;
  const POSITIVE_RE = /article|body|content|entry|hentry|main|page|post|text|blog|story/i;

  function scoreElement(el) {
    let score = 0;
    const classId = ((el.className || '') + ' ' + (el.id || '')).toLowerCase();

    if (NEGATIVE_RE.test(classId)) score -= 20;
    if (POSITIVE_RE.test(classId)) score += 20;

    const text = el.innerText || el.textContent || '';
    // Reward text density (capped so one giant div doesn't dominate)
    score += Math.min(Math.floor(text.length / 100), 10);
    // Commas are a good proxy for natural prose
    score += Math.min((text.match(/,/g) || []).length, 5);

    // Penalise link-heavy elements (navigation, tag clouds, etc.)
    const links = el.querySelectorAll('a');
    const linkTextLen = Array.from(links).reduce((n, a) => n + (a.textContent || '').length, 0);
    if (text.length > 0 && linkTextLen / text.length > 0.5) score -= 10;

    return score;
  }

  function findBestElement() {
    // 1. Semantic selectors — quick win for well-structured pages
    const semanticSelectors = [
      'article',
      '[role="article"]',
      '[role="main"]',
      'main',
      '.post-content',
      '.article-content',
      '.entry-content',
      '.story-body',
      '.story-content',
      '#article-body',
      '#content article',
      '#content',
      '.content',
    ];
    for (const sel of semanticSelectors) {
      const el = document.querySelector(sel);
      if (el && (el.innerText || el.textContent || '').trim().length > 300) {
        return el;
      }
    }

    // 2. Scoring fallback — walk every block-level container
    let best = document.body;
    let bestScore = -Infinity;
    document.querySelectorAll('div, section, article').forEach(el => {
      const s = scoreElement(el);
      if (s > bestScore) { bestScore = s; best = el; }
    });
    return best;
  }

  // Tags to strip entirely from the extracted content
  const STRIP_TAGS = [
    'script', 'noscript', 'style', 'iframe', 'form',
    'button', 'input', 'select', 'textarea',
    'nav', 'header', 'footer', 'aside',
  ];

  // Class/id patterns that indicate non-article elements inside the body
  const STRIP_CLASS_RE = /comment|footer|footnote|nav|sidebar|social|share|related|sponsor|ad-|popup|subscribe|newsletter|cookie|gdpr|widget/i;

  // Attributes that are safe to keep on elements
  const SAFE_ATTRS = new Set(['href', 'src', 'alt', 'title', 'width', 'height']);

  function cleanContent(el) {
    const clone = el.cloneNode(true);

    // Remove noisy tags
    STRIP_TAGS.forEach(tag => clone.querySelectorAll(tag).forEach(n => n.remove()));

    // Remove elements whose class/id marks them as non-content
    clone.querySelectorAll('[class], [id]').forEach(child => {
      const ci = ((child.className || '') + ' ' + (child.id || '')).toLowerCase();
      if (STRIP_CLASS_RE.test(ci)) child.remove();
    });

    // Strip all attributes except a safe allow-list
    clone.querySelectorAll('*').forEach(child => {
      Array.from(child.attributes).forEach(attr => {
        if (!SAFE_ATTRS.has(attr.name)) child.removeAttribute(attr.name);
      });
    });

    // Resolve relative URLs so images and links work in the print page
    clone.querySelectorAll('img[src]').forEach(img => {
      try { img.src = new URL(img.getAttribute('src'), window.location.href).href; }
      catch (_) { img.remove(); }
    });
    clone.querySelectorAll('a[href]').forEach(a => {
      try { a.href = new URL(a.getAttribute('href'), window.location.href).href; }
      catch (_) {}
    });

    return clone.innerHTML;
  }

  function extractArticle() {
    return {
      title:    getTitle(),
      byline:   getByline(),
      siteName: getSiteName(),
      content:  cleanContent(findBestElement()),
      sourceUrl: window.location.href,
    };
  }

  // ---------------------------------------------------------------------------
  // Message listener
  // ---------------------------------------------------------------------------
  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'extract') {
      try {
        sendResponse({ success: true, data: extractArticle() });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    }
    return true; // keep channel open for the async sendResponse
  });
})();
