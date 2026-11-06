import { icon } from "./icons.js";
import { escapeHtml, avatarHtml, roleLabel, initials } from "./utils.js";
import { store } from "./store.js";
import { bindThemeToggle, updateThemeToggles } from "./theme.js";
import { signOut } from "./auth.js";
import { toast } from "./toast.js";
import { setButtonBusy } from "./ui.js";
import { markAllRead, markRead } from "./notifications.js";
import { notificationList } from "./components/notificationItem.js";

let shellProfileId = null;
let shellRole = null;
let bound = false;

const NAV = {
  resident: {
    main: [
      { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: "home" },
      { key: "tickets", label: "My tickets", href: "/tickets", icon: "ticket" },
      { key: "new-ticket", label: "Report an issue", href: "/tickets/new", icon: "plus" },
    ],
    account: [
      { key: "notifications", label: "Notifications", href: "/notifications", icon: "bell" },
      { key: "profile", label: "Profile", href: "/profile", icon: "user" },
    ],
    tabs: [
      { key: "dashboard", label: "Home", href: "/dashboard", icon: "home" },
      { key: "tickets", label: "Tickets", href: "/tickets", icon: "ticket" },
      { key: "new-ticket", label: "Report", href: "/tickets/new", icon: "plus", accent: true },
      { key: "notifications", label: "Alerts", href: "/notifications", icon: "bell" },
      { key: "profile", label: "Profile", href: "/profile", icon: "user" },
    ],
  },
  technician: {
    main: [{ key: "jobs", label: "My jobs", href: "/jobs", icon: "wrench" }],
    account: [
      { key: "notifications", label: "Notifications", href: "/notifications", icon: "bell" },
      { key: "profile", label: "Profile", href: "/profile", icon: "user" },
    ],
    tabs: [
      { key: "jobs", label: "Jobs", href: "/jobs", icon: "wrench" },
      { key: "notifications", label: "Alerts", href: "/notifications", icon: "bell" },
      { key: "profile", label: "Profile", href: "/profile", icon: "user" },
    ],
  },
  admin: {
    main: [
      { key: "triage", label: "Triage desk", href: "/admin", icon: "gauge" },
      { key: "all-tickets", label: "All tickets", href: "/admin/tickets", icon: "list" },
      { key: "users", label: "People", href: "/admin/users", icon: "users" },
      { key: "reports", label: "Reports", href: "/admin/reports", icon: "bar-chart" },
    ],
    account: [
      { key: "notifications", label: "Notifications", href: "/notifications", icon: "bell" },
      { key: "profile", label: "Profile", href: "/profile", icon: "user" },
    ],
    tabs: [
      { key: "triage", label: "Triage", href: "/admin", icon: "gauge" },
      { key: "all-tickets", label: "Tickets", href: "/admin/tickets", icon: "list" },
      { key: "users", label: "People", href: "/admin/users", icon: "users" },
      { key: "reports", label: "Reports", href: "/admin/reports", icon: "bar-chart" },
      { key: "profile", label: "Profile", href: "/profile", icon: "user" },
    ],
  },
};

function navFor(role) {
  return NAV[role] ?? NAV.resident;
}

function linkHtml(item, { tab = false } = {}) {
  if (tab) {
    return `
      <a class="tab${item.accent ? " tab--accent" : ""}" href="#${item.href}"
        data-nav-key="${item.key}">
        <span class="tab__icon">${icon(item.icon)}</span>
        <span>${escapeHtml(item.label)}</span>
        ${item.key === "notifications" ? '<span class="tab__badge" data-unread-badge hidden></span>' : ""}
      </a>
    `;
  }
  return `
    <a class="nav-link" href="#${item.href}" data-nav-key="${item.key}">
      ${icon(item.icon)}
      <span>${escapeHtml(item.label)}</span>
      ${item.key === "notifications" ? '<span class="nav-link__badge" data-unread-badge hidden></span>' : ""}
    </a>
  `;
}

function navGroup(label, items, options) {
  return `
    <li class="nav__label">${escapeHtml(label)}</li>
    ${items.map((item) => `<li>${linkHtml(item, options)}</li>`).join("")}
  `;
}

function shellHtml(profile) {
  const nav = navFor(profile.role);
  const name = profile.full_name || "Account";
  const role = roleLabel(profile.role);

  return `
    <a class="skip-link" href="#view">Skip to main content</a>
    <div class="app-shell">
      <aside class="sidebar" aria-label="Sidebar">
        <div class="sidebar__brand">
          <a class="brand" href="#/">
            <span class="brand__mark" aria-hidden="true">${icon("wrench")}</span>
            <span class="brand__text">
              <span class="brand__name">HostelCare</span>
              <span class="brand__sub">Maintenance desk</span>
            </span>
          </a>
        </div>

        <nav class="sidebar__nav" aria-label="Primary">
          <ul class="nav">
            ${navGroup("Workspace", nav.main)}
            ${navGroup("Account", nav.account)}
          </ul>
        </nav>

        <div class="sidebar__foot stack-sm">
          <a class="user-card" href="#/profile" data-nav-key="profile">
            ${avatarHtml(name, profile.role)}
            <span class="user-card__text">
              <span class="user-card__name">${escapeHtml(name)}</span>
              <span class="user-card__role">${escapeHtml(role)}</span>
            </span>
            <span class="user-card__chevron">${icon("chevron-right")}</span>
          </a>
          <div class="row-between" style="padding-inline: 0.35rem">
            <button type="button" class="icon-btn" data-theme-toggle aria-label="Toggle theme"></button>
            <button type="button" class="btn btn--ghost btn--sm" data-sign-out>
              ${icon("logout")} Sign out
            </button>
          </div>
        </div>
      </aside>

      <div class="app-main">
        <header class="topbar">
          <div class="topbar__inner">
            <a class="topbar__brand" href="#/" aria-label="HostelCare home">
              <span class="brand__mark" aria-hidden="true">${icon("wrench")}</span>
              <span class="brand__name">HostelCare</span>
            </a>
            <div class="topbar__context" aria-hidden="true">
              <span class="topbar__crumb" data-crumb>Dashboard</span>
            </div>
            <span class="topbar__spacer"></span>
            <div class="topbar__actions">
              <div class="bell-wrap">
                <button type="button" class="icon-btn bell" data-bell aria-label="Notifications"
                  aria-expanded="false" aria-controls="notif-panel">
                  ${icon("bell")}
                  <span class="bell__badge" data-unread-badge hidden></span>
                </button>
                <div class="notif-panel" id="notif-panel" data-notif-panel hidden>
                  <div class="notif-panel__head">
                    <h2>Notifications</h2>
                    <button type="button" class="link-btn" data-mark-all>Mark all read</button>
                  </div>
                  <div class="notif-panel__list" data-notif-panel-list></div>
                  <div class="notif-panel__foot">
                    <a class="btn btn--secondary btn--sm" href="#/notifications">View all notifications</a>
                  </div>
                </div>
              </div>
              <button type="button" class="icon-btn" data-theme-toggle aria-label="Toggle theme"></button>
              <a class="topbar__avatar" href="#/profile" aria-label="Your profile">
                ${avatarHtml(name, profile.role, "avatar--sm")}
              </a>
            </div>
          </div>
        </header>

        <div class="offline-banner" data-offline hidden>
          ${icon("wifi-off")} You are offline. Your tickets and changes still save on this browser.
        </div>

        <main class="view" id="view" tabindex="-1"></main>
      </div>

      <nav class="tabbar" aria-label="Primary">
        ${nav.tabs.map((item) => linkHtml(item, { tab: true })).join("")}
      </nav>
    </div>
  `;
}

function bindShell() {
  if (bound) return;
  bound = true;

  document.addEventListener("click", (event) => {
    const signOutButton = event.target.closest("[data-sign-out]");
    if (signOutButton) {
      event.preventDefault();
      handleSignOut(signOutButton);
      return;
    }

    const markAllButton = event.target.closest("[data-mark-all]");
    if (markAllButton) {
      event.preventDefault();
      void markAllRead();
      return;
    }

    const readButton = event.target.closest("[data-notif-read]");
    if (readButton) {
      const item = readButton.closest("[data-notif-id]");
      if (item) void markRead(item.dataset.notifId);
      return;
    }

    const notifOpen = event.target.closest("[data-notif-open]");
    if (notifOpen) {
      const item = notifOpen.closest("[data-notif-id]");
      if (item) void markRead(item.dataset.notifId);
      closeNotifPanel();
      return;
    }

    const bell = event.target.closest("[data-bell]");
    if (bell) {
      event.preventDefault();
      toggleNotifPanel();
      return;
    }

    if (!event.target.closest("[data-notif-panel]") && !event.target.closest("[data-bell]")) {
      closeNotifPanel();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeNotifPanel();
  });

  window.addEventListener("online", updateOfflineBanner);
  window.addEventListener("offline", updateOfflineBanner);
  window.addEventListener("themechange", updateThemeToggles);
}

async function handleSignOut(button) {
  setButtonBusy(button, true, "Signing out…");
  try {
    await signOut();
    toast("You have been signed out.", "info");
  } catch (error) {
    console.error(error);
    toast("Could not sign out. Please try again.", "error");
  } finally {
    setButtonBusy(button, false);
  }
}

function toggleNotifPanel(force) {
  const panel = document.querySelector("[data-notif-panel]");
  const bell = document.querySelector("[data-bell]");
  if (!panel || !bell) return;
  const open = typeof force === "boolean" ? force : panel.hidden;
  panel.hidden = !open;
  bell.setAttribute("aria-expanded", String(open));
  if (open) {
    renderNotifPanel();
    panel.querySelector("a, button")?.focus({ preventScroll: true });
  }
}

function closeNotifPanel() {
  const panel = document.querySelector("[data-notif-panel]");
  const bell = document.querySelector("[data-bell]");
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  bell?.setAttribute("aria-expanded", "false");
}

function renderNotifPanel() {
  const list = document.querySelector("[data-notif-panel-list]");
  if (!list) return;
  const items = store.notifications.slice(0, 8);
  list.innerHTML = notificationList(items, { compact: true });
}

function updateUnreadBadges() {
  const count = store.unreadCount;
  document.querySelectorAll("[data-unread-badge]").forEach((badge) => {
    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.hidden = false;
    } else {
      badge.textContent = "";
      badge.hidden = true;
    }
  });
  const bell = document.querySelector("[data-bell]");
  if (bell) {
    bell.setAttribute(
      "aria-label",
      count > 0 ? `Notifications, ${count} unread` : "Notifications"
    );
  }
}

function updateOfflineBanner() {
  const banner = document.querySelector("[data-offline]");
  if (!banner) return;
  banner.hidden = navigator.onLine;
}

function isActive(key, path) {
  const role = shellRole;

  if (path.startsWith("/tickets/") && path !== "/tickets/new") {
    if (role === "resident") return key === "tickets";
    if (role === "admin") return key === "all-tickets";
    if (role === "technician") return key === "jobs";
  }

  switch (key) {
    case "dashboard":
      return path === "/dashboard";
    case "tickets":
      return path === "/tickets";
    case "new-ticket":
      return path === "/tickets/new";
    case "jobs":
      return path === "/jobs";
    case "triage":
      return path === "/admin";
    case "all-tickets":
      return path === "/admin/tickets";
    case "users":
      return path === "/admin/users";
    case "reports":
      return path === "/admin/reports";
    case "notifications":
      return path === "/notifications";
    case "profile":
      return path === "/profile";
    default:
      return false;
  }
}

export function mountShell(profile) {
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = shellHtml(profile);
  shellProfileId = profile.id;
  shellRole = profile.role;
  bindShell();
  bindThemeToggle(document.querySelector("[data-theme-toggle]"));
  document.querySelectorAll("[data-theme-toggle]").forEach(bindThemeToggle);
  updateThemeToggles();
  updateOfflineBanner();
  updateUnreadBadges();
  renderNotifPanel();
}

export function ensureShell(profile) {
  const app = document.getElementById("app");
  if (!app) return;
  if (app.querySelector(".app-shell") && shellProfileId === profile.id && shellRole === profile.role) {
    return;
  }
  mountShell(profile);
}

export function destroyShell() {
  shellProfileId = null;
  shellRole = null;
  const app = document.getElementById("app");
  if (app) app.innerHTML = "";
}

export function updateShell(path, label) {
  if (!shellProfileId) return;
  document.querySelectorAll("[data-nav-key]").forEach((link) => {
    const key = link.dataset.navKey;
    if (isActive(key, path)) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  const crumb = document.querySelector("[data-crumb]");
  if (crumb && label) crumb.textContent = label;
  updateUnreadBadges();
}

export function updateNotificationUi() {
  updateUnreadBadges();
  renderNotifPanel();
}

export function refreshShell() {
  const profile = store.profile;
  if (!profile) return;
  ensureShell(profile);
  updateNotificationUi();
  const cardName = document.querySelector(".user-card__name");
  if (cardName) cardName.textContent = profile.full_name || "Account";
  document.querySelectorAll(".sidebar .avatar, .topbar .avatar").forEach((avatar) => {
    avatar.textContent = initials(profile.full_name || "Account");
  });
  document.querySelectorAll("[data-theme-toggle]").forEach(bindThemeToggle);
  updateThemeToggles();
}

export function closeNotificationPanel() {
  closeNotifPanel();
}
