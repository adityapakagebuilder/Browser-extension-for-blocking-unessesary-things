const test = require('node:test');
const assert = require('node:assert');
require('../lib/classifier.js');

const { isVerificationEmail, classify, isAllowlisted } = globalThis.PromoClassifier;

const codes = [
  { subject: 'Your verification code', snippet: 'Use 482913 to verify your account.' },
  { subject: '123456 is your Instagram code', snippet: "Don't share it." },
  { subject: 'Sign in to Shopify', snippet: 'Your login code is 84FJ2K' },
  { subject: 'Your one-time password', snippet: 'OTP: 9921' },
  { subject: 'Confirm your email', snippet: 'Click the link below to confirm your email address.' },
  { subject: 'Security code for your Microsoft account', snippet: 'Security code: 7781' },
  { subject: 'Reset your password', snippet: 'We received a request to reset your password.' },
  { subject: 'Your Uber code', snippet: 'Your code is 4412' },
  { subject: 'Two-factor authentication code', snippet: '' },
];

const promos = [
  { subject: '🔥 40% OFF everything this weekend', snippet: 'Use promo code SAVE40 at checkout' },
  { subject: 'Your exclusive discount code inside', snippet: 'Get $10 off with coupon code WELCOME10' },
  { subject: 'New arrivals just dropped', snippet: 'Shop the latest styles now' },
  { subject: 'Last chance: flash sale ends tonight', snippet: 'Free shipping on all orders' },
  { subject: 'Refer a friend and earn rewards', snippet: 'Share your referral code ABC123' },
  { subject: 'Weekly newsletter', snippet: 'The top 10 stories you missed this week' },
];

test('detects verification / sign-in emails', () => {
  for (const msg of codes) assert.ok(isVerificationEmail(msg), msg.subject);
});

test('does not treat marketing "codes" as verification', () => {
  for (const msg of promos) assert.ok(!isVerificationEmail(msg), msg.subject);
});

test('classify keeps codes, starred and allowlisted mail', () => {
  assert.deepStrictEqual(classify(codes[0]), { keep: true, reason: 'verification' });
  assert.deepStrictEqual(classify({ ...promos[0], labelIds: ['STARRED'] }), { keep: true, reason: 'starred' });
  assert.deepStrictEqual(
    classify({ ...promos[0], from: 'Store <deals@mail.store.com>' }, { allowlist: ['store.com'] }),
    { keep: true, reason: 'allowlist' }
  );
  assert.deepStrictEqual(classify(promos[0]), { keep: false, reason: 'promo' });
});

test('allowlist matches exact address, domain and subdomain only', () => {
  assert.ok(isAllowlisted('a@shop.com', ['a@shop.com']));
  assert.ok(isAllowlisted('News <x@shop.com>', ['shop.com']));
  assert.ok(isAllowlisted('x@mail.shop.com', ['@shop.com']));
  assert.ok(!isAllowlisted('x@notshop.com', ['shop.com']));
  assert.ok(!isAllowlisted('x@other.com', []));
});
