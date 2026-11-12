const btn = document.getElementById('connect-btn');
const result = document.getElementById('result');

async function send(type, payload = {}) {
  const res = await chrome.runtime.sendMessage({ type, ...payload });
  if (!res?.ok) throw new Error(res?.error || 'Something went wrong');
  return res.data;
}

function showProgress(p) {
  if (!p) return;
  result.textContent = p.error
    ? `Couldn't finish: ${p.error}`
    : p.running
      ? `Cleaning… ${p.scanned} checked, ${p.trashed} removed, ${p.codes} codes kept`
      : `All done: ${p.trashed} promos removed, ${p.codes} verification codes kept.`;
}

send('getState').then((s) => {
  document.getElementById('oauth-missing').hidden = s.oauthConfigured;
  btn.disabled = !s.oauthConfigured;
  if (s.gmailAccount) {
    btn.textContent = `Connected: ${s.gmailAccount}`;
    btn.disabled = true;
  }
  showProgress(s.cleanProgress);
});

btn.addEventListener('click', async () => {
  btn.disabled = true;
  try {
    const { email } = await send('connectGmail');
    btn.textContent = `Connected: ${email}`;
  } catch (e) {
    result.textContent = e.message;
    btn.disabled = false;
  }
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.cleanProgress) showProgress(changes.cleanProgress.newValue);
});
