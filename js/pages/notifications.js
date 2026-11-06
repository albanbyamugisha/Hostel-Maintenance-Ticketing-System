import { store, subscribe } from "../store.js";
import { loadNotifications } from "../notifications.js";
import { notificationList } from "../components/notificationItem.js";
import { pageHeader } from "../components/pageBits.js";
import { emptyState, errorState, loadingBlock } from "../ui.js";
import { icon } from "../icons.js";
import { pluralize } from "../utils.js";

export default async function notificationsPage({
  container,
  query,
  setTitle,
  onCleanup,
}) {
  const initialFilter = query.get("filter") === "unread" ? "unread" : "all";
  let filter = initialFilter;
  let disposed = false;

  setTitle("Notifications", "Notifications");

  const syncUrl = () => {
    const params = new URLSearchParams();
    if (filter === "unread") params.set("filter", "unread");
    const search = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#/notifications${
        search ? `?${search}` : ""
      }`
    );
  };

  container.innerHTML = `
    <div class="page page--narrow">
      ${pageHeader({
        eyebrow: "Account",
        title: "Notifications",
        subtitle:
          "Every update about your tickets, assignments and confirmations lives here.",
        actions: `<button type="button" class="btn btn--secondary" data-mark-all disabled>${icon(
          "check"
        )} Mark all read</button>`,
      })}

      <div class="toolbar">
        <div class="chip-row" role="group" aria-label="Filter notifications" data-filters>
          <button type="button" class="chip" data-filter="all" aria-pressed="${
            filter === "all"
          }">All <span class="chip__count" data-count-all>0</span></button>
          <button type="button" class="chip" data-filter="unread" aria-pressed="${
            filter === "unread"
          }">Unread <span class="chip__count" data-count-unread>0</span></button>
        </div>
        <span class="text-xs text-muted" data-summary aria-live="polite"></span>
      </div>

      <div class="card">
        <div class="card__body" data-list aria-live="polite">
          ${loadingBlock("Loading notifications…")}
        </div>
      </div>

      <p class="text-xs text-muted">
        Showing the latest 60 notifications. Opening a ticket marks its notifications as read.
      </p>
    </div>
  `;

  const render = () => {
    if (disposed) return;
    const list = container.querySelector("[data-list]");
    const summary = container.querySelector("[data-summary]");
    const allButton = container.querySelector("[data-filter='all']");
    const unreadButton = container.querySelector("[data-filter='unread']");
    const markAllButton = container.querySelector("[data-mark-all]");
    if (!list) return;

    const notifications = store.notifications ?? [];
    const unread = notifications.filter((item) => !item.is_read);
    const visible = filter === "unread" ? unread : notifications;

    const countAll = container.querySelector("[data-count-all]");
    const countUnread = container.querySelector("[data-count-unread]");
    if (countAll) countAll.textContent = String(notifications.length);
    if (countUnread) countUnread.textContent = String(unread.length);

    allButton?.setAttribute("aria-pressed", String(filter === "all"));
    unreadButton?.setAttribute("aria-pressed", String(filter === "unread"));

    if (markAllButton) {
      markAllButton.disabled = unread.length === 0;
    }

    if (summary) {
      summary.textContent = `Showing ${pluralize(visible.length, "notification")}${
        filter === "unread" ? " · unread only" : ""
      }`;
    }

    if (!store.notificationsLoaded && !notifications.length) {
      list.innerHTML = loadingBlock("Loading notifications…");
      return;
    }

    if (store.notificationsError && !notifications.length) {
      list.innerHTML = errorState({
        title: "Notifications unavailable",
        text: store.notificationsError,
        actionHtml: '<button type="button" class="btn btn--secondary" data-retry-notifications>Try again</button>',
      });
      return;
    }

    if (!visible.length) {
      list.innerHTML =
        filter === "unread"
          ? emptyState({
              iconName: "check-circle",
              title: "You're all caught up",
              text: "Every notification has been read. New updates will appear here automatically.",
              actionHtml:
                '<button type="button" class="btn btn--secondary" data-show-all>Show all notifications</button>',
            })
          : emptyState({
              iconName: "bell",
              title: "No notifications yet",
              text: "Updates about your tickets will appear here as soon as something changes.",
              actionHtml:
                '<a class="btn btn--secondary" href="#/tickets/new">Report an issue</a>',
            });
      return;
    }

    list.innerHTML = notificationList(visible);
  };

  const handleClick = (event) => {
    if (event.target.closest("[data-retry-notifications]")) {
      void loadNotifications();
      return;
    }
    const filterButton = event.target.closest("[data-filter]");
    if (filterButton) {
      filter = filterButton.dataset.filter === "unread" ? "unread" : "all";
      syncUrl();
      render();
      return;
    }

    if (event.target.closest("[data-show-all]")) {
      filter = "all";
      syncUrl();
      render();
    }
  };

  container.addEventListener("click", handleClick);

  const unsubscribe = subscribe((state, changed) => {
    if (
      "notifications" in changed ||
      "notificationsLoaded" in changed ||
      "notificationsError" in changed ||
      "unreadCount" in changed
    ) {
      render();
    }
  });

  render();
  syncUrl();

  if (!store.notificationsLoaded) {
    void loadNotifications();
  }

  onCleanup(() => {
    disposed = true;
    container.removeEventListener("click", handleClick);
    unsubscribe();
  });
}
