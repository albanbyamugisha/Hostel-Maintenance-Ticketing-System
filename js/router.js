import { store, subscribe, homeForRole } from "./store.js";
import { ensureShell, destroyShell, updateShell } from "./appShell.js";
import { errorState, loadingBlock } from "./ui.js";
import { escapeHtml } from "./utils.js";

/**
 * Hash router. Each route lazy-loads a page module that exports a default
 * function receiving a context object and optionally returning a cleanup
 * function.
 */

const ROUTES = [
  {
    path: "/",
    title: "HostelCare",
    resolve: () => (store.session && store.profile ? homeForRole(store.profile.role) : "/login"),
  },
  {
    path: "/login",
    title: "Sign in",
    load: () => import("./pages/login.js"),
    guestOnly: true,
  },
  {
    path: "/register",
    title: "Create account",
    load: () => import("./pages/register.js"),
    guestOnly: true,
  },
  {
    path: "/forgot-password",
    title: "Reset password",
    load: () => import("./pages/forgotPassword.js"),
    guestOnly: true,
  },
  {
    path: "/reset-password",
    title: "Choose a new password",
    load: () => import("./pages/resetPassword.js"),
    authOptional: true,
  },
  {
    path: "/dashboard",
    title: "Dashboard",
    load: () => import("./pages/residentDashboard.js"),
    roles: ["resident"],
  },
  {
    path: "/tickets/new",
    title: "Report an issue",
    load: () => import("./pages/newTicket.js"),
    roles: ["resident"],
  },
  {
    path: "/tickets",
    title: "My tickets",
    load: () => import("./pages/residentTickets.js"),
    roles: ["resident"],
  },
  {
    path: "/tickets/:id",
    title: "Ticket",
    load: () => import("./pages/ticketDetail.js"),
    roles: ["resident", "technician", "admin"],
  },
  {
    path: "/jobs",
    title: "My jobs",
    load: () => import("./pages/technicianJobs.js"),
    roles: ["technician"],
  },
  {
    path: "/admin",
    title: "Triage desk",
    load: () => import("./pages/adminTriage.js"),
    roles: ["admin"],
  },
  {
    path: "/admin/tickets",
    title: "All tickets",
    load: () => import("./pages/adminTickets.js"),
    roles: ["admin"],
  },
  {
    path: "/admin/users",
    title: "People",
    load: () => import("./pages/adminUsers.js"),
    roles: ["admin"],
  },
  {
    path: "/admin/reports",
    title: "Reports",
    load: () => import("./pages/adminReports.js"),
    roles: ["admin"],
  },
  {
    path: "/notifications",
    title: "Notifications",
    load: () => import("./pages/notifications.js"),
  },
  {
    path: "/profile",
    title: "Profile",
    load: () => import("./pages/profile.js"),
  },
  {
    path: "/setup",
    resolve: () => store.session ? homeForRole(store.profile?.role) : "/login",
  },
  {
    path: "/local-data",
    title: "Local data",
    load: () => import("./pages/setup.js"),
    public: true,
  },
  {
    path: "/404",
    title: "Page not found",
    load: () => import("./pages/notFound.js"),
    public: true,
  },
];

const compiled = ROUTES.map((route) => {
  const keys = [];
  const pattern = route.path
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
      keys.push(key);
      return "([^/]+)";
    });
  return {
    ...route,
    regex: new RegExp(`^${pattern}/?$`),
    keys,
  };
});

let cleanup = null;
let renderToken = 0;
let initialised = false;
let lastAuthKey = "";

function parseHash() {
  let raw = window.location.hash.replace(/^#/, "");
  if (!raw) raw = "/";
  if (!raw.startsWith("/")) raw = `/${raw}`;

  const questionIndex = raw.indexOf("?");
  const path = questionIndex === -1 ? raw : raw.slice(0, questionIndex);
  const search = questionIndex === -1 ? "" : raw.slice(questionIndex + 1);

  return {
    path: path || "/",
    query: new URLSearchParams(search),
  };
}

function currentLocationString() {
  const { path, query } = parseHash();
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}

function matchRoute(path) {
  for (const route of compiled) {
    const match = path.match(route.regex);
    if (!match) continue;
    const params = {};
    route.keys.forEach((key, index) => {
      try { params[key] = decodeURIComponent(match[index + 1]); }
      catch { params[key] = ""; }
    });
    return { route, params };
  }
  return { route: null, params: {} };
}

export function navigate(path, { replace = false } = {}) {
  const target = path.startsWith("/") ? path : `/${path}`;
  const hash = `#${target}`;
  if (window.location.hash === hash) {
    void renderRoute();
    return;
  }
  if (replace) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
    void renderRoute();
  } else {
    window.location.hash = hash;
  }
}

export function refreshRoute() {
  return renderRoute();
}

function setDocumentTitle(title) {
  document.title = title ? `${title} · HostelCare` : "HostelCare";
}

function authKey(state) {
  return [
    state.ready ? "1" : "0",
    state.session?.user?.id ?? "",
    state.profile?.role ?? "",
    state.profile?.id ?? "",
    state.recoveryMode ? "recovery" : "",
  ].join("|");
}

async function runCleanup() {
  if (typeof cleanup !== "function") {
    cleanup = null;
    return;
  }
  try {
    await cleanup();
  } catch (error) {
    console.error("Page cleanup failed", error);
  }
  cleanup = null;
}

function renderBoot() {
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = `<div class="auth-main">${loadingBlock("Loading HostelCare…")}</div>`;
}

function renderFatal(container, message) {
  container.innerHTML = `
    <div class="page">
      ${errorState({
        title: "We could not open this page",
        text: message || "Please refresh and try again.",
        actionHtml: '<button type="button" class="btn btn--primary" data-retry>Try again</button>',
      })}
    </div>
  `;
  container.querySelector("[data-retry]")?.addEventListener("click", () => renderRoute());
}

function renderForbidden(role) {
  destroyShell();
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="auth-main">
      <div class="auth-card card">
        <div class="card__body stack">
          <span class="empty__icon">${escapeHtml("")}</span>
          <div>
            <p class="eyebrow">Access restricted</p>
            <h1 class="page-title">That area is not for your role</h1>
            <p class="page-sub">You are signed in as a ${escapeHtml(
              role || "user"
            )}. Use the navigation to reach the pages available to you.</p>
          </div>
          <a class="btn btn--primary" href="#${homeForRole(role)}">Go to my home page</a>
        </div>
      </div>
    </div>
  `;
  setDocumentTitle("Access restricted");
}

async function renderRoute() {
  const token = ++renderToken;
  const { path, query } = parseHash();
  const app = document.getElementById("app");
  if (!app) return;

  if (!store.ready) {
    renderBoot();
    return;
  }

  const { route, params } = matchRoute(path);
  if (!route) {
    navigate("/404", { replace: true });
    return;
  }

  if (route.resolve) {
    navigate(route.resolve(), { replace: true });
    return;
  }

  const { session, profile } = store;

  if (route.guestOnly && session) {
    navigate(homeForRole(profile?.role), { replace: true });
    return;
  }

  if (route.authOptional) {
    // Password recovery links produce a temporary session; other visitors can
    // still open the page to see an "expired link" explanation.
    if (session && !store.recoveryMode && route.path === "/reset-password") {
      // Allow it anyway: a signed-in user may want to change their password.
    }
  }

  const requiresAuth = !route.public && !route.guestOnly && !route.authOptional;
  if (requiresAuth && !session) {
    const next = encodeURIComponent(currentLocationString());
    navigate(`/login?next=${next}`, { replace: true });
    return;
  }

  if (route.roles && session) {
    if (!profile) {
      renderBoot();
      return;
    }
    if (!route.roles.includes(profile.role)) {
      renderForbidden(profile.role);
      return;
    }
  }

  // Load the module before swapping containers so a network failure does not
  // leave an empty screen.
  let module;
  try {
    module = await route.load();
  } catch (error) {
    console.error(error);
    renderFatal(app, "The page could not be loaded. Check your connection and try again.");
    return;
  }
  if (token !== renderToken) return;

  await runCleanup();
  if (token !== renderToken) return;

  const useShell = requiresAuth;
  let container;

  if (useShell) {
    ensureShell(profile);
    container = document.getElementById("view");
    updateShell(path, route.title);
  } else {
    destroyShell();
    container = document.getElementById("app");
  }

  container.innerHTML = "";
  setDocumentTitle(route.title);

  const context = {
    container,
    params,
    query,
    path,
    session,
    profile,
    route,
    navigate,
    refresh: renderRoute,
    setTitle(title, crumb) {
      setDocumentTitle(title);
      if (useShell) updateShell(path, crumb || title);
    },
    onCleanup(fn) {
      if (token !== renderToken) {
        void Promise.resolve(fn()).catch(console.error);
      } else {
        cleanup = fn;
      }
    },
  };

  try {
    const result = await module.default(context);
    if (token !== renderToken) {
      if (typeof result === "function") await result();
      return;
    }
    if (typeof result === "function") cleanup = result;
  } catch (error) {
    console.error("Page render failed", error);
    renderFatal(
      container,
      error?.message || "Something went wrong while opening this page. Please try again."
    );
    return;
  }

  window.scrollTo(0, 0);
  container.focus?.({ preventScroll: true });
}

export function initRouter() {
  if (initialised) return;
  initialised = true;

  lastAuthKey = authKey(store);
  window.addEventListener("hashchange", () => {
    void renderRoute();
  });

  subscribe((state) => {
    const next = authKey(state);
    if (next === lastAuthKey) return;
    lastAuthKey = next;
    void renderRoute();
  });

  void renderRoute();
}

export function currentPath() {
  return parseHash().path;
}
