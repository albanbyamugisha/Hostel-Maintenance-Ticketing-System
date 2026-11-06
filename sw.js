/* eslint-env serviceworker */
/**
 * HostelCare service worker.
 *
 * Strategy:
 *  - App shell (HTML/CSS/JS/icons) is precached on install.
 *  - Navigations are network-first with a cached index.html fallback so the
 *    hash router still boots offline.
 *  - Same-origin static assets use stale-while-revalidate.
 *  - Data is saved locally. The bundled Chart.js library is also precached.
 */

const VERSION = "hmt-final-v3.0.1";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./vendor/chart.umd.min.js",
  "./css/tokens.css",
  "./css/base.css",
  "./css/components.css",
  "./css/layout.css",
  "./js/main.js",
  "./js/localData.js",
  "./js/accounts.js",
  "./js/demoData.js",
  "./js/utils.js",
  "./js/icons.js",
  "./js/theme.js",
  "./js/toast.js",
  "./js/ui.js",
  "./js/api.js",
  "./js/store.js",
  "./js/auth.js",
  "./js/notifications.js",
  "./js/appShell.js",
  "./js/router.js",
  "./js/components/assignModal.js",
  "./js/components/createTechnicianModal.js",
  "./js/components/authLayout.js",
  "./js/components/notificationItem.js",
  "./js/components/pageBits.js",
  "./js/components/photoUploader.js",
  "./js/components/ticketActions.js",
  "./js/components/ticketCard.js",
  "./js/components/ticketStepper.js",
  "./js/components/ticketTimeline.js",
  "./js/pages/adminReports.js",
  "./js/pages/adminTickets.js",
  "./js/pages/adminTriage.js",
  "./js/pages/adminUsers.js",
  "./js/pages/forgotPassword.js",
  "./js/pages/login.js",
  "./js/pages/newTicket.js",
  "./js/pages/notFound.js",
  "./js/pages/notifications.js",
  "./js/pages/profile.js",
  "./js/pages/register.js",
  "./js/pages/resetPassword.js",
  "./js/pages/residentDashboard.js",
  "./js/pages/residentTickets.js",
  "./js/pages/setup.js",
  "./js/pages/technicianJobs.js",
  "./js/pages/ticketDetail.js",
  "./icons/favicon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll fails the whole install if one asset is missing; add
      // individually so a single typo cannot brick offline support.
      await Promise.all(
        SHELL_ASSETS.map(async (asset) => {
          try {
            // A previous worker may still control this page. A versioned
            // request bypasses its older cache; save under the canonical URL.
            const freshUrl = new URL(asset, self.location.href);
            freshUrl.searchParams.set("hmt-version", VERSION);
            const response = await fetch(new Request(freshUrl, { cache: "reload" }));
            if (!response.ok) throw new Error(`Asset unavailable: ${asset}`);
            await cache.put(new Request(new URL(asset, self.location.href)), response);
          } catch (error) {
            console.warn("[sw] Could not precache", asset, error);
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("hmt-") && key !== SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

function isCacheableAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.endsWith(".js") ||
      url.pathname.endsWith(".css") ||
      url.pathname.endsWith(".png") ||
      url.pathname.endsWith(".svg") ||
      url.pathname.endsWith(".webmanifest") ||
      url.pathname.endsWith(".woff2"))
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // App data is local; only intercept application-origin assets.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, response.clone()).catch(() => {});
          return response;
        } catch (error) {
          const cached =
            (await caches.match(request)) || (await caches.match("./index.html"));
          return (
            cached ||
            new Response(
              "<!DOCTYPE html><html><body><h1>You are offline</h1><p>Reconnect to load HostelCare.</p></body></html>",
              { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
            )
          );
        }
      })()
    );
    return;
  }

  if (!isCacheableAsset(url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);

      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            cache.put(request, response.clone()).catch(() => {});
          }
          return response;
        })
        .catch(() => null);

      if (url.pathname.endsWith(".js")) {
        return (await network) || cached || (await (await caches.open(SHELL_CACHE)).match(request)) || Response.error();
      }

      if (cached) {
        // Refresh in the background; serve the cached copy immediately.
        event.waitUntil(network);
        return cached;
      }

      const response = await network;
      if (response) return response;

      const shell = await caches.open(SHELL_CACHE);
      return (
        (await shell.match(request)) ||
        new Response("/* offline */", {
          status: 503,
          headers: { "Content-Type": "text/javascript; charset=utf-8" },
        })
      );
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
