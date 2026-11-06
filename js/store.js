/**
 * Minimal observable application store.
 *
 * The store holds the session, the signed-in profile, notification state and
 * a few UI flags. Pages never mutate it directly; they call the setters below
 * so every subscriber (shell, router, notifications) stays in sync.
 */

const listeners = new Set();

const state = {
  ready: false,
  session: null,
  profile: null,
  notifications: [],
  unreadCount: 0,
  notificationsLoaded: false,
  notificationsError: null,
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  recoveryMode: false,
};

export const store = new Proxy(state, {
  set() {
    throw new Error("Use setStore() to update application state.");
  },
});

export function getState() {
  return { ...state };
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(changed) {
  const snapshot = { ...state };
  for (const listener of listeners) {
    try {
      listener(snapshot, changed);
    } catch (error) {
      console.error("Store subscriber failed", error);
    }
  }
}

export function setStore(patch) {
  const changed = {};
  let dirty = false;

  for (const [key, value] of Object.entries(patch)) {
    if (!(key in state)) continue;
    if (Object.is(state[key], value)) continue;
    state[key] = value;
    changed[key] = value;
    dirty = true;
  }

  if (dirty) notify(changed);
  return changed;
}

export function resetStore() {
  setStore({
    ready: true,
    session: null,
    profile: null,
    notifications: [],
    unreadCount: 0,
    notificationsLoaded: false,
    notificationsError: null,
    recoveryMode: false,
  });
}

export function isAdmin(profile = state.profile) {
  return profile?.role === "admin";
}

export function isTechnician(profile = state.profile) {
  return profile?.role === "technician";
}

export function isResident(profile = state.profile) {
  return profile?.role === "resident";
}

export function homeForRole(role) {
  switch (role) {
    case "admin":
      return "/admin";
    case "technician":
      return "/jobs";
    default:
      return "/dashboard";
  }
}

export function displayName(profile = state.profile) {
  return profile?.full_name || "there";
}
