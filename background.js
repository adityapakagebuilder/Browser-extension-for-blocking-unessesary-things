import './lib/classifier.js';
import * as gmail from './lib/gmail.js';

const { classify } = globalThis.PromoClassifier;

const DEFAULT_SETTINGS = {
  adBlock: true, // network-level ad & tracker blocking
  cosmetic: true, // hide promo banners, sponsored blocks, newsletter pop-ups on web pages
  gmailHide: true, // hide promos + sponsored ads live in the Gmail web UI
  autoClean: true, // periodically move new promo emails to Trash
  allowlist: [], // senders/domains whose promos are always kept
  pausedSites: [], // sites where blocking is turned off
};
const DEFAULT_STATS = { emailsTrashed: 0, codesKept: 0, elementsHidden: 0, lastClean: null };
const AUTO_CLEAN_ALARM = 'auto-clean';
const PAUSE_RULE_BASE = 10000;
const MAX_KEPT_IDS = 5000;

// ---------------------------------------------------------------- storage --
async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}
async function saveSettings(patch) {
  const settings = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings });
  await applySettings(settings);
  return settings;
}
async function getStats() {
  const { stats } = await chrome.storage.local.get('stats');
  return { ...DEFAULT_STATS, ...(stats || {}) };
}
async function bumpStats(patch) {
  const stats = await getStats();
  for (const [k, v] of Object.entries(patch)) {
    stats[k] = typeof v === 'number' ? (stats[k] || 0) + v : v;
  }
  await chrome.storage.local.set({ stats });
}

// ------------------------------------------------------------ ad blocking --
async function applySettings(settings) {
  await chrome.declarativeNetRequest.updateEnabledRulesets(
    settings.adBlock ? { enableRulesetIds: ['ads'] } : { disableRulesetIds: ['ads'] }
  );

  // One "allow everything" rule per paused site.
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.filter((r) => r.id >= PAUSE_RULE_BASE).map((r) => r.id);
  const addRules = settings.pausedSites.map((host, i) => ({
    id: PAUSE_RULE_BASE + i,
    priority: 100,
    action: { type: 'allowAllRequests' },
    condition: { requestDomains: [host], resourceTypes: ['main_frame', 'sub_frame'] },
  }));
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });

  await chrome.alarms.clear(AUTO_CLEAN_ALARM);
  if (settings.autoClean) {
    chrome.alarms.create(AUTO_CLEAN_ALARM, { periodInMinutes: 15, delayInMinutes: 1 });
  }
}

// ---------------------------------------------------------- gmail cleanup --
let cleaning = false;

async function setProgress(progress) {
  await chrome.storage.local.set({ cleanProgress: progress });
}

/**
 * Scans Gmail's Promotions category, keeps verification codes / starred /
 * allowlisted mail and moves everything else to Trash.
 * `full` scans the whole mailbox (first run); otherwise only recent mail.
 */
async function cleanPromos({ full = false } = {}) {
  if (cleaning) return { busy: true };
  if (!gmail.isOAuthConfigured()) throw new Error('Gmail access is not configured (see README).');
  cleaning = true;
  const settings = await getSettings();
  const { keptIds = [] } = await chrome.storage.local.get('keptIds');
  const kept = new Set(keptIds);
  const result = { scanned: 0, trashed: 0, kept: 0, codes: 0 };
  const query = full ? 'category:promotions' : 'category:promotions newer_than:3d';

  try {
    await setProgress({ running: true, ...result });
    for await (const ids of gmail.listMessageIds(query)) {
      const fresh = ids.filter((id) => !kept.has(id));
      const metas = await gmail.mapLimit(fresh, 8, gmail.getMessageMeta);
      const toTrash = [];
      for (const meta of metas) {
        if (!meta) continue;
        result.scanned++;
        const verdict = classify(meta, settings);
        if (verdict.keep) {
          kept.add(meta.id);
          result.kept++;
          if (verdict.reason === 'verification') result.codes++;
        } else {
          toTrash.push(meta.id);
        }
      }
      if (toTrash.length) await gmail.trashMessages(toTrash);
      result.trashed += toTrash.length;
      await setProgress({ running: true, ...result });
    }
    await chrome.storage.local.set({ keptIds: [...kept].slice(-MAX_KEPT_IDS) });
    await bumpStats({
      emailsTrashed: result.trashed,
      codesKept: result.codes,
      lastClean: Date.now(),
    });
    return result;
  } finally {
    cleaning = false;
    await setProgress({ running: false, ...result, finishedAt: Date.now() });
  }
}

async function connectGmail() {
  if (!gmail.isOAuthConfigured()) throw new Error('Gmail access is not configured (see README).');
  await gmail.getToken(true);
  const profile = await gmail.getProfile();
  await chrome.storage.local.set({ gmailAccount: profile.emailAddress });

  // First connection after install: erase the promos that are already there.
  const { initialCleanDone } = await chrome.storage.local.get('initialCleanDone');
  if (!initialCleanDone) {
    cleanPromos({ full: true })
      .then(() => chrome.storage.local.set({ initialCleanDone: true }))
      .catch((e) => setProgress({ running: false, error: e.message }));
  }
  return { email: profile.emailAddress };
}

async function disconnectGmail() {
  await gmail.signOut();
  await chrome.storage.local.remove(['gmailAccount', 'cleanProgress']);
}

// ------------------------------------------------------------- lifecycle --
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS, stats: DEFAULT_STATS });
  await applySettings(await getSettings());
  if (reason === 'install') chrome.tabs.create({ url: 'welcome/welcome.html' });
});

chrome.runtime.onStartup.addListener(async () => applySettings(await getSettings()));

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: true }).catch(() => {});
chrome.action.setBadgeBackgroundColor({ color: '#6d5efc' }).catch(() => {});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== AUTO_CLEAN_ALARM) return;
  const { gmailAccount } = await chrome.storage.local.get('gmailAccount');
  if (gmailAccount) cleanPromos().catch(() => {});
});

// --------------------------------------------------------------- messages --
const handlers = {
  async getState() {
    const data = await chrome.storage.local.get(['gmailAccount', 'cleanProgress']);
    return {
      settings: await getSettings(),
      stats: await getStats(),
      gmailAccount: data.gmailAccount || null,
      cleanProgress: data.cleanProgress || null,
      oauthConfigured: gmail.isOAuthConfigured(),
    };
  },
  updateSettings: ({ patch }) => saveSettings(patch),
  async togglePause({ host }) {
    const { pausedSites } = await getSettings();
    const next = pausedSites.includes(host)
      ? pausedSites.filter((h) => h !== host)
      : [...pausedSites, host];
    return saveSettings({ pausedSites: next });
  },
  connectGmail,
  disconnectGmail,
  cleanNow: () => cleanPromos({ full: true }),
  reportHidden: ({ count }) => bumpStats({ elementsHidden: count }),
  async blockedOnTab({ tabId }) {
    try {
      const { rulesMatchedInfo } = await chrome.declarativeNetRequest.getMatchedRules({ tabId });
      return rulesMatchedInfo.length;
    } catch (_) {
      return null;
    }
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler) return false;
  Promise.resolve(handler(msg))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
  return true;
});
