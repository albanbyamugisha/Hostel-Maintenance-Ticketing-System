import {
  escapeHtml,
  formatDateTime,
  statusLabel,
  EVENT_META,
  avatarHtml,
  ratingStars,
} from "../utils.js";
import { icon } from "../icons.js";

function eventIcon(event) {
  return EVENT_META[event.event_type]?.icon ?? "activity";
}

function eventAction(event) {
  if (event.event_type === "status_change" && event.to_status) {
    return `moved the ticket to ${statusLabel(event.to_status)}`;
  }
  if (event.event_type === "reopened") return "reopened the ticket";
  return EVENT_META[event.event_type]?.label ?? "updated the ticket";
}

export function ticketTimeline(events, { photoUrls = {}, showEmpty = true } = {}) {
  if (!events.length) {
    if (!showEmpty) return "";
    return `
      <div class="empty" style="padding: var(--s-6) var(--s-4)">
        <span class="empty__icon">${icon("activity")}</span>
        <div class="stack-sm" style="align-items:center">
          <h3>No activity yet</h3>
          <p>Status changes, notes and work logs will appear here.</p>
        </div>
      </div>
    `;
  }

  return `
    <ol class="timeline">
      ${events
        .map((event) => {
          const actor = event.actor;
          const actorName = actor?.full_name || "HostelCare";
          const paths = Array.isArray(event.photo_paths) ? event.photo_paths : [];
          const photos = paths
            .map((path) => photoUrls[path])
            .filter(Boolean)
            .map(
              (url, index) => `
                <button type="button" class="photo-thumb" data-lightbox-url="${escapeHtml(
                  url
                )}" aria-label="Open photo ${index + 1}">
                  <img src="${escapeHtml(url)}" alt="Work photo ${index + 1}" loading="lazy" />
                </button>`
            )
            .join("");

          return `
            <li class="timeline__item" data-kind="${escapeHtml(event.event_type)}">
              <span class="timeline__icon">${icon(eventIcon(event))}</span>
              <div class="timeline__body">
                <div class="timeline__head">
                  ${
                    actor
                      ? `${avatarHtml(actor.full_name, actor.role, "avatar--sm")}`
                      : ""
                  }
                  <span class="timeline__actor">${escapeHtml(actorName)}</span>
                  <span class="timeline__action">${escapeHtml(eventAction(event))}</span>
                  <time class="timeline__time" datetime="${escapeHtml(event.created_at)}"
                    title="${escapeHtml(formatDateTime(event.created_at))}">
                    ${escapeHtml(formatDateTime(event.created_at))}
                  </time>
                </div>

                ${
                  event.message
                    ? `<p class="timeline__message">${escapeHtml(event.message)}</p>`
                    : ""
                }

                ${
                  event.event_type === "rating" && event.message?.match(/Rated (\d)\/5/)
                    ? `<div class="timeline__meta">${ratingStars(
                        Number(event.message.match(/Rated (\d)\/5/)[1])
                      )}</div>`
                    : ""
                }

                ${
                  event.parts_used
                    ? `<p class="timeline__meta">${icon("wrench")} <span><strong>Parts:</strong> ${escapeHtml(
                        event.parts_used
                      )}</span></p>`
                    : ""
                }

                ${photos ? `<div class="timeline__photos">${photos}</div>` : ""}
              </div>
            </li>
          `;
        })
        .join("")}
    </ol>
  `;
}
