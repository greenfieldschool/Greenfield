/* Greenfield portal service worker: phone notifications only (no offline caching, so pages are always fresh).
 * Registered from the portal (src/app/portal/_components/push-setup.tsx) with scope /portal.
 * - push: shows the alert the website sent (title, body, the page to open) and updates the app icon's badge.
 * - notificationclick: opens that page, reusing an open portal window when there is one.
 * - pushsubscriptionchange: when the phone renews its push address, saves the new one for the same person.
 */

const ICON = "/app-icon/192";
const BADGE = "/app-icon/badge";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function portalUrl(path) {
  const url = new URL(typeof path === "string" ? path : "/portal/notifications", self.location.origin);
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/portal")) {
    return new URL("/portal/notifications", self.location.origin).href;
  }
  return url.href;
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Greenfield School", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Greenfield School";
  const options = {
    body: data.body || "",
    icon: ICON,
    badge: BADGE,
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: portalUrl(data.url) },
    lang: "en-GB"
  };
  const work = [self.registration.showNotification(title, options)];
  if (typeof data.unread === "number" && self.navigator && "setAppBadge" in self.navigator) {
    work.push(self.navigator.setAppBadge(data.unread).catch(() => undefined));
  }
  event.waitUntil(Promise.all(work));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = portalUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          try {
            await client.focus();
            if ("navigate" in client) return client.navigate(target);
          } catch (e) {
            // Fall through and open a new window.
          }
        }
      }
      return self.clients.openWindow(target);
    })()
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  const old = event.oldSubscription;
  event.waitUntil(
    (async () => {
      const options = old && old.options ? old.options : null;
      const fresh = event.newSubscription || (options ? await self.registration.pushManager.subscribe(options) : null);
      if (!fresh) return;
      const json = fresh.toJSON();
      await fetch("/api/push/subscription", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, oldEndpoint: old ? old.endpoint : null })
      });
    })().catch(() => undefined)
  );
});
