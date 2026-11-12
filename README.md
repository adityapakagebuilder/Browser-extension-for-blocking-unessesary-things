# Promo Shield

A Chrome extension (Manifest V3) that blocks ads and promos in the browser and cleans promotional emails out of Gmail, while keeping verification codes.

## Features

- **Ad blocker:** blocks requests to about 120 ad networks and ad trackers (`declarativeNetRequest`). You can turn it on or off from the side panel.
- **Promo pop-up hiding:** hides leftover ad slots, sponsored widgets, discount banners and "subscribe to our newsletter" pop-ups, and gives back page scrolling. Dialogs that contain a password or card field are never hidden.
- **Pause per site:** one click in the panel turns off blocking for the site you're on.
- **Gmail cleanup:** after you connect Gmail, it removes the promos that are **already in your mailbox** (the whole Promotions category), then checks every 15 minutes for new ones.
  - **Always kept:** verification, sign-in, OTP, 2FA and password-reset emails, starred mail, and senders on your "Always keep" list.
  - Marketing "codes" (promo, discount, coupon or referral codes) do **not** count as verification codes.
  - Removed mail goes to Gmail's **Trash**, so you can restore it for 30 days.
- **Live Gmail view:** in the Gmail tab, sponsored "Ad" rows are hidden, and so are promo rows in Promotions. Kept codes get a 🔑 *Code kept* badge. This part works without connecting Gmail.
- **Side panel:** a clean light/dark UI that opens on the right side of the browser when you click the toolbar icon.

## Install (developer mode)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. A welcome page opens. Pin the extension, then click its icon to open the side panel.

> The side panel uses Chrome's side panel, which sits on the right by default. If yours is on the left, change it in Chrome under *Settings → Appearance → Side panel position*.

## Gmail setup (one time)

To erase emails, the extension uses the Gmail API. Google requires your own OAuth client ID for that.

The extension has a **fixed ID**, the same on every computer:

```
ebgocmhkhakanpholcnlfikembcccdhh
```

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project. Go to **APIs & Services → Library**, open **Gmail API** and click **Enable**.
2. Set up the **OAuth consent screen** (External). Add the scope `https://www.googleapis.com/auth/gmail.modify`, and add your Gmail address under **Test users**.
3. Go to **Credentials → Create credentials → OAuth client ID**. Choose **Chrome extension** as the application type, and enter `ebgocmhkhakanpholcnlfikembcccdhh` as the **Item ID**.
4. Paste the client ID into `manifest.json` → `oauth2.client_id`.
5. On `chrome://extensions`, click **reload** on Promo Shield. Confirm the ID shown there matches the one above.
6. Open the side panel and click **Connect Gmail & clean up**.

### Troubleshooting

If connecting fails, the panel shows the reason under the button.

| Message / symptom | Fix |
| --- | --- |
| "Google rejected the client ID" / `bad client id` | The OAuth client must be the **Chrome extension** type, with Item ID `ebgocmhkhakanpholcnlfikembcccdhh`. A "Web application" or "Desktop" client won't work with that ID. |
| "Access blocked: app has not completed verification" | Add your Gmail address under **OAuth consent screen → Test users**. |
| "The Gmail API is not turned on" | Go to **APIs & Services → Library → Gmail API → Enable**. |
| "Sign in to Chrome" | Sign in to the Chrome profile itself (profile icon, top right). |
| "This browser does not support…" | Use Google Chrome. Edge, Brave and Opera don't support Chrome's extension sign-in. |
| The extension ID on `chrome://extensions` is different | Pull the latest `manifest.json`, which includes the `key` field, then remove the extension and load it again. |
| Nothing changed after editing `manifest.json` | Click **reload** on `chrome://extensions`. |

## Project layout

| Path | Purpose |
| --- | --- |
| `manifest.json` | Extension manifest (MV3) |
| `background.js` | Service worker: settings, ad-block rules, Gmail cleanup, auto-clean alarm |
| `lib/classifier.js` | Decides promo vs. necessary (verification codes, starred, allowlist) |
| `lib/gmail.js` | Gmail REST API client (list, read metadata, move to Trash) |
| `content/cosmetic.js` | Hides ad slots and promo pop-ups on web pages |
| `content/gmail.js` | Hides promos and sponsored ads in the Gmail web UI |
| `sidepanel/` | Side panel UI |
| `welcome/` | First-run page |
| `rules/ads.json` | Generated ad-blocking ruleset |
| `tools/` | Ad domain list, rule builder and icon generator |

## Development

```bash
npm test             # classifier unit tests
npm run build:rules  # rebuild rules/ads.json after editing tools/ad-domains.txt
npm run build:icons  # re-render icons (needs Python + Pillow)
```
