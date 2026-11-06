import { getTickets, getTechnicians, subscribeToTickets } from "../api.js";
import { kpiGrid, pageHeader } from "../components/pageBits.js";
import { openAssignModal } from "../components/assignModal.js";
import {
  emptyState,
  errorState,
  skeletonKpis,
  skeletonList,
} from "../ui.js";
import { toast } from "../toast.js";
import { icon } from "../icons.js";
import {
  STATUS_META,
  SEVERITY_RANK,
  avatarHtml,
  daysOverdue,
  escapeHtml,
  formatDate,
  isOverdue,
  locationLabel,
  pluralize,
  relativeTime,
  severityBadge,
  sortTicketsByPriority,
  specialtyLabel,
  statusBadge,
  truncate,
} from "../utils.js";

const ACTIVE_STATUSES = ["reported", "reopened", "assigned", "in_progress", "on_hold"];
const UNASSIGNED_STATUSES = ["reported", "reopened"];
const IN_WORK_STATUSES = ["assigned", "in_progress", "on_hold"];
const SECTION_LIMIT = 6;

function isUnassigned(ticket) {
  return UNASSIGNED_STATUSES.includes(ticket.status) && !ticket.assigned_to;
}

function isEmergency(ticket) {
  return ticket.severity === "emergency" && !["resolved", "closed"].includes(ticket.status);
}

function sortUnassigned(tickets) {
  return [...tickets].sort((a, b) => {
    const severity =
      (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
    return severity || String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
  });
}

function sectionHeader(title, count, href, linkLabel = "View all") {
  return `
    <div class="section-head">
      <h2>${escapeHtml(title)} <span class="text-xs text-muted">${count}</span></h2>
      ${href ? `<a class="link-btn text-sm" href="${href}">${escapeHtml(linkLabel)} ${icon("arrow-right")}</a>` : ""}
    </div>
  `;
}

function triageRow(ticket, { showTechnician = false, assignable = false } = {}) {
  const overdue = isOverdue(ticket);
  const technician = ticket.technician;

  return `
    <tr>
      <td class="cell-title" data-label="">
        <a href="#/tickets/${encodeURIComponent(ticket.id)}">${escapeHtml(
          ticket.tracking_id
        )}</a>
        <span class="cell-sub">${escapeHtml(truncate(ticket.title, 90))}</span>
        <span class="cell-sub">${escapeHtml(locationLabel(ticket))}</span>
      </td>
      <td data-label="Severity">${severityBadge(ticket.severity)}</td>
      <td data-label="Status">${statusBadge(ticket.status)}</td>
      <td data-label="Age">
        <span title="${escapeHtml(formatDate(ticket.created_at))}">${escapeHtml(
          relativeTime(ticket.created_at)
        )}</span>
        ${
          overdue
            ? `<span class="cell-sub overdue-text">${daysOverdue(ticket)}d overdue</span>`
            : ""
        }
      </td>
      <td data-label="Technician">
        ${
          technician
            ? `<span class="row" style="gap:0.35rem">${avatarHtml(
                technician.full_name,
                "technician",
                "avatar--sm"
              )}<span class="truncate">${escapeHtml(technician.full_name)}</span></span>`
            : `<span class="text-muted">Unassigned</span>`
        }
      </td>
      <td class="cell-actions" data-label="">
        ${
          assignable
            ? `<button type="button" class="btn btn--primary btn--sm" data-assign="${escapeHtml(
                ticket.id
              )}">${icon("user-check")} Assign</button>`
            : `<a class="btn btn--secondary btn--sm" href="#/tickets/${encodeURIComponent(
                ticket.id
              )}">${icon("external-link")} Open</a>`
        }
      </td>
    </tr>
  `;
}

function ticketTable(tickets, options) {
  if (!tickets.length) return "";
  return `
    <div class="table-wrap">
      <table class="table table--stack">
        <thead>
          <tr>
            <th scope="col">Ticket</th>
            <th scope="col">Severity</th>
            <th scope="col">Status</th>
            <th scope="col">Age</th>
            <th scope="col">Technician</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          ${tickets.map((ticket) => triageRow(ticket, options)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function workloadPanel(technicians) {
  const active = [...technicians].sort(
    (a, b) => (b.open_tickets ?? 0) - (a.open_tickets ?? 0)
  );
  const max = Math.max(1, ...active.map((technician) => technician.open_tickets ?? 0));

  return `
    <section class="card">
      <div class="card__head">
        <h2>Technician workload</h2>
        <a class="link-btn" href="#/admin/users">Manage</a>
      </div>
      <div class="card__body stack-sm">
        ${
          active.length
            ? active
                .map(
                  (technician) => `
                    <div class="stack-sm" style="gap:0.25rem">
                      <div class="row-between">
                        <span class="row text-sm" style="gap:0.4rem">
                          ${avatarHtml(technician.full_name, "technician", "avatar--sm")}
                          <span class="truncate">${escapeHtml(technician.full_name)}</span>
                        </span>
                        <strong class="text-sm">${technician.open_tickets ?? 0} open</strong>
                      </div>
                      <div class="progress" role="img" aria-label="${escapeHtml(
                        `${technician.full_name} has ${technician.open_tickets ?? 0} open jobs`
                      )}">
                        <div class="progress__bar" style="width: ${Math.round(
                          ((technician.open_tickets ?? 0) / max) * 100
                        )}%"></div>
                      </div>
                      <span class="text-xs text-muted">${escapeHtml(
                        specialtyLabel(technician.specialty)
                      )}</span>
                    </div>
                  `
                )
                .join("")
            : `<p class="text-sm text-muted">No active technicians yet. Add one under
                 <a href="#/admin/users">People</a> so tickets can be assigned.</p>`
        }
      </div>
    </section>
  `;
}

function statusOverview(tickets) {
  return `
    <section class="card">
      <div class="card__head"><h2>Tickets by status</h2></div>
      <div class="card__body">
        ${Object.entries(STATUS_META)
          .map(
            ([status, meta]) => `
              <a class="row-between" style="padding-block:0.35rem;color:inherit;text-decoration:none"
                href="#/admin/tickets?status=${status}">
                <span class="row text-sm">${statusBadge(status)}</span>
                <strong class="text-sm">${tickets.filter((ticket) => ticket.status === status).length}</strong>
              </a>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function quickLinks() {
  const links = [
    { href: "#/admin/tickets?unassigned=1", label: "Unassigned queue", iconName: "inbox" },
    { href: "#/admin/tickets?severity=emergency", label: "Emergency tickets", iconName: "siren" },
    { href: "#/admin/tickets?overdue=1", label: "Overdue work", iconName: "clock" },
    { href: "#/admin/reports", label: "Reports & trends", iconName: "bar-chart" },
    { href: "#/admin/users", label: "People & roles", iconName: "users" },
  ];
  return `
    <section class="card">
      <div class="card__head"><h2>Shortcuts</h2></div>
      <div class="card__body">
        <div class="quick-actions">
          ${links
            .map(
              (link) =>
                `<a class="quick-action" href="${link.href}">${icon(
                  link.iconName
                )} ${escapeHtml(link.label)}</a>`
            )
            .join("")}
        </div>
      </div>
    </section>
  `;
}

export default async function adminTriagePage({
  container,
  refresh,
  setTitle,
  onCleanup,
}) {
  let tickets = [];
  let technicians = [];
  let unsubscribe = null;
  let reloadTimer = null;
  let disposed = false;
  let loadToken = 0;

  setTitle("Triage desk", "Triage desk");
  container.innerHTML = `
    <div class="page">
      ${pageHeader({
        eyebrow: "Admin · Maintenance desk",
        title: "Triage desk",
        subtitle: "Everything that needs a decision, a technician or a nudge — in one place.",
        actions: `<button type="button" class="btn btn--secondary" data-refresh>${icon(
          "refresh"
        )} Refresh</button>
          <a class="btn btn--primary" href="#/admin/tickets">${icon("list")} All tickets</a>`,
      })}
      ${skeletonKpis(4)}
      ${skeletonList(3)}
    </div>
  `;

  const render = () => {
    const active = tickets.filter((ticket) => ACTIVE_STATUSES.includes(ticket.status));
    const unassigned = sortUnassigned(tickets.filter(isUnassigned));
    const emergencies = active.filter(isEmergency);
    const overdue = active.filter(isOverdue);
    const inWork = sortTicketsByPriority(
      tickets.filter((ticket) => IN_WORK_STATUSES.includes(ticket.status)),
      { overdueFirst: true }
    );
    const awaiting = tickets
      .filter((ticket) => ticket.status === "resolved")
      .sort((a, b) => String(a.resolved_at ?? a.updated_at ?? "").localeCompare(String(b.resolved_at ?? b.updated_at ?? "")));
    const closed = tickets
      .filter((ticket) => ticket.status === "closed")
      .sort((a, b) => String(b.closed_at ?? b.updated_at ?? "").localeCompare(String(a.closed_at ?? a.updated_at ?? "")))
      .slice(0, SECTION_LIMIT);

    container.innerHTML = `
      <div class="page">
        ${pageHeader({
          eyebrow: "Admin · Maintenance desk",
          title: "Triage desk",
          subtitle: "Everything that needs a decision, a technician or a nudge — in one place.",
          actions: `<button type="button" class="btn btn--secondary" data-refresh>${icon(
            "refresh"
          )} Refresh</button>
            <a class="btn btn--primary" href="#/admin/tickets">${icon("list")} All tickets</a>`,
        })}

        ${kpiGrid([
          {
            label: "Needs assignment",
            value: unassigned.length,
            meta: unassigned.length ? "Reported and waiting for a technician" : "Queue is clear",
            iconName: "inbox",
            tone: unassigned.length ? "warning" : "",
          },
          {
            label: "Emergencies",
            value: emergencies.length,
            meta: emergencies.length ? "Immediate safety risk" : "No active emergencies",
            iconName: "siren",
            tone: emergencies.length ? "danger" : "",
          },
          {
            label: "Overdue",
            value: overdue.length,
            meta: overdue.length ? "Past the target date" : "All active work on schedule",
            iconName: "clock",
            tone: overdue.length ? "danger" : "",
          },
          {
            label: "Active work",
            value: active.length,
            meta: `${pluralize(inWork.length, "job")} with technicians`,
            iconName: "wrench",
          },
        ])}

        ${
          emergencies.length
            ? `<div class="alert alert--danger">
                ${icon("siren")}
                <div>
                  <strong>${pluralize(emergencies.length, "active emergency", "active emergencies")}:</strong>
                  ${emergencies
                    .slice(0, 3)
                    .map(
                      (ticket) =>
                        `<a href="#/tickets/${encodeURIComponent(ticket.id)}">${escapeHtml(
                          ticket.tracking_id
                        )}</a>`
                    )
                    .join(", ")}
                  ${emergencies.length > 3 ? `and ${emergencies.length - 3} more` : ""}.
                  Assign a technician immediately and call the warden on duty.
                </div>
              </div>`
            : ""
        }

        <div class="dashboard-grid">
          <div class="dashboard-main">
            <section aria-labelledby="unassigned-heading">
              ${sectionHeader(
                "Needs assignment",
                unassigned.length,
                "#/admin/tickets?unassigned=1"
              )}
              ${
                unassigned.length
                  ? ticketTable(unassigned.slice(0, SECTION_LIMIT), { assignable: true })
                  : emptyState({
                      iconName: "check-circle",
                      title: "Nothing waiting",
                      text: "Every reported ticket has a technician. New reports will appear here automatically.",
                    })
              }
              ${
                unassigned.length > SECTION_LIMIT
                  ? `<p class="text-xs text-muted mt-2">Showing ${SECTION_LIMIT} of ${unassigned.length}. <a href="#/admin/tickets?unassigned=1">Open the full queue</a>.</p>`
                  : ""
              }
            </section>

            <section aria-labelledby="active-heading">
              ${sectionHeader("Active work", inWork.length, "#/admin/tickets?active=1")}
              ${
                inWork.length
                  ? ticketTable(inWork.slice(0, SECTION_LIMIT), { showTechnician: true })
                  : emptyState({
                      iconName: "wrench",
                      title: "No active repairs",
                      text: "Assigned, in-progress and on-hold jobs will appear here.",
                    })
              }
            </section>

            <section aria-labelledby="awaiting-heading">
              ${sectionHeader(
                "Awaiting resident confirmation",
                awaiting.length,
                "#/admin/tickets?status=resolved"
              )}
              ${
                awaiting.length
                  ? ticketTable(awaiting.slice(0, SECTION_LIMIT), { showTechnician: true })
                  : emptyState({
                      iconName: "clock",
                      title: "No confirmations due",
                      text: "When a technician resolves a repair it waits here for the resident to confirm.",
                    })
              }
            </section>

            ${
              closed.length
                ? `<section aria-labelledby="closed-heading">
                    ${sectionHeader(
                      "Recently closed",
                      closed.length,
                      "#/admin/tickets?status=closed"
                    )}
                    ${ticketTable(closed, { showTechnician: true })}
                  </section>`
                : ""
            }
          </div>

          <aside class="dashboard-side">
            ${workloadPanel(technicians)}
            ${statusOverview(tickets)}
            ${quickLinks()}
          </aside>
        </div>
      </div>
    `;

    container.querySelector("[data-refresh]")?.addEventListener("click", () => {
      void load({ silent: false });
    });
    container.querySelectorAll("[data-assign]").forEach((button) => {
      button.addEventListener("click", () => {
        const ticket = tickets.find((item) => item.id === button.dataset.assign);
        if (!ticket) return;
        openAssignModal({
          ticket,
          onAssigned: () => {
            void load({ silent: true });
          },
        });
      });
    });
  };

  const load = async ({ silent = false } = {}) => {
    const token = ++loadToken;
    if (!silent) {
      const page = container.querySelector(".page");
      if (page) {
        page.innerHTML = `
          ${pageHeader({
            eyebrow: "Admin · Maintenance desk",
            title: "Triage desk",
            subtitle: "Everything that needs a decision, a technician or a nudge — in one place.",
          })}
          ${skeletonKpis(4)}
          ${skeletonList(3)}
        `;
      }
    }

    try {
      const [ticketResult, technicianList] = await Promise.all([
        getTickets({ pageSize: 500, sort: "newest" }),
        getTechnicians(),
      ]);
      if (disposed || token !== loadToken) return;
      tickets = ticketResult.data ?? [];
      technicians = technicianList;
      render();
      setTitle("Triage desk", "Triage desk");

      if (!unsubscribe) {
        try {
          unsubscribe = subscribeToTickets(() => {
            window.clearTimeout(reloadTimer);
            reloadTimer = window.setTimeout(() => void load({ silent: true }), 800);
          });
        } catch (realtimeError) {
          console.error("Could not subscribe to ticket updates", realtimeError);
        }
      }
    } catch (error) {
      console.error(error);
      if (disposed || token !== loadToken) return;
      if (silent) {
        toast("Could not refresh the triage desk. Check your connection.", "warning");
        return;
      }
      container.innerHTML = `
        <div class="page">
          ${pageHeader({
            eyebrow: "Admin · Maintenance desk",
            title: "Triage desk",
            subtitle: "Everything that needs a decision, a technician or a nudge — in one place.",
          })}
          ${errorState({
            title: "We could not load the triage desk",
            text: "Check your connection and try again.",
            actionHtml:
              '<button type="button" class="btn btn--primary" data-retry>Try again</button>',
          })}
        </div>
      `;
      container.querySelector("[data-retry]")?.addEventListener("click", () => refresh());
    }
  };

  onCleanup(() => {
    disposed = true;
    window.clearTimeout(reloadTimer);
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  });

  await load();
}
