/*
 * Promo classifier — decides whether an email is "necessary" (kept) or a
 * promo (removed). Shared by the background worker, the Gmail content script
 * and the tests, so it attaches itself to globalThis instead of using exports.
 */
(function (root) {
  // Phrases that contain the word "code" but are marketing, not verification.
  const MARKETING_CODE = /\b(promo(tional)?|discount|coupon|voucher|offer|referral|gift|redeem|sale|bonus|reward)s?\s+codes?\b/gi;

  const VERIFICATION_PATTERNS = [
    /\b(verification|verify|confirmation|confirm|security|one[\s-]?time|log[\s-]?in|sign[\s-]?in|access|authentication|auth|activation|2fa|two[\s-]?factor|otp|login|single[\s-]?use|temporary)\b[^.\n]{0,25}\b(code|pin|passcode|password|number|link|key)\b/i,
    /\b(otp|2fa|mfa|passcode|one[\s-]?time password)\b/i,
    /\byour (code|pin) is\b/i,
    /\b(code|pin)\s*(is|:)\s*[A-Z0-9-]{4,10}\b/i,
    /\b\d{3}[\s-]?\d{3}\b.{0,40}\b(is your|to (verify|sign in|log in|confirm))\b/i,
    /\bis your\b.{0,30}\b(code|pin|otp)\b/i,
    /\b(reset|change) your password\b/i,
    /\bconfirm your (email|account|sign[\s-]?up|identity)\b/i,
    /\bverify your (email|account|identity|device|login)\b/i,
    /\bnew (sign[\s-]?in|login) (to|on|from)\b/i,
  ];

  function normalize(text) {
    return String(text || '').replace(MARKETING_CODE, ' ').replace(/\s+/g, ' ').trim();
  }

  /** True when the subject/snippet looks like an OTP / verification email. */
  function isVerificationEmail({ subject = '', snippet = '' } = {}) {
    const text = normalize(`${subject} \n ${snippet}`);
    return VERIFICATION_PATTERNS.some((re) => re.test(text));
  }

  /** Lower-cased email address out of a "Name <addr>" From header. */
  function senderAddress(from = '') {
    const m = String(from).match(/<([^>]+)>/);
    return (m ? m[1] : String(from)).trim().toLowerCase();
  }

  function isAllowlisted(from, allowlist = []) {
    const addr = senderAddress(from);
    if (!addr) return false;
    return allowlist.some((entry) => {
      const e = String(entry).trim().toLowerCase().replace(/^@/, '');
      if (!e) return false;
      return addr === e || addr.endsWith('@' + e) || addr.endsWith('.' + e);
    });
  }

  /**
   * Decide what to do with a promotional email.
   * Returns { keep: boolean, reason: 'verification' | 'starred' | 'allowlist' | 'promo' }.
   */
  function classify(msg = {}, settings = {}) {
    const labels = msg.labelIds || [];
    if (labels.includes('STARRED')) return { keep: true, reason: 'starred' };
    if (isAllowlisted(msg.from, settings.allowlist)) return { keep: true, reason: 'allowlist' };
    if (isVerificationEmail(msg)) return { keep: true, reason: 'verification' };
    return { keep: false, reason: 'promo' };
  }

  root.PromoClassifier = { isVerificationEmail, isAllowlisted, senderAddress, classify };
})(typeof globalThis !== 'undefined' ? globalThis : self);
