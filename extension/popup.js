/**
 * popup.js — Extension popup controller
 *
 * Flow:
 *   1. User taps "Save as PDF"
 *   2. We send an 'extract' message to the content script running in the active tab
 *   3. content.js replies with { title, byline, siteName, content, sourceUrl }
 *   4. We store that in browser.storage.local under the key 'pendingPrint'
 *   5. We open the extension's print.html page in a new tab
 *   6. print.html reads from storage, renders the article, and calls window.print()
 *   7. iOS shows the system print/share sheet → user taps Save to Files → PDF saved
 */
(function () {
  'use strict';

  const api = typeof browser !== 'undefined' ? browser : chrome;

  const btn    = document.getElementById('convert-btn');
  const status = document.getElementById('status');

  function setStatus(msg, isError) {
    status.textContent = msg;
    status.className = 'status' + (isError ? ' error' : '');
  }

  btn.addEventListener('click', function () {
    btn.disabled = true;
    setStatus('Extracting article\u2026');

    api.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      const tab = tabs && tabs[0];
      if (!tab) {
        setStatus('Could not access the current tab.', true);
        btn.disabled = false;
        return;
      }

      api.tabs.sendMessage(tab.id, { action: 'extract' }, function (response) {
        // lastError is set when the content script isn't reachable (e.g. restricted page)
        if (api.runtime.lastError || !response) {
          setStatus(
            'Cannot read this page. Try reloading it, then tap the extension again.',
            true
          );
          btn.disabled = false;
          return;
        }

        if (!response.success) {
          setStatus('Extraction failed: ' + (response.error || 'unknown error'), true);
          btn.disabled = false;
          return;
        }

        setStatus('Opening print view\u2026');

        // Store article data for print.html to pick up
        api.storage.local.set({ pendingPrint: response.data }, function () {
          if (api.runtime.lastError) {
            setStatus('Storage error. Please try again.', true);
            btn.disabled = false;
            return;
          }

          // Open the extension's clean print page in a new tab
          const printUrl = api.runtime.getURL('print.html');
          api.tabs.create({ url: printUrl });

          setStatus('Done \u2014 use Share \u2192 Print to save as PDF.');
          // Give the user a moment to read the status, then close the popup
          setTimeout(function () { window.close(); }, 1200);
        });
      });
    });
  });
})();
