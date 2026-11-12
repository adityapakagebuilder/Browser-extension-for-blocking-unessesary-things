/*
 * Cosmetic filter for regular web pages: hides leftover ad slots, sponsored
 * widgets and promo/newsletter pop-ups that network blocking can't catch.
 */
(() => {
  const AD_SELECTORS = [
    'ins.adsbygoogle',
    '[id^="google_ads_iframe"]',
    '[id^="div-gpt-ad"]',
    '[data-google-query-id]',
    '[data-ad-slot]',
    '[data-ad-unit]',
    '[data-ad-client]',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[id^="aswift_"]',
    '[aria-label="Advertisement" i]',
    '[aria-label="Sponsored" i]',
    '.adsbygoogle',
    '.ad-banner',
    '.ad-slot',
    '.ad-container',
    '.ad-wrapper',
    '.advertisement',
    '.sponsored-content',
    '.sponsored-post',
    '[data-testid="sponsored"]',
    '[id^="taboola-"]',
    '.trc_related_container',
    '.OUTBRAIN',
    '[data-widget-id^="outbrain" i]',
    '.mgbox',
    '.revcontent',
  ];
  const PROMO_TEXT = /(\d{1,2}\s?% off|discount|coupon|promo code|subscribe to our newsletter|join our (newsletter|mailing list)|sign up (for|and) (save|get)|get \d+% off|exclusive (offer|deal)|limited[- ]time offer|don'?t miss (out|our)|flash sale|free shipping on your first)/i;
  const STYLE_ID = 'promo-shield-cosmetic';
  const MARK = 'data-promo-shield-hidden';

  let enabled = false;
  let pendingReport = 0;
  let reportTimer = null;
  let scanTimer = null;

  function report(n) {
    if (!n) return;
    pendingReport += n;
    clearTimeout(reportTimer);
    reportTimer = setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'reportHidden', count: pendingReport }).catch(() => {});
      pendingReport = 0;
    }, 2000);
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `${AD_SELECTORS.join(',\n')} { display: none !important; }
      [${MARK}] { display: none !important; }`;
    (document.head || document.documentElement).appendChild(style);
  }

  function removeStyle() {
    document.getElementById(STYLE_ID)?.remove();
    document.querySelectorAll(`[${MARK}]`).forEach((el) => el.removeAttribute(MARK));
  }

  function looksLikePromoOverlay(el) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') return false;
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    const vw = innerWidth;
    const vh = innerHeight;
    const big = rect.width * rect.height > vw * vh * 0.12;
    const bar = rect.width > vw * 0.8 && rect.height < 180;
    if (!big && !bar) return false;
    // Never touch real forms such as login or checkout dialogs.
    if (el.querySelector('input[type="password"], input[autocomplete*="cc-"]')) return false;
    const text = (el.innerText || '').slice(0, 2000);
    return PROMO_TEXT.test(text);
  }

  function scanOverlays() {
    let hidden = 0;
    for (const el of document.querySelectorAll(
      // Overlays almost always sit near the top of the tree; keep the scan cheap.
      'body > *, body > * > *, body > * > * > *, dialog, [role="dialog"], [aria-modal="true"]'
    )) {
      if (el.hasAttribute(MARK) || el.parentElement?.closest(`[${MARK}]`)) continue;
      if (looksLikePromoOverlay(el)) {
        el.setAttribute(MARK, '');
        hidden++;
      }
    }
    if (hidden) {
      // Pop-ups usually lock scrolling; give it back.
      for (const node of [document.documentElement, document.body]) {
        if (getComputedStyle(node).overflow === 'hidden') node.style.setProperty('overflow', 'auto', 'important');
      }
    }
    const ads = document.querySelectorAll(AD_SELECTORS.join(','));
    let newAds = 0;
    ads.forEach((el) => {
      if (!el.hasAttribute(MARK)) {
        el.setAttribute(MARK, '');
        newAds++;
      }
    });
    report(hidden + newAds);
  }

  function scheduleScan() {
    if (!enabled) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanOverlays, 400);
  }

  const observer = new MutationObserver(scheduleScan);

  function apply(settings) {
    const host = location.hostname.replace(/^www\./, '');
    const paused = (settings.pausedSites || []).some((h) => host === h || host.endsWith('.' + h));
    enabled = Boolean(settings.cosmetic) && !paused;
    if (enabled) {
      injectStyle();
      scheduleScan();
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } else {
      observer.disconnect();
      removeStyle();
    }
  }

  chrome.storage.local.get('settings').then(({ settings }) => apply(settings || { cosmetic: true }));
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.settings) apply(changes.settings.newValue || {});
  });
})();
