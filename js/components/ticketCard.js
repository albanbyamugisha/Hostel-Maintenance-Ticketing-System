import {
  escapeHtml,
  statusBadge,
  severityBadge,
  categoryBadge,
  avatarHtml,
  relativeTime,
  locationLabel,
  isOverdue,
  daysOverdue,
  truncate,
} from "../utils.js";
import { icon } from "../icons.js";

/**
 * Ticket summary card used in every list. The whole card is clickable via the
 * stretched link on the title.
 */
export function ticketCard(ticket, { href, person = "auto", showCategory = false } = {}) {
  const url = href ?? `#/tickets/${encodeURIComponent(ticket.id)}`;
  const overdue = isOverdue(ticket);
  const emergency = ticket.severity === "emergency";

  const showResident = person === "resident" || (person === "auto" && ticket.resident);
  const showTechnician = person === "technician" || (person === "auto" && ticket.technician);
  const personData = showResident ? ticket.resident : showTechnician ? ticket.technician : null;

  const personLabel = showResident
    ? "Reported by"
    : showTechnician
      ? "Technician"
      : "";

  return `
    <article class="ticket-card${emergency ? " ticket-card--emergency" : ""}${
      overdue && !emergency ? " ticket-card--overdue" : ""
    }">
      <div class="ticket-card__top">
        <span class="ticket-card__id">${escapeHtml(ticket.tracking_id)}</span>
        <div class="ticket-card__badges">
          ${overdue ? `<span class="badge badge--overdue">${icon("clock")}${daysOverdue(
            ticket
          )}d overdue</span>` : ""}
          ${statusBadge(ticket.status)}
        </div>
      </div>

      <h3 class="ticket-card__title">
        <a href="${url}">${escapeHtml(truncate(ticket.title, 110))}</a>
      </h3>

      <div class="ticket-card__meta">
        <span>${icon("map-pin")}${escapeHtml(locationLabel(ticket))}</span>
        <span>${icon("clock")}${escapeHtml(relativeTime(ticket.created_at))}</span>
        ${
          ticket.target_date
            ? `<span>${icon("calendar")}Target ${escapeHtml(
                new Intl.DateTimeFormat(undefined, {
                  day: "2-digit",
                  month: "short",
                }).format(new Date(`${ticket.target_date}T00:00:00`))
              )}</span>`
            : ""
        }
      </div>

      <div class="ticket-card__foot">
        <span class="ticket-card__person">
          ${
            personData
              ? `${avatarHtml(personData.full_name, showResident ? "resident" : "technician", "avatar--sm")}
                 <span class="truncate">${escapeHtml(personLabel)} ${escapeHtml(personData.full_name)}</span>`
              : `${icon("user")} <span>Unassigned</span>`
          }
        </span>
        <div class="ticket-card__badges">
          ${severityBadge(ticket.severity)}
          ${showCategory ? categoryBadge(ticket.category) : ""}
        </div>
      </div>
    </article>
  `;
}

export function ticketList(tickets, options) {
  return `<div class="ticket-list">${tickets
    .map((ticket) => ticketCard(ticket, options))
    .join("")}</div>`;
}
