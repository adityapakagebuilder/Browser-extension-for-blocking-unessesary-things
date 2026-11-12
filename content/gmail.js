/*
 * Gmail web UI helper. Runs on mail.google.com:
 *  - hides Gmail's sponsored "Ad" rows everywhere
 *  - in the Promotions tab, hides every promo row that isn't a verification
 *    code (or from an allowlisted sender) and tags kept codes with a badge.
 * This only changes what is displayed; actually erasing promos is done by the
 * background worker through the Gmail API.
 */
(() => {
  const { classify } = globalThis.PromoClassifier;
  const HIDDEN = 'data-promo-shield-hidden';
  const BADGE = 'promo-shield-badge';

  let settings = { gmailHide: true, allowlist: [] };
  let timer = null;

  const style = document.createElement('style');
  style.textContent = `
    tr[${HIDDEN}] { display: none !important; }
    .${BADGE} {
      display: inline-flex; align-items: center; gap: 4px;
      margin-right: 6px; padding: 1px 8px; border-radius: 999px;
      font: 600 11px/18px "Google Sans", Roboto, sans-serif;
      color: #0b6b3a; background: #d6f5e3; vertical-align: middle;
    }`;
  document.documentElement.appendChild(style);

  function inPromotions() {
    if (/#category\/promotions/.test(location.hash)) return true;
    const tab = document.querySelector('[role="tab"][aria-selected="true"]');
    return Boolean(tab && /promotions/i.test(tab.getAttribute('aria-label') || tab.textContent || ''));
  }

  function isAdRow(row) {
    // Sponsored rows carry a small "Ad" / "Sponsored" label next to the sender.
    return [...row.querySelectorAll('span, div')].some((el) => {
      if (el.children.length) return false;
      const t = el.textContent.trim();
      return t === 'Ad' || t === 'Sponsored';
    });
  }

  function readRow(row) {
    const sender = row.querySelector('span[email]');
    return {
      from: sender ? `${sender.getAttribute('name') || ''} <${sender.getAttribute('email')}>` : '',
      subject: row.querySelector('.bog')?.textContent || '',
      snippet: row.querySelector('.y2')?.textContent || '',
      labelIds: row.querySelector('[aria-label="Starred"], .T-KT-Jp') ? ['STARRED'] : [],
    };
  }

  function addBadge(row) {
    const subject = row.querySelector('.bog');
    if (!subject || row.querySelector(`.${BADGE}`)) return;
    const badge = document.createElement('span');
    badge.className = BADGE;
    badge.textContent = '🔑 Code kept';
    subject.parentElement.insertBefore(badge, subject);
  }

  function scan() {
    const rows = document.querySelectorAll('tr.zA');
    const promos = inPromotions();
    let hidden = 0;
    rows.forEach((row) => {
      let hide = false;
      if (settings.gmailHide) {
        if (isAdRow(row)) {
          hide = true;
        } else if (promos) {
          const verdict = classify(readRow(row), settings);
          hide = !verdict.keep;
          if (verdict.reason === 'verification') addBadge(row);
        }
      }
      if (hide && !row.hasAttribute(HIDDEN)) {
        row.setAttribute(HIDDEN, '');
        hidden++;
      } else if (!hide && row.hasAttribute(HIDDEN)) {
        row.removeAttribute(HIDDEN);
      }
    });
    if (hidden) chrome.runtime.sendMessage({ type: 'reportHidden', count: hidden }).catch(() => {});
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(scan, 250);
  }

  chrome.storage.local.get('settings').then(({ settings: s }) => {
    settings = { ...settings, ...(s || {}) };
    schedule();
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.settings) {
      settings = { ...settings, ...(changes.settings.newValue || {}) };
      schedule();
    }
  });
  window.addEventListener('hashchange', schedule);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
})();
