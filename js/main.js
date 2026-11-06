import { initTheme } from "./theme.js";
import { initAuth } from "./auth.js";
import { initRouter } from "./router.js";
import { subscribe, store } from "./store.js";
import { startNotifications, stopNotifications } from "./notifications.js";
import { updateNotificationUi } from "./appShell.js";

initTheme();

// Repeated Enter presses must not dispatch another pending form mutation.
document.addEventListener("submit", (event) => {
  if (event.target.querySelector('[type="submit"][aria-busy="true"]')) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);

let startupError = null;
try { await initAuth(); } catch (error) { startupError = error; console.error(error); }

let notificationsUserId = null;

subscribe((state) => {
  const userId = state.session?.user?.id ?? null;

  if (userId && userId !== notificationsUserId) {
    notificationsUserId = userId;
    startNotifications(userId);
  } else if (!userId && notificationsUserId) {
    notificationsUserId = null;
    stopNotifications();
  }

  if (userId && document.querySelector(".app-shell")) {
    updateNotificationUi();
  }
});

// A restored session exists before subscriptions are installed.
if (store.session?.user?.id) {
  notificationsUserId = store.session.user.id;
  startNotifications(notificationsUserId);
}

if (startupError) {
  document.getElementById("app").innerHTML = `<main class="auth-main"><section class="auth-card card"><div class="card__body stack"><h1>Browser storage unavailable</h1><p>Allow this site to save browser data, then reload. Use localhost or HTTPS so local sign-in is available.</p><button class="btn btn--primary" data-retry>Reload</button></div></section></main>`;
  document.querySelector('[data-retry]').addEventListener('click', () => location.reload());
} else {
  initRouter();
}

/* Re-check the session when the tab becomes visible again after a long pause. */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && store.session) {
    // Keep the badge current when returning to this tab.
    updateNotificationUi();
  }
});
