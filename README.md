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

## Contents

- [For coworkers: install and connect Gmail](#for-coworkers-install-and-connect-gmail)
- [For the owner: Google Cloud setup](#for-the-owner-google-cloud-setup)
- [Using the side panel](#using-the-side-panel)
- [Troubleshooting](#troubleshooting)
- [Privacy and safety](#privacy-and-safety)

---

## For coworkers: install and connect Gmail

About 5 minutes. You only need Google Chrome and a Gmail account.

### Step 0: Ask to be added as a test user (do this first)

Before you can connect Gmail, the extension owner must add **your Gmail address** to the project's test-user list. If you skip this, Google shows *"Access blocked"*. Send the owner the exact address you'll use.

### Step 1: Get the files

- **Download:** on the GitHub repository page, choose the branch, then **Code → Download ZIP**, and unzip it. Or use `git clone`.
- **Keep the folder:** put it somewhere it will stay, such as `Documents/promo-shield`. Chrome runs the extension straight from this folder, so deleting or moving it breaks the extension.

### Step 2: Load it into Chrome

1. Open `chrome://extensions` in the address bar.
2. Turn on **Developer mode** (top-right switch).
3. Click **Load unpacked**, then select the folder that contains `manifest.json`.
4. Check the ID shown on the Promo Shield card. It must be exactly:
   ```
   ebgocmhkhakanpholcnlfikembcccdhh
   ```
   If it's different, you picked the wrong folder or have an old copy.

A welcome page opens. Ad blocking is now on for every website.

### Step 3: Open the side panel

1. Click the puzzle-piece icon in Chrome's toolbar and **pin** Promo Shield.
2. Click the Promo Shield icon. The panel opens on the **right** side of the browser.
   If it opens on the left, change it in Chrome under **Settings → Appearance → Side panel position**.

### Step 4: Connect Gmail and clean up

1. In the panel, click **Connect Gmail & clean up**.
2. Choose your Google account (the one the owner added as a test user).
3. Google shows **"Google hasn't verified this app"**. This is expected for an internal tool. Click **Continue**. If you only see **Advanced**, click it, then **Go to Promo Shield**.
4. Allow Promo Shield to read, compose and send email (the Gmail access box). The extension only lists, reads and moves promo emails to Trash. It never sends or composes mail.
5. The cleanup starts right away and the panel shows progress. A large mailbox can take a few minutes; you can keep working.

### Step 5: Check the result

- **Trash:** removed promos are in Gmail's **Trash** and can be restored for 30 days. Look through it once.
- **Kept mail:** if a sender you want ended up there, restore the email and add the sender under **Always keep mail from** in the panel.
- **Codes:** verification and sign-in codes stay in your inbox and get a **🔑 Code kept** badge in Gmail.

### Updating to a new version

Replace the folder's files with the new version, then click **reload** (↻) on the Promo Shield card at `chrome://extensions`. Your settings are kept.

---

## For the owner: Google Cloud setup

This is already done for the current `manifest.json`. These are the steps that worked, in case you need to redo them or set up a new project.

The extension has a **fixed ID**, `ebgocmhkhakanpholcnlfikembcccdhh`, set by the `key` field in `manifest.json`. Every coworker gets the same ID, so one OAuth client works for everyone. Don't remove the `key` field.

### 1. Create the project and enable the Gmail API

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project. Use a project that isn't restricted to a company organization, or see step 2.
2. Go to **APIs & Services → Library**, search **Gmail API** and click **Enable**.

### 2. Set up the consent screen

Go to **Google Auth Platform** (older menu: **APIs & Services → OAuth consent screen**).

1. **User type:** set it to **External**.
   - **Not Internal:** Internal only allows accounts from the Google Workspace organization that owns the project, and everyone else gets `Error 403: org_internal`.
   - **Greyed out?** If "External" can't be selected, your organization blocks it. Create the project from a personal Google account instead.
2. **Data access (scopes):** add `https://www.googleapis.com/auth/gmail.modify`.
3. **Publishing status:** leave it as **Testing**. Publishing would require Google's security review for Gmail access, which an internal tool doesn't need.
4. **Test users (Audience → Test users):** add your own Gmail address.

### 3. Create the OAuth client

Go to **Credentials → Create credentials → OAuth client ID** and use **one** of these types:

| Client type | Settings | Notes |
| --- | --- | --- |
| **Chrome extension** (recommended) | Item ID: `ebgocmhkhakanpholcnlfikembcccdhh` | Uses Chrome's built-in sign-in. It renews itself, so auto-clean keeps running in the background. |
| **Web application** | Authorized redirect URI: `https://ebgocmhkhakanpholcnlfikembcccdhh.chromiumapp.org/` (keep the trailing `/`) | Uses the web sign-in fallback. The sign-in lasts about 1 hour, after which auto-clean pauses until you click **Connect** again. |

### 4. Put the client ID in the extension

1. Copy the client ID (it ends in `.apps.googleusercontent.com`).
2. Paste it into `manifest.json` → `"oauth2"` → `"client_id"`.
3. Click **reload** on `chrome://extensions`.
4. Commit and push, so coworkers get it.

The client ID isn't a secret and is safe to share. A Web application client also has a **client secret**. The extension doesn't use it, so never paste it into the code.

### Adding a coworker

1. Go to **Google Auth Platform → Audience → Test users → Add users**.
2. Enter their Gmail address and click **Save**.
3. Send them a link to this README.

You can add up to **100** test users. A coworker who isn't on the list gets *"Access blocked"*.

---

## Using the side panel

| Section | What it does |
| --- | --- |
| **Stats** | Ads blocked on this tab, promos hidden, emails cleaned, codes kept. |
| **Ad blocker** | Turns network ad blocking on or off. |
| **Hide promo pop-ups** | Turns hiding of sponsored blocks, discount banners and newsletter pop-ups on or off. |
| **Pause here / Resume here** | Turns blocking off for just the current site, and reloads the page. |
| **Connect Gmail / Clean promotions now** | Connects Gmail, or runs a full cleanup again. |
| **Hide promos in Gmail** | Hides sponsored ads and promo rows in the Gmail tab. Works even without connecting. |
| **Auto-clean new promos** | Moves new promos to Trash every 15 minutes. |
| **Always keep mail from** | Senders or domains (e.g. `amazon.com` or `news@brand.com`) whose promos are never removed. |
| **Extension ID** | Shows the ID with a **Copy** button, which is handy when setting up Google Cloud. |

**What counts as "necessary" mail:**
- **Kept:** emails with a verification, sign-in, one-time-password, 2FA, security or password-reset code or link; starred emails; and senders on your keep list.
- **Not kept:** promo, discount, coupon and referral codes don't count as verification codes.

---

## Troubleshooting

If connecting fails, the panel shows the reason under the **Connect** button, with Google's exact error after **Details:**.

| Message / symptom | Cause and fix |
| --- | --- |
| **Access blocked: … can only be used within its organization** (`Error 403: org_internal`) | The consent screen is set to **Internal**. The owner must change it to **External** (see [step 2](#2-set-up-the-consent-screen)). |
| **Access blocked: … has not completed the Google verification process** (`access_denied`) | Your Gmail address isn't a test user. Ask the owner to add it ([Adding a coworker](#adding-a-coworker)). |
| **Google hasn't verified this app** | Normal for an app in Testing. Click **Continue**, or **Advanced → Go to Promo Shield**. |
| **`redirect_uri_mismatch`** ("The app sent an invalid request") | The Web application client is missing the redirect URI. Add `https://ebgocmhkhakanpholcnlfikembcccdhh.chromiumapp.org/` under **Authorized redirect URIs** and wait a few minutes. |
| **"Google rejected the client ID"** / `bad client id` | A **Chrome extension** client must have Item ID `ebgocmhkhakanpholcnlfikembcccdhh`. Also check the client ID in `manifest.json` is copied exactly. |
| **"The Gmail API is not turned on"** | Enable it: **APIs & Services → Library → Gmail API → Enable**. |
| **"Gmail permission is missing"** | The Gmail box wasn't ticked on Google's permission screen. Click **Disconnect**, then **Connect** again and tick it. |
| **"Sign in to Chrome"** | Sign in to the Chrome profile itself (profile icon, top right). |
| **"This browser does not support…"** | Use Google Chrome. Edge, Brave and Opera aren't supported for Gmail sign-in. |
| **Auto-clean stopped after a while** | With a Web application client, sign-in expires after about 1 hour. Click **Connect** again, or switch to a Chrome extension client. In Testing mode, Google may also ask you to sign in again every few days. |
| **Extension ID on `chrome://extensions` is different** | You loaded an old copy or the wrong folder. Remove the extension, get the latest files and **Load unpacked** again. |
| **Changes to `manifest.json` have no effect** | Click **reload** on `chrome://extensions`. |
| **A site looks broken** | Click **Pause here** in the panel for that site. |
| **An email I needed was removed** | Restore it from Gmail's **Trash** (kept 30 days) and add the sender to **Always keep mail from**. |
| **Chrome warns about developer-mode extensions on startup** | Expected for extensions loaded with **Load unpacked**. Dismiss it (don't click "Disable"). |

---

## Privacy and safety

- **Runs in your browser:** emails are checked inside your own browser. Nothing is sent to any server other than Google's Gmail API.
- **Trash, not delete:** promos are moved to **Trash**, never permanently deleted.
- **Your own data only:** the extension can only see the Gmail account you connect, and you can disconnect it at any time from the panel. You can also remove its access at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
- **Site icons:** the panel shows the current site's icon using Google's favicon service.

---

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
