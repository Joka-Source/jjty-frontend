import { createAnalyticsDelivery } from './analytics-delivery.js';
import { createEventUuid } from './command-journal.js';

// Active in development and production. Only new journal events enroll; the
// durable outbox owns retries, so opting back in cannot replay an off window.
export function createProductAnalytics(journal, options = {}) {
  const env = import.meta.env ?? {};
  const host = options.host ?? env.VITE_POSTHOG_HOST;
  let endpoint;
  try {
    const url = new URL(host);
    if (!url.search && !url.hash && (url.pathname === '/' || /^\/batch\/?$/.test(url.pathname))) {
      url.pathname = '/batch';
      endpoint = url.href;
    }
  } catch { /* Missing destination is visible, never guessed. */ }
  const delivery = createAnalyticsDelivery({ ...options, endpoint, token: options.token ?? env.VITE_POSTHOG_PROJECT_TOKEN });
  const sessionId = createEventUuid();
  let disposed = false;
  let pending = Promise.resolve();
  const off = journal.subscribe(events => {
    if (disposed || !events?.length || !delivery.getState().enabled) return;
    const batch = events.map(event => ({ ...event, properties: { ...event.properties, distinct_id: sessionId } }));
    // Enter delivery immediately, preserving lock order with a following opt-out.
    const operation = Promise.resolve(delivery.enqueue(batch));
    pending = Promise.all([pending, operation]).then(() => undefined);
  });
  const wake = () => { void delivery.flush(); };
  globalThis.addEventListener?.('online', wake);
  return Object.freeze({
    getState: delivery.getState,
    subscribe: delivery.subscribe,
    setEnabled: delivery.setEnabled,
    async flush() { await pending; return delivery.flush(); },
    async settled() { await pending; return delivery.getState(); },
    dispose() { disposed = true; off(); globalThis.removeEventListener?.('online', wake); delivery.dispose(); },
  });
}
