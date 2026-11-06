import { getAllTicketsForResident } from "../api.js";
import { pageHeader, kpiGrid } from "../components/pageBits.js";
import { ticketList } from "../components/ticketCard.js";
import { emptyState, errorState, skeletonKpis, skeletonList } from "../ui.js";
import { icon } from "../icons.js";
import { escapeHtml, relativeTime, pluralize } from "../utils.js";

const OPEN_STATUSES = ["reported", "reopened", "assigned", "in_progress", "on_hold"];

export default async function residentDashboardPage({ container, profile, refresh }) {
  const firstName = String(profile.full_name || "there").split(/\s+/)[0];

  container.innerHTML = `
    <div class="page">
      ${pageHeader({
        eyebrow: "Resident home",
        title: `Hello, ${firstName}`,
        subtitle: "Track your repair requests and tell us when something needs attention.",
        actions: `<a class="btn btn--primary" href="#/tickets/new">${icon(
          "plus"
        )} Report an issue</a>`,
      })}
      ${skeletonKpis(4)}
      ${skeletonList(2)}
    </div>
  `;

  let tickets;
  try {
    tickets = await getAllTicketsForResident(profile.id, 500);
  } catch (error) {
    console.error(error);
    container.innerHTML = `
      <div class="page">
        ${pageHeader({
          eyebrow: "Resident home",
          title: `Hello, ${firstName}`,
          subtitle: "Track your repair requests and tell us when something needs attention.",
        })}
        ${errorState({
          title: "We could not load your tickets",
          text: "Check your connection and try again.",
          actionHtml: '<button type="button" class="btn btn--primary" data-retry>Try again</button>',
        })}
      </div>
    `;
    container.querySelector("[data-retry]")?.addEventListener("click", () => refresh());
    return;
  }

  const open = tickets.filter((ticket) => OPEN_STATUSES.includes(ticket.status));
  const awaiting = tickets.filter((ticket) => ticket.status === "resolved");
  const closed = tickets.filter((ticket) => ticket.status === "closed");
  const emergency = open.find((ticket) => ticket.severity === "emergency");
  const recent = [...tickets]
    .sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")))
    .slice(0, 5);

  const nextAction = awaiting[0];

  container.innerHTML = `
    <div class="page">
      ${pageHeader({
        eyebrow: "Resident home",
        title: `Hello, ${firstName}`,
        subtitle: "Track your repair requests and tell us when something needs attention.",
        actions: `<a class="btn btn--primary" href="#/tickets/new">${icon(
          "plus"
        )} Report an issue</a>`,
      })}

      ${kpiGrid([
        {
          label: "Open requests",
          value: open.length,
          meta: open.length ? "Being triaged or repaired" : "Nothing outstanding",
          iconName: "activity",
        },
        {
          label: "Awaiting you",
          value: awaiting.length,
          meta: awaiting.length ? "Confirm the completed work" : "No confirmations due",
          iconName: "check-circle",
          tone: awaiting.length ? "warning" : "",
        },
        {
          label: "Closed",
          value: closed.length,
          meta: "Confirmed and archived",
          iconName: "lock",
        },
        {
          label: "All requests",
          value: tickets.length,
          meta: tickets.length ? `Last update ${relativeTime(tickets[0]?.updated_at)}` : "None yet",
          iconName: "ticket",
        },
      ])}

      ${
        emergency
          ? `<div class="alert alert--danger">
              ${icon("siren")}
              <div><strong>Emergency still open:</strong> ${escapeHtml(emergency.title)}.
              <a href="#/tickets/${encodeURIComponent(emergency.id)}">View ticket</a>.</div>
            </div>`
          : ""
      }

      ${
        nextAction
          ? `<div class="callout">
              <div>
                <h3>${escapeHtml(nextAction.title)}</h3>
                <p>The technician marked this repair complete. Confirm it, or tell us what still needs fixing.</p>
              </div>
              <a class="btn btn--primary" href="#/tickets/${encodeURIComponent(
                nextAction.id
              )}">${icon("check-circle")} Review & confirm</a>
            </div>`
          : ""
      }

      <div class="dashboard-grid">
        <div class="dashboard-main">
          <section aria-labelledby="recent-heading">
            <div class="section-head">
              <h2 id="recent-heading">Recent requests</h2>
              <a class="text-sm" href="#/tickets">View all tickets ${icon("arrow-right")}</a>
            </div>
            ${
              recent.length
                ? ticketList(recent, { person: "technician" })
                : emptyState({
                    iconName: "wrench",
                    title: "No requests yet",
                    text: "When something in your room or a shared area needs fixing, report it with a photo and a short description.",
                    actionHtml:
                      '<a class="btn btn--primary" href="#/tickets/new">Report your first issue</a>',
                  })
            }
          </section>
        </div>

        <aside class="dashboard-side">
          <section class="card">
            <div class="card__head"><h2>Quick actions</h2></div>
            <div class="card__body">
              <div class="quick-actions">
                <a class="quick-action" href="#/tickets/new">${icon("plus")} Report an issue</a>
                <a class="quick-action" href="#/tickets">${icon("list")} All my tickets</a>
                <a class="quick-action" href="#/notifications">${icon("bell")} Notifications</a>
                <a class="quick-action" href="#/profile">${icon("user")} My profile</a>
              </div>
            </div>
          </section>

          <section class="card">
            <div class="card__head"><h2>How repairs work</h2></div>
            <div class="card__body">
              <ol class="stack-sm" style="padding-left: 1.1rem">
                <li><strong>Report</strong><br /><span class="text-sm text-muted">Add the location, severity and a photo.</span></li>
                <li><strong>We assign</strong><br /><span class="text-sm text-muted">The desk allocates a technician and a target date.</span></li>
                <li><strong>You confirm</strong><br /><span class="text-sm text-muted">Close the ticket once the repair is right, or reopen it with a reason.</span></li>
              </ol>
            </div>
          </section>

          <section class="card">
            <div class="card__body stack-sm">
              <h2 class="text-sm">Need urgent help?</h2>
              <p class="text-sm text-muted">
                For fire, flooding, live wires or a lockout, report it as an
                <strong>Emergency</strong> and call the warden on duty as well.
              </p>
              <p class="text-xs text-muted">${pluralize(
                tickets.length,
                "request",
                "requests"
              )} on this account.</p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  `;
}
