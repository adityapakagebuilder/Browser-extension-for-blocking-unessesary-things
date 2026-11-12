/*
 * Thin Gmail REST API client used by the background service worker.
 * Auth is handled with chrome.identity (see README for the OAuth setup).
 */
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export function isOAuthConfigured() {
  const id = chrome.runtime.getManifest().oauth2?.client_id || '';
  return Boolean(id) && !id.startsWith('YOUR_CLIENT_ID');
}

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

/**
 * Gets an OAuth token. Chrome's built-in sign-in (getAuthToken) is tried
 * first; browsers without it (Edge, Brave, Opera…) or a "Web application"
 * client ID fall back to the standard OAuth web flow.
 */
export async function getToken(interactive) {
  let nativeError;
  try {
    const result = await chrome.identity.getAuthToken({ interactive });
    // Chrome >= 105 resolves to { token }, older builds to the token string.
    const token = typeof result === 'string' ? result : result?.token;
    if (token) return token;
  } catch (e) {
    nativeError = e;
  }

  const { webToken } = await chrome.storage.session.get('webToken');
  if (webToken && webToken.expiresAt > Date.now() + 60_000) return webToken.token;
  if (!interactive) throw new Error(explainAuthError(nativeError?.message || 'Not signed in to Gmail'));

  try {
    return await webAuthFlow();
  } catch (webError) {
    throw new Error(explainAuthError(nativeError?.message, webError.message));
  }
}

async function webAuthFlow() {
  const params = new URLSearchParams({
    client_id: chrome.runtime.getManifest().oauth2.client_id,
    response_type: 'token',
    redirect_uri: chrome.identity.getRedirectURL(),
    scope: SCOPES.join(' '),
    prompt: 'consent',
  });
  const url = await chrome.identity.launchWebAuthFlow({
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    interactive: true,
  });
  const hash = new URLSearchParams(new URL(url).hash.slice(1));
  if (hash.get('error')) throw new Error(hash.get('error'));
  const token = hash.get('access_token');
  if (!token) throw new Error('No access token returned');
  const expiresAt = Date.now() + Number(hash.get('expires_in') || 3600) * 1000;
  await chrome.storage.session.set({ webToken: { token, expiresAt } });
  return token;
}

/** Turns cryptic OAuth errors into a fix the user can act on. */
export function explainAuthError(message = '', secondary = '') {
  const m = `${message} ${secondary}`.toLowerCase();
  const id = chrome.runtime.id;
  if (/bad client id|invalid_client|invalid oauth2 client id|redirect_uri_mismatch/.test(m))
    return `Google rejected the client ID. In Google Cloud it must be a "Chrome extension" OAuth client whose Item ID is exactly ${id}.`;
  if (/not supported|unsupported/.test(m))
    return 'This browser does not support Google sign-in for extensions. Please use Google Chrome.';
  if (/user is not signed in|not signed in to chrome/.test(m))
    return 'Sign in to Chrome with your Google account (profile icon, top right), then try again.';
  if (/access_denied|not granted|did not approve|cancel/.test(m))
    return 'Access was not granted. If Google said "Access blocked", add your Gmail address as a Test user on the OAuth consent screen.';
  return [message, secondary].filter(Boolean).join(' / ') || 'Sign-in failed';
}

export async function signOut() {
  await chrome.storage.session.remove('webToken');
  try {
    const result = await chrome.identity.getAuthToken({ interactive: false });
    const token = typeof result === 'string' ? result : result?.token;
    if (token) {
      await chrome.identity.removeCachedAuthToken({ token });
      await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: 'POST' });
    }
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
    await chrome.identity.removeCachedAuthToken({ token }).catch(() => {});
    await chrome.storage.session.remove('webToken');
    return call(path, { method, body, retry: false });
  }
  if (res.status === 429 && retry) {
    await new Promise((r) => setTimeout(r, 2000));
    return call(path, { method, body, retry: false });
  }
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 403 && /accessNotConfigured|has not been used|is disabled/i.test(text)) {
      throw new Error('The Gmail API is not turned on for your Google Cloud project. Enable it under APIs & Services → Library → Gmail API.');
    }
    if (res.status === 403 && /insufficient/i.test(text)) {
      throw new Error('Gmail permission is missing. Disconnect, reconnect, and tick the Gmail box on the Google consent screen.');
    }
    throw new Error(`Gmail API error ${res.status}: ${text.slice(0, 200)}`);
  }
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
