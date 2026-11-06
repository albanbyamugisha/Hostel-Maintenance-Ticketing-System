import { escapeHtml, relativeTime, formatDateTime } from "../utils.js";
import { icon } from "../icons.js";

/**
 * One notification row, shared by the bell panel and the notifications page.
 */
export function notificationItem(notification, { compact = false } = {}) {
  const unread = !notification.is_read;
  const ticketLink = notification.ticket_id
    ? `#/tickets/${encodeURIComponent(notification.ticket_id)}`
    : "";

  return `
    <li class="notif-item${unread ? " notif-item--unread" : ""}" data-notif-id="${escapeHtml(
      notification.id
    )}">
      <span class="notif-item__dot${unread ? "" : " notif-item__dot--read"}" aria-hidden="true"></span>
      <div class="notif-item__body">
        ${
          ticketLink
            ? `<a class="notif-item__title" href="${ticketLink}" data-notif-open>${escapeHtml(
                notification.title
              )}</a>`
            : `<span class="notif-item__title">${escapeHtml(notification.title)}</span>`
        }
        <p class="notif-item__text">${escapeHtml(notification.body)}</p>
        <p class="notif-item__meta">
          <span title="${escapeHtml(formatDateTime(notification.created_at))}">${escapeHtml(
            relativeTime(notification.created_at)
          )}</span>
          ${unread ? '<span aria-hidden="true">·</span><span>Unread</span>' : ""}
        </p>
        ${
          compact
            ? ""
            : `<div class="notif-item__actions">
                ${
                  ticketLink
                    ? `<a class="link-btn" href="${ticketLink}" data-notif-open>${icon(
                        "external-link"
                      )} Open ticket</a>`
                    : ""
                }
                ${
                  unread
                    ? `<button type="button" class="link-btn" data-notif-read>${icon(
                        "check"
                      )} Mark read</button>`
                    : ""
                }
              </div>`
        }
      </div>
    </li>
  `;
}

export function notificationList(notifications, { compact = false } = {}) {
  if (!notifications.length) {
    return `
      <div class="empty" style="padding: var(--s-6) var(--s-4)">
        <span class="empty__icon">${icon("bell")}</span>
        <div class="stack-sm" style="align-items:center">
          <h3>No notifications yet</h3>
          <p>Updates about your tickets will appear here.</p>
        </div>
      </div>
    `;
  }
  return `<ul class="notif-list">${notifications
    .map((item) => notificationItem(item, { compact }))
    .join("")}</ul>`;
}
