/**
 * print.js — Runs inside the extension's print.html page.
 * Reads article data from storage (written by popup.js), populates the DOM,
 * then triggers window.print() so the iOS share sheet appears.
 *
 * On iOS: Share → Print → pinch outward on the preview → Share → Save to Files
 */
(function () {
  'use strict';

  const api = typeof browser !== 'undefined' ? browser : chrome;

  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const loadingEl = document.getElementById('loading');
  const contentEl = document.getElementById('content');
  const titleEl   = document.getElementById('article-title');
  const metaEl    = document.getElementById('article-meta');
  const bodyEl    = document.getElementById('article-body');

  function showError(msg) {
    loadingEl.innerHTML = '<p class="error">' + escapeHtml(msg) + '</p>';
  }

  api.storage.local.get('pendingPrint', function (result) {
    if (api.runtime.lastError) {
      showError('Storage error: ' + api.runtime.lastError.message);
      return;
    }

    const article = result && result.pendingPrint;
    if (!article) {
      showError('No article data found. Please close this tab and try the extension again.');
      return;
    }

    // ── Populate page ──────────────────────────────────────────────
    document.title = article.title || 'Article';
    titleEl.textContent = article.title || '';

    // Meta line: "Author — Site — URL"
    const metaParts = [];
    if (article.byline)   metaParts.push(escapeHtml(article.byline));
    if (article.siteName) metaParts.push(escapeHtml(article.siteName));
    if (article.sourceUrl) {
      metaParts.push(
        '<a href="' + escapeHtml(article.sourceUrl) + '">' +
        escapeHtml(article.sourceUrl) +
        '</a>'
      );
    }
    metaEl.innerHTML = metaParts.join(' &mdash; ');

    // The content HTML was already sanitised by content.js (safe attributes only,
    // no scripts, no iframes).  We set it via innerHTML here.
    bodyEl.innerHTML = article.content || '<p><em>No content was extracted.</em></p>';

    // Silently remove any images that fail to load (broken src, CORS, etc.)
    bodyEl.querySelectorAll('img').forEach(function (img) {
      img.addEventListener('error', function () { img.remove(); });
    });

    // ── Show content ───────────────────────────────────────────────
    loadingEl.hidden = true;
    contentEl.hidden = false;

    // Clean up storage — we don't need it anymore
    api.storage.local.remove('pendingPrint');

    // ── Trigger print ──────────────────────────────────────────────
    // Delay gives images a chance to load before the print dialog opens.
    // On iOS this opens the system Print sheet; the user can pinch-zoom
    // the page thumbnail to convert it to a PDF, then share/save it.
    setTimeout(function () { window.print(); }, 900);
  });
})();
