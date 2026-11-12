/*
 * Thin Gmail REST API client used by the background service worker.
 * Auth is handled with chrome.identity (see README for the OAuth setup).
 */
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export function isOAuthConfigured() {
  const id = chrome.runtime.getManifest().oauth2?.client_id || '';
  return Boolean(id) && !id.startsWith('YOUR_CLIENT_ID');
}

export async function getToken(interactive) {
  const result = await chrome.identity.getAuthToken({ interactive });
  // Chrome >= 105 resolves to { token }, older builds to the token string.
  const token = typeof result === 'string' ? result : result?.token;
  if (!token) throw new Error('Not signed in to Gmail');
  return token;
}

export async function signOut() {
  try {
    const token = await getToken(false);
    await chrome.identity.removeCachedAuthToken({ token });
    await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: 'POST' });
  } catch (_) {
    /* already signed out */
  }
}

async function call(path, { method = 'GET', body, retry = true } = {}) {
  const token = await getToken(false);
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && retry) {
    await chrome.identity.removeCachedAuthToken({ token });
    return call(path, { method, body, retry: false });
  }
  if (res.status === 429 && retry) {
    await new Promise((r) => setTimeout(r, 2000));
    return call(path, { method, body, retry: false });
  }
  if (!res.ok) throw new Error(`Gmail API ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

export async function getProfile() {
  return call('/profile');
}

/** Async generator yielding pages of message ids that match `q`. */
export async function* listMessageIds(q) {
  let pageToken;
  do {
    const params = new URLSearchParams({ q, maxResults: '500' });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await call(`/messages?${params}`);
    yield (data.messages || []).map((m) => m.id);
    pageToken = data.nextPageToken;
  } while (pageToken);
}

export async function getMessageMeta(id) {
  const params = new URLSearchParams({ format: 'metadata' });
  params.append('metadataHeaders', 'Subject');
  params.append('metadataHeaders', 'From');
  const m = await call(`/messages/${id}?${params}`);
  const header = (name) =>
    (m.payload?.headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
  return {
    id: m.id,
    labelIds: m.labelIds || [],
    subject: header('Subject'),
    from: header('From'),
    snippet: m.snippet || '',
  };
}

/** Moves messages to Trash (recoverable for 30 days in Gmail). */
export async function trashMessages(ids) {
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    try {
      await call('/messages/batchModify', {
        method: 'POST',
        body: { ids: chunk, addLabelIds: ['TRASH'], removeLabelIds: ['INBOX'] },
      });
    } catch (_) {
      // Fall back to the per-message trash endpoint.
      await mapLimit(chunk, 5, (id) => call(`/messages/${id}/trash`, { method: 'POST' }));
    }
  }
}

/** Runs `fn` over `items` with a fixed concurrency. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i]);
      } catch (e) {
        out[i] = null;
      }
    }
  });
  await Promise.all(workers);
  return out;
}
