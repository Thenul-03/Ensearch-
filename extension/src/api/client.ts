import type { ExtensionMessage, ExtensionResponse } from '../types/messages';

/** Sends a message to the background service worker and always resolves (never throws). */
export async function sendMessage<T>(message: ExtensionMessage): Promise<ExtensionResponse<T>> {
  try {
    return (await chrome.runtime.sendMessage(message)) as ExtensionResponse<T>;
  } catch {
    // Happens after the extension is reloaded/updated while the Zoho tab stays open.
    return { ok: false, error: 'Ensearch was updated. Refresh this page to continue.' };
  }
}
