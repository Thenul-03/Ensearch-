import { API_BASE_URL } from '../config';
import type { AuthStatus, ExtensionMessage, ExtensionResponse } from '../types/messages';

/**
 * The service worker is the only part of the extension that knows the auth token.
 * Content scripts and the popup ask it to call the backend, so the token never
 * reaches the Zoho page's context.
 */

const SESSION_KEY = 'ensearchSession';
const REQUEST_TIMEOUT_MS = 10_000;

interface Session {
  token: string;
  email: string;
  orgName: string;
}

interface LoginResponse {
  token?: string;
  user?: { email?: string };
  organization?: { name?: string };
  error?: string;
}

interface MeResponse {
  user?: { email?: string };
  organization?: { name?: string };
}

async function getSession(): Promise<Session | null> {
  const stored = await chrome.storage.local.get(SESSION_KEY);
  return (stored[SESSION_KEY] as Session | undefined) ?? null;
}

async function saveSession(session: Session): Promise<void> {
  await chrome.storage.local.set({ [SESSION_KEY]: session });
}

async function clearSession(): Promise<void> {
  await chrome.storage.local.remove(SESSION_KEY);
}

function toStatus(session: Session | null): AuthStatus {
  return session
    ? { loggedIn: true, email: session.email, orgName: session.orgName }
    : { loggedIn: false };
}

async function apiFetch(path: string, init: RequestInit = {}, token?: string): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function isAuthFailure(response: Response): boolean {
  return response.status === 401 || response.status === 403;
}

async function login(email: string, password: string): Promise<ExtensionResponse<AuthStatus>> {
  const response = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = (await response.json().catch(() => ({}))) as LoginResponse;

  if (!response.ok || !body.token) {
    return { ok: false, error: body.error ?? `Login failed (${response.status})` };
  }

  const session: Session = {
    token: body.token,
    email: body.user?.email ?? email,
    orgName: body.organization?.name ?? '',
  };
  await saveSession(session);
  return { ok: true, data: toStatus(session) };
}

async function getStatus(): Promise<ExtensionResponse<AuthStatus>> {
  const session = await getSession();
  if (!session) {
    return { ok: true, data: { loggedIn: false } };
  }

  try {
    const response = await apiFetch('/api/auth/me', {}, session.token);
    if (isAuthFailure(response)) {
      await clearSession();
      return { ok: true, data: { loggedIn: false } };
    }
    if (response.ok) {
      const body = (await response.json()) as MeResponse;
      const refreshed: Session = {
        token: session.token,
        email: body.user?.email ?? session.email,
        orgName: body.organization?.name ?? session.orgName,
      };
      await saveSession(refreshed);
      return { ok: true, data: toStatus(refreshed) };
    }
  } catch {
    // Backend unreachable: fall back to what we already know.
  }

  return { ok: true, data: toStatus(session) };
}

async function search(q: string): Promise<ExtensionResponse<unknown>> {
  const session = await getSession();
  if (!session) {
    return { ok: false, error: 'Not signed in', code: 'AUTH_REQUIRED' };
  }

  const response = await apiFetch(`/api/search?q=${encodeURIComponent(q)}`, {}, session.token);

  if (isAuthFailure(response)) {
    await clearSession();
    return { ok: false, error: 'Session expired. Sign in again.', code: 'AUTH_REQUIRED' };
  }

  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    return { ok: false, error: body.error ?? `Search request failed (${response.status})` };
  }

  return { ok: true, data: body };
}

async function handleMessage(message: ExtensionMessage): Promise<ExtensionResponse<unknown>> {
  switch (message.type) {
    case 'AUTH_LOGIN':
      if (typeof message.email !== 'string' || typeof message.password !== 'string') {
        return { ok: false, error: 'Email and password are required' };
      }
      return login(message.email.trim(), message.password);
    case 'AUTH_LOGOUT':
      await clearSession();
      return { ok: true, data: { loggedIn: false } satisfies AuthStatus };
    case 'AUTH_STATUS':
      return getStatus();
    case 'SEARCH':
      if (typeof message.q !== 'string' || message.q.trim().length === 0) {
        return { ok: false, error: 'A search query is required' };
      }
      return search(message.q.trim());
    default:
      return { ok: false, error: 'Unknown message' };
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  // Only accept messages from this extension's own content scripts and pages.
  if (sender.id !== chrome.runtime.id) {
    return false;
  }

  handleMessage(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
      sendResponse({
        ok: false,
        error: timedOut
          ? 'The Ensearch server did not respond in time'
          : 'Could not reach the Ensearch server',
      } satisfies ExtensionResponse<never>);
    });

  return true; // keep the message channel open for the async response
});
