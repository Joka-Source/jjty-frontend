// Keep development uncached; only the immutable production build owns a
// service worker. Registration failure leaves the online app fully usable.
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
    scope: import.meta.env.BASE_URL,
  });
}

registerServiceWorker().catch((error) => {
  console.warn("jt could not prepare offline reading", error);
});
