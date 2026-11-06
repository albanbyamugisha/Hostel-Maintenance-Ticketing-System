import { watchData } from "./localData.js";
import {
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  markTicketNotificationsRead,
} from "./api.js";
import { setStore, store } from "./store.js";

let channel = null;
let currentUserId = null;
let loadingPromise = null;

function applyList(notifications, unreadCount) {
  setStore({
    notifications,
    unreadCount:
      typeof unreadCount === "number"
        ? unreadCount
        : notifications.filter((item) => !item.is_read).length,
    notificationsLoaded: true,
    notificationsError: null,
  });
}

export async function loadNotifications({ silent = false } = {}) {
  if (!store.session?.user?.id) return [];
  if (loadingPromise && !silent) return loadingPromise;

  const userId = store.session.user.id;
  const run = (async () => {
    try {
      const [notifications, unreadCount] = await Promise.all([
        getNotifications({ limit: 60 }),
        getUnreadCount(userId),
      ]);
      if (store.session?.user?.id !== userId || currentUserId !== userId) return [];
      applyList(notifications, unreadCount);
      return notifications;
    } catch (error) {
      console.error("Could not load notifications", error);
      if (store.session?.user?.id === userId) {
        setStore({ notificationsLoaded: true, notificationsError: "Notifications could not load. Check your connection and try again." });
      }
      return store.notifications;
    } finally {
      loadingPromise = null;
    }
  })();

  if (!silent) loadingPromise = run;
  return run;
}

export function startNotifications(userId) {
  if (!userId) return;
  if (currentUserId === userId && channel) return;

  stopNotifications();
  currentUserId = userId;
  setStore({ notifications: [], unreadCount: 0, notificationsLoaded: false, notificationsError: null });
  void loadNotifications();

  channel = watchData(() => { void loadNotifications({ silent: true }); });
}

export function stopNotifications() {
  if (channel) channel();
  channel = null;
  currentUserId = null;
  loadingPromise = null;
}

export async function markRead(notificationId) {
  const target = store.notifications.find((item) => item.id === notificationId);
  if (!target || target.is_read) return;

  setStore({
    notifications: store.notifications.map((item) =>
      item.id === notificationId ? { ...item, is_read: true } : item
    ),
    unreadCount: Math.max(0, store.unreadCount - 1),
  });

  try {
    await markNotificationRead(notificationId);
  } catch (error) {
    console.error("Could not mark notification read", error);
    void loadNotifications({ silent: true });
  }
}

export async function markAllRead() {
  const userId = store.session?.user?.id;
  if (!userId) return;
  setStore({
    notifications: store.notifications.map((item) => ({ ...item, is_read: true })),
    unreadCount: 0,
  });
  try {
    await markAllNotificationsRead(userId);
  } catch (error) {
    console.error("Could not mark all notifications read", error);
    void loadNotifications({ silent: true });
  }
}

export async function markTicketRead(ticketId) {
  const userId = store.session?.user?.id;
  if (!userId || !ticketId) return;
  const affected = store.notifications.filter(
    (item) => item.ticket_id === ticketId && !item.is_read
  );
  if (!affected.length) return;

  setStore({
    notifications: store.notifications.map((item) =>
      item.ticket_id === ticketId ? { ...item, is_read: true } : item
    ),
    unreadCount: Math.max(0, store.unreadCount - affected.length),
  });

  try {
    await markTicketNotificationsRead(ticketId, userId);
  } catch (error) {
    console.error("Could not mark ticket notifications read", error);
  }
}
