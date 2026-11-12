const $ = (id) => document.getElementById(id);
let state = null;
let currentHost = null;
let currentTabId = null;

async function send(type, payload = {}) {
  const res = await chrome.runtime.sendMessage({ type, ...payload });
  if (!res?.ok) throw new Error(res?.error || 'Something went wrong');
  return res.data;
}

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 3500);
}

const fmt = (n) => (n == null ? '–' : Intl.NumberFormat(undefined, { notation: 'compact' }).format(n));

function render() {
  if (!state) return;
  const { settings, stats, gmailAccount, cleanProgress, oauthConfigured } = state;

  document.querySelectorAll('[data-setting]').forEach((input) => {
    input.checked = Boolean(settings[input.dataset.setting]);
  });

  const webOn = settings.adBlock || settings.cosmetic;
  const paused = currentHost && settings.pausedSites.includes(currentHost);
  $('status-pill').textContent = !webOn ? 'Off' : paused ? 'Paused' : 'On';
  $('status-pill').classList.toggle('off', !webOn || paused);
  $('status-line').textContent = !webOn
    ? 'Web protection is off'
    : paused
      ? `Paused on ${currentHost}`
      : 'Protecting your browser';

  $('stat-hidden').textContent = fmt(stats.elementsHidden);
  $('stat-emails').textContent = fmt(stats.emailsTrashed);
  $('stat-codes').textContent = fmt(stats.codesKept);

  // Current site
  $('site-row').hidden = !currentHost;
  if (currentHost) {
    $('site-host').textContent = currentHost;
    $('site-icon').src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(currentHost)}&sz=32`;
    $('pause-btn').textContent = paused ? 'Resume here' : 'Pause here';
  }

  // Gmail
  $('gmail-connected').hidden = !gmailAccount;
  $('gmail-disconnected').hidden = Boolean(gmailAccount);
  $('oauth-missing').hidden = oauthConfigured;
  $('connect-btn').disabled = !oauthConfigured;
  $('gmail-account').textContent = gmailAccount || '';

  const p = cleanProgress;
  $('progress').hidden = !p;
  $('clean-btn').disabled = Boolean(p?.running);
  if (p) {
    $('bar-fill').className = `bar-fill ${p.running ? 'running' : p.error ? '' : 'done'}`;
    $('progress-text').textContent = p.error
      ? `Couldn't finish: ${p.error}`
      : p.running
        ? `Scanning… ${p.scanned} checked, ${p.trashed} removed, ${p.codes} codes kept`
        : `Done — ${p.trashed} promos removed, ${p.kept} kept (${p.codes} verification codes)`;
  }

  // Allowlist
  const list = $('allow-list');
  list.replaceChildren();
  if (!settings.allowlist.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No senders yet';
    list.append(li);
  }
  settings.allowlist.forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = entry;
    const rm = document.createElement('button');
    rm.textContent = '×';
    rm.title = `Remove ${entry}`;
    rm.onclick = () => updateSettings({ allowlist: settings.allowlist.filter((e) => e !== entry) });
    li.append(rm);
    list.append(li);
  });
}

async function refresh() {
  state = await send('getState');
  render();
}

async function refreshTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  currentTabId = tab?.id ?? null;
  try {
    const url = new URL(tab?.url || '');
    currentHost = /^https?:$/.test(url.protocol) ? url.hostname.replace(/^www\./, '') : null;
  } catch (_) {
    currentHost = null;
  }
  render();
  if (currentTabId != null) {
    const count = await send('blockedOnTab', { tabId: currentTabId }).catch(() => null);
    $('stat-tab').textContent = fmt(count);
  }
}

async function updateSettings(patch) {
  state.settings = await send('updateSettings', { patch });
  render();
}

// --------------------------------------------------------------- wiring --
document.querySelectorAll('[data-setting]').forEach((input) => {
  input.addEventListener('change', () => updateSettings({ [input.dataset.setting]: input.checked }));
});

$('pause-btn').addEventListener('click', async () => {
  if (!currentHost) return;
  state.settings = await send('togglePause', { host: currentHost });
  render();
  if (currentTabId != null) chrome.tabs.reload(currentTabId);
});

$('connect-btn').addEventListener('click', async () => {
  $('connect-btn').disabled = true;
  $('gmail-error').hidden = true;
  try {
    const { email } = await send('connectGmail');
    toast(`Connected ${email}. Cleaning up promos…`);
  } catch (e) {
    $('gmail-error').textContent = e.message;
    $('gmail-error').hidden = false;
  }
  await refresh();
});

$('ext-id').textContent = chrome.runtime.id;
$('copy-id').addEventListener('click', async () => {
  await navigator.clipboard.writeText(chrome.runtime.id);
  toast('Extension ID copied');
});

$('disconnect-btn').addEventListener('click', async () => {
  await send('disconnectGmail');
  await refresh();
});

$('clean-btn').addEventListener('click', async () => {
  $('clean-btn').disabled = true;
  try {
    await send('cleanNow');
  } catch (e) {
    toast(e.message);
  }
  await refresh();
});

$('allow-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const value = $('allow-input').value.trim().toLowerCase();
  if (!value) return;
  if (!/^[^\s@]*@?[a-z0-9.-]+\.[a-z]{2,}$/.test(value)) {
    toast('Enter a domain like store.com or an email address');
    return;
  }
  $('allow-input').value = '';
  if (!state.settings.allowlist.includes(value)) {
    updateSettings({ allowlist: [...state.settings.allowlist, value] });
  }
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.stats || changes.settings || changes.cleanProgress || changes.gmailAccount) refresh();
});
chrome.tabs.onActivated.addListener(refreshTab);
chrome.tabs.onUpdated.addListener((_id, info, tab) => {
  if (tab.active && (info.url || info.status === 'complete')) refreshTab();
});

refresh().then(refreshTab);
