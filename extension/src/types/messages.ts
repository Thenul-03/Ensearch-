/** Messages sent from the content script / popup to the background service worker. */
export type ExtensionMessage =
  | { type: 'AUTH_LOGIN'; email: string; password: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'AUTH_STATUS' }
  | { type: 'SEARCH'; q: string };

export interface AuthStatus {
  loggedIn: boolean;
  email?: string;
  orgName?: string;
}

export type ExtensionResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: 'AUTH_REQUIRED' };
