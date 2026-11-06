import {
  getTicketsForTechnician,
  subscribeToTickets,
  technicianUpdateStatus,
} from "../api.js";
import { kpiGrid, pageHeader, paginationHtml, statusChips } from "../components/pageBits.js";
import {
  openHoldModal,
  openResolveModal,
  openWorkLogModal,
} from "../components/ticketActions.js";
import {
  confirmDialog,
  emptyState,
  errorState,
  handleError,
  skeletonKpis,
  skeletonList,
} from "../ui.js";
import { toast } from "../toast.js";
import { icon } from "../icons.js";
import {
  STATUS_META,
  avatarHtml,
  debounce,
  daysOverdue,
  escapeHtml,
  formatDate,
  isOverdue,
  locationLabel,
  pluralize,
  relativeTime,
  severityBadge,
  sortTicketsByPriority,
  statusBadge,
  truncate,
} from "../utils.js";

const PAGE_SIZE = 10;
const JOB_STATUSES = [
  "assigned",
  "in_progress",
  "on_hold",
  "resolved",
  "closed",
  "reopened",
];
const ACTIVE_STATUSES = ["assigned", "in_progress", "on_hold", "reopened"];

function sortJobs(tickets, sort) {
  const list = [...tickets];
  switch (sort) {
    case "oldest":
      return list.sort((a, b) =>
        String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""))
      );
    case "updated":
      return list.sort((a, b) =>
        String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""))
      );
    case "target":
      return list.sort((a, b) => {
        if (a.target_date && b.target_date) return a.target_date.localeCompare(b.target_date);
        if (a.target_date) return -1;
        if (b.target_date) return 1;
        return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
      });
    default:
      return sortTicketsByPriority(list, { overdueFirst: true });
  }
}

function actionButtons(ticket) {
  const buttons = [];

  if (["assigned", "reopened"].includes(ticket.status)) {
    buttons.push(
      `<button type="button" class="btn btn--primary btn--sm" data-job-action="start" data-ticket-id="${escapeHtml(
        ticket.id
      )}">${icon("play")} Start job</button>`
    );
  }

  if (ticket.status === "in_progress") {
    buttons.push(
      `<button type="button" class="btn btn--primary btn--sm" data-job-action="resolve" data-ticket-id="${escapeHtml(
        ticket.id
      )}">${icon("check-circle")} Mark resolved</button>`,
      `<button type="button" class="btn btn--secondary btn--sm" data-job-action="hold" data-ticket-id="${escapeHtml(
        ticket.id
      )}">${icon("pause")} Put on hold</button>`
    );
  }

  if (ticket.status === "on_hold") {
    buttons.push(
      `<button type="button" class="btn btn--primary btn--sm" data-job-action="resume" data-ticket-id="${escapeHtml(
        ticket.id
      )}">${icon("play")} Resume job</button>`
    );
  }

  if (ACTIVE_STATUSES.includes(ticket.status)) {
    buttons.push(
      `<button type="button" class="btn btn--secondary btn--sm" data-job-action="worklog" data-ticket-id="${escapeHtml(
        ticket.id
      )}">${icon("clipboard")} Work log</button>`
    );
  }

  buttons.push(
    `<a class="btn btn--ghost btn--sm" href="#/tickets/${encodeURIComponent(
      ticket.id
    )}">${icon("external-link")} Open</a>`
  );

  return buttons.join("");
}

function jobCard(ticket) {
  const overdue = isOverdue(ticket);
  const emergency = ticket.severity === "emergency";
  const resident = ticket.resident;

  return `
    <article class="ticket-card${emergency ? " ticket-card--emergency" : ""}${
      overdue && !emergency ? " ticket-card--overdue" : ""
    }" data-job-card="${escapeHtml(ticket.id)}">
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
        <a href="#/tickets/${encodeURIComponent(ticket.id)}">${escapeHtml(
          truncate(ticket.title, 120)
        )}</a>
      </h3>

      <p class="text-sm text-muted">${escapeHtml(truncate(ticket.description, 170))}</p>

      <div class="ticket-card__meta">
        <span>${icon("map-pin")}${escapeHtml(locationLabel(ticket))}</span>
        <span>${icon("clock")}${escapeHtml(relativeTime(ticket.created_at))}</span>
        ${
          ticket.target_date
            ? `<span class="${overdue ? "overdue-text" : ""}">${icon("calendar")}Target ${escapeHtml(
                formatDate(ticket.target_date)
              )}</span>`
            : ""
        }
      </div>

      ${
        ticket.status === "on_hold" && ticket.hold_reason
          ? `<div class="alert alert--warning">${icon(
              "pause"
            )}<div><strong>On hold:</strong> ${escapeHtml(ticket.hold_reason)}</div></div>`
          : ""
      }

      <div class="ticket-card__foot">
        <span class="ticket-card__person">
          ${
            resident
              ? `${avatarHtml(resident.full_name, "resident", "avatar--sm")}
                 <span class="truncate">${escapeHtml(resident.full_name)}${
                   resident.room_number
                     ? ` · ${escapeHtml(resident.block || "")} ${escapeHtml(
                         resident.room_number
                       )}`
                     : ""
                 }</span>`
              : `${icon("user")} <span>Resident</span>`
          }
        </span>
        <div class="ticket-card__badges">${severityBadge(ticket.severity)}</div>
      </div>

      <div class="ticket-actions">${actionButtons(ticket)}</div>
    </article>
  `;
}

function sidePanel(tickets) {
  const active = tickets.filter((ticket) => ACTIVE_STATUSES.includes(ticket.status));
  const overdue = active.filter(isOverdue);
  const dueToday = active.filter((ticket) => {
    if (!ticket.target_date) return false;
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(today.getDate()).padStart(2, "0")}`;
    return ticket.target_date === iso;
  });
  const onHold = tickets.filter((ticket) => ticket.status === "on_hold");
  const awaiting = tickets.filter((ticket) => ticket.status === "resolved");
  const closed = tickets.filter((ticket) => ticket.status === "closed");

  const statusRows = JOB_STATUSES.map((status) => {
    const count = tickets.filter((ticket) => ticket.status === status).length;
    return `
      <div class="row-between" style="padding-block: 0.3rem">
        <span class="row text-sm">${statusBadge(status)}</span>
        <strong class="text-sm">${count}</strong>
      </div>
    `;
  }).join("");

  return `
    <section class="card">
      <div class="card__head"><h2>Today at a glance</h2></div>
      <div class="card__body stack-sm">
        <div class="row-between">
          <span class="text-sm text-muted">Active jobs</span>
          <strong>${active.length}</strong>
        </div>
        <div class="row-between">
          <span class="text-sm text-muted">Due today</span>
          <strong>${dueToday.length}</strong>
        </div>
        <div class="row-between">
          <span class="text-sm text-muted">Overdue</span>
          <strong class="${overdue.length ? "overdue-text" : ""}">${overdue.length}</strong>
        </div>
        <div class="row-between">
          <span class="text-sm text-muted">Waiting on parts</span>
          <strong>${onHold.length}</strong>
        </div>
        <div class="row-between">
          <span class="text-sm text-muted">Awaiting resident</span>
          <strong>${awaiting.length}</strong>
        </div>
        <div class="row-between">
          <span class="text-sm text-muted">Completed</span>
          <strong>${closed.length}</strong>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card__head"><h2>Jobs by status</h2></div>
      <div class="card__body">${statusRows}</div>
    </section>

    <section class="card">
      <div class="card__head"><h2>Working safely</h2></div>
      <div class="card__body stack-sm">
        <p class="text-sm text-muted">
          For live wires, flooding or a lockout, treat the job as an emergency and
          tell the maintenance desk immediately. Do not start work that needs a
          qualified contractor.
        </p>
        <a class="btn btn--secondary btn--sm" href="#/notifications">${icon(
          "bell"
        )} Check notifications</a>
      </div>
    </section>
  `;
}

export default async function technicianJobsPage({ container, profile, query, refresh, setTitle, onCleanup }) {
  const initialStatus = JOB_STATUSES.includes(query.get("status")) ? query.get("status") : "all";
  const state = {
    status: initialStatus,
    search: "",
    sort: "priority",
    page: 0,
  };

  let tickets = [];
  let unsubscribe = null;
  let reloadTimer = null;
  let disposed = false;
  let loadToken = 0;

  setTitle("My jobs", "My jobs");
  container.innerHTML = `
    <div class="page">
      ${pageHeader({
        eyebrow: "Technician · Field work",
        title: "My jobs",
        subtitle: "Your assigned repairs, ordered so the most urgent and overdue work comes first.",
        actions: `<button type="button" class="btn btn--secondary" data-refresh>${icon(
          "refresh"
        )} Refresh</button>`,
      })}
      ${skeletonKpis(4)}
      ${skeletonList(3)}
    </div>
  `;

  const filteredTickets = () => {
    const term = state.search.trim().toLowerCase();
    let result = tickets.filter(
      (ticket) => state.status === "all" || ticket.status === state.status
    );
    if (term) {
      result = result.filter((ticket) =>
        [
          ticket.tracking_id,
          ticket.title,
          ticket.description,
          ticket.block,
          ticket.room_number,
          ticket.resident?.full_name,
          ticket.category,
        ]
          .join(" ")
          .toLowerCase()
          .includes(term)
      );
    }
    return sortJobs(result, state.sort);
  };

  const counts = () => {
    const result = { all: tickets.length };
    JOB_STATUSES.forEach((status) => {
      result[status] = tickets.filter((ticket) => ticket.status === status).length;
    });
    return result;
  };

  const renderPage = () => {
    const active = tickets.filter((ticket) => ACTIVE_STATUSES.includes(ticket.status));
    const overdue = active.filter(isOverdue);
    const emergency = active.find((ticket) => ticket.severity === "emergency");

    container.innerHTML = `
      <div class="page">
        ${pageHeader({
          eyebrow: "Technician · Field work",
          title: "My jobs",
          subtitle: "Your assigned repairs, ordered so the most urgent and overdue work comes first.",
          actions: `<button type="button" class="btn btn--secondary" data-refresh>${icon(
            "refresh"
          )} Refresh</button>`,
        })}

        ${kpiGrid([
          {
            label: "Active jobs",
            value: active.length,
            meta: active.length ? "Assigned to you now" : "Nothing outstanding",
            iconName: "wrench",
          },
          {
            label: "Overdue",
            value: overdue.length,
            meta: overdue.length ? "Past the target date" : "All on schedule",
            iconName: "clock",
            tone: overdue.length ? "danger" : "",
          },
          {
            label: "Awaiting resident",
            value: tickets.filter((ticket) => ticket.status === "resolved").length,
            meta: "Repairs waiting for confirmation",
            iconName: "check-circle",
          },
          {
            label: "Completed",
            value: tickets.filter((ticket) => ticket.status === "closed").length,
            meta: "Confirmed and archived",
            iconName: "lock",
          },
        ])}

        ${
          emergency
            ? `<div class="alert alert--danger">
                ${icon("siren")}
                <div><strong>Emergency job:</strong> ${escapeHtml(emergency.title)}.
                <a href="#/tickets/${encodeURIComponent(emergency.id)}">Open the ticket</a> and notify the desk if you need support.</div>
              </div>`
            : ""
        }

        <div class="dashboard-grid">
          <div class="dashboard-main">
            <div class="filter-panel stack">
              <div class="toolbar">
                <div class="field field--wide">
                  <label class="field__label" for="jobs-search">Search my jobs</label>
                  <div class="input-wrap">
                    ${icon("search")}
                    <input type="search" id="jobs-search" placeholder="Tracking ID, title, room or resident"
                      maxlength="80" autocomplete="off" />
                  </div>
                </div>
                <div class="field">
                  <label class="field__label" for="jobs-sort">Sort by</label>
                  <select id="jobs-sort">
                    <option value="priority">Priority &amp; overdue</option>
                    <option value="target">Target date</option>
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="updated">Recently updated</option>
                  </select>
                </div>
                <div class="toolbar__actions">
                  <button type="button" class="btn btn--secondary" data-reset>${icon(
                    "refresh"
                  )} Reset</button>
                </div>
              </div>
              <div data-chips></div>
              <p class="text-xs text-muted" data-summary aria-live="polite"></p>
            </div>

            <div data-list aria-live="polite"></div>
            <div data-pagination></div>
          </div>

          <aside class="dashboard-side" data-side>${sidePanel(tickets)}</aside>
        </div>
      </div>
    `;

    container.querySelector("#jobs-sort").value = state.sort;
    container.querySelector("#jobs-search").value = state.search;

    bindEvents();
    updateList();
  };

  const updateList = () => {
    const chips = container.querySelector("[data-chips]");
    const list = container.querySelector("[data-list]");
    const pagination = container.querySelector("[data-pagination]");
    const summary = container.querySelector("[data-summary]");
    const side = container.querySelector("[data-side]");
    if (!chips || !list || !pagination || !summary || !side) return;

    const result = filteredTickets();
    const pages = Math.max(1, Math.ceil(result.length / PAGE_SIZE));
    state.page = Math.min(Math.max(state.page, 0), pages - 1);
    const pageItems = result.slice(state.page * PAGE_SIZE, state.page * PAGE_SIZE + PAGE_SIZE);
    const active = tickets.filter((ticket) => ACTIVE_STATUSES.includes(ticket.status));

    chips.innerHTML = statusChips({
      active: state.status,
      counts: counts(),
      statuses: JOB_STATUSES,
    });
    chips.querySelectorAll("[data-status]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.status === state.status));
    });

    summary.textContent = `${pluralize(result.length, "job")} · ${active.length} active · ${
      active.filter(isOverdue).length
    } overdue`;

    if (!result.length) {
      list.innerHTML = tickets.length
        ? emptyState({
            iconName: "search",
            title: "No jobs match",
            text: "Try a different search, status or sort order.",
            actionHtml:
              '<button type="button" class="btn btn--secondary" data-clear>Clear filters</button>',
          })
        : emptyState({
            iconName: "wrench",
            title: "No jobs assigned yet",
            text: "When the maintenance desk assigns you a repair it will appear here with its location, priority and target date.",
            actionHtml: `<a class="btn btn--secondary" href="#/notifications">${icon(
              "bell"
            )} Check notifications</a>`,
          });
    } else {
      list.innerHTML = `<div class="ticket-list">${pageItems.map(jobCard).join("")}</div>`;
    }

    pagination.innerHTML = result.length
      ? paginationHtml({ page: state.page, pageSize: PAGE_SIZE, total: result.length })
      : "";
    side.innerHTML = sidePanel(tickets);
  };

  const applySearch = debounce(() => {
    const input = container.querySelector("#jobs-search");
    if (!input) return;
    state.search = input.value;
    state.page = 0;
    updateList();
  }, 220);

  const resetFilters = () => {
    state.status = "all";
    state.search = "";
    state.sort = "priority";
    state.page = 0;
    const input = container.querySelector("#jobs-search");
    const select = container.querySelector("#jobs-sort");
    if (input) input.value = "";
    if (select) select.value = "priority";
    updateList();
  };

  const handleAction = async (action, ticketId, button) => {
    const ticket = tickets.find((item) => item.id === ticketId);
    if (!ticket) return;

    if (action === "resolve") {
      openResolveModal({ ticket, onDone: () => void load({ silent: true }) });
      return;
    }
    if (action === "worklog") {
      openWorkLogModal({ ticket, onDone: () => void load({ silent: true }) });
      return;
    }
    if (action === "hold") {
      void openHoldModal({ ticket, onDone: () => void load({ silent: true }) });
      return;
    }

    if (action === "start" || action === "resume") {
      const start = action === "start";
      const confirmed = await confirmDialog({
        title: start ? "Start this job?" : "Resume this job?",
        message: start
          ? "The resident and the maintenance desk will see that work has started."
          : "The job will move back to In progress and the hold reason will be cleared.",
        confirmLabel: start ? "Start job" : "Resume job",
      });
      if (!confirmed) return;

      button.disabled = true;
      try {
        await technicianUpdateStatus(ticket.id, "in_progress");
        toast(
          start ? "Job started. The resident has been notified." : "Job resumed.",
          "success",
          { title: start ? "Work started" : "Work resumed" }
        );
        await load({ silent: true });
      } catch (error) {
        button.disabled = false;
        handleError(error, "Could not update the job status.");
      }
    }
  };

  const bindEvents = () => {
    container.querySelector("#jobs-search")?.addEventListener("input", applySearch);
    container.querySelector("#jobs-sort")?.addEventListener("change", (event) => {
      state.sort = event.target.value;
      state.page = 0;
      updateList();
    });
    container.querySelector("[data-reset]")?.addEventListener("click", resetFilters);
    container.querySelector("[data-refresh]")?.addEventListener("click", () => {
      void load({ silent: false });
    });

    container.querySelector("[data-chips]")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-status]");
      if (!button) return;
      state.status = button.dataset.status;
      state.page = 0;
      updateList();
    });

    container.querySelector("[data-pagination]")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button || button.disabled) return;
      state.page = Number(button.dataset.page);
      updateList();
      container.querySelector("[data-list]")?.scrollIntoView({ block: "start", behavior: "smooth" });
    });

    container.querySelector("[data-list]")?.addEventListener("click", (event) => {
      if (event.target.closest("[data-clear]")) {
        resetFilters();
        return;
      }
      const button = event.target.closest("[data-job-action]");
      if (!button) return;
      event.preventDefault();
      void handleAction(button.dataset.jobAction, button.dataset.ticketId, button);
    });
  };

  const load = async ({ silent = false } = {}) => {
    const token = ++loadToken;
    if (!silent) {
      const list = container.querySelector("[data-list]");
      if (list) list.innerHTML = `<div class="loading-block" role="status"><span class="spinner" aria-hidden="true"></span>Loading jobs…</div>`;
    }

    try {
      const next = await getTicketsForTechnician(profile.id, 500);
      if (disposed || token !== loadToken) return;
      tickets = next;
      renderPage();
      setTitle("My jobs", "My jobs");

      if (!unsubscribe) {
        try {
          unsubscribe = subscribeToTickets(() => {
            window.clearTimeout(reloadTimer);
            reloadTimer = window.setTimeout(() => void load({ silent: true }), 800);
          });
        } catch (realtimeError) {
          console.error("Could not subscribe to job updates", realtimeError);
        }
      }
    } catch (error) {
      console.error(error);
      if (disposed || token !== loadToken) return;
      if (silent) {
        toast("Could not refresh your jobs. Check your connection.", "warning");
        return;
      }
      container.innerHTML = `
        <div class="page">
          ${pageHeader({
            eyebrow: "Technician · Field work",
            title: "My jobs",
            subtitle: "Your assigned repairs, ordered so the most urgent and overdue work comes first.",
          })}
          ${errorState({
            title: "We could not load your jobs",
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
    applySearch.cancel();
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  });

  await load();
}
