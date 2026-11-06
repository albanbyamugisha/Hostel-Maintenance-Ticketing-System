import {
  countTickets,
  getAllTicketsForExport,
  getProfiles,
  getTickets,
  subscribeToTickets,
} from "../api.js";
import {
  categoryOptions,
  pageHeader,
  paginationHtml,
  severityOptions,
  statusChips,
} from "../components/pageBits.js";
import { openAssignModal } from "../components/assignModal.js";
import { openAdminReopenModal } from "../components/ticketActions.js";
import {
  emptyState,
  errorState,
  handleError,
  loadingBlock,
  setButtonBusy,
} from "../ui.js";
import { toast } from "../toast.js";
import { icon } from "../icons.js";
import {
  STATUS_META,
  avatarHtml,
  csvCell,
  debounce,
  downloadFile,
  escapeHtml,
  formatDate,
  isOverdue,
  locationLabel,
  pluralize,
  relativeTime,
  severityBadge,
  statusBadge,
  todayISO,
  truncate,
} from "../utils.js";

const PAGE_SIZE = 12;
const ACTIVE_STATUSES = ["reported", "reopened", "assigned", "in_progress", "on_hold"];
const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "updated", label: "Recently updated" },
  { value: "severity", label: "Most urgent" },
  { value: "target", label: "Target date" },
  { value: "status", label: "Status" },
];
const BLOCKS = ["Block A", "Block B", "Block C", "Block D"];

function asEnum(value, meta) {
  return value && meta[value] ? value : "all";
}

function buildRow(ticket) {
  const resident = ticket.resident;
  const technician = ticket.technician;
  const overdue = isOverdue(ticket);
  const canAssign = ["reported", "reopened", "assigned"].includes(ticket.status);
  const canReopen = ["resolved", "closed"].includes(ticket.status);

  return `
    <tr>
      <td class="cell-title" data-label="">
        <a href="#/tickets/${encodeURIComponent(ticket.id)}">${escapeHtml(
          ticket.tracking_id
        )}</a>
        <span class="cell-sub">${escapeHtml(truncate(ticket.title, 110))}</span>
        <span class="cell-sub">${escapeHtml(locationLabel(ticket))}</span>
      </td>
      <td data-label="Status">${statusBadge(ticket.status)}</td>
      <td data-label="Severity">${severityBadge(ticket.severity)}</td>
      <td data-label="Resident">
        ${
          resident
            ? `<span class="row" style="gap:0.35rem">${avatarHtml(
                resident.full_name,
                "resident",
                "avatar--sm"
              )}<span class="truncate">${escapeHtml(resident.full_name)}</span></span>`
            : `<span class="text-muted">—</span>`
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
      <td data-label="Created">
        <span title="${escapeHtml(relativeTime(ticket.created_at))}">${escapeHtml(
          formatDate(ticket.created_at)
        )}</span>
      </td>
      <td data-label="Target">
        ${
          ticket.target_date
            ? `<span class="${overdue ? "overdue-text" : ""}">${escapeHtml(
                formatDate(ticket.target_date)
              )}</span>`
            : `<span class="text-muted">—</span>`
        }
      </td>
      <td class="cell-actions" data-label="">
        <div class="table-actions">
          ${
            canAssign
              ? `<button type="button" class="btn btn--secondary btn--sm" data-assign="${escapeHtml(
                  ticket.id
                )}" title="${
                  ticket.assigned_to ? "Reassign technician" : "Assign technician"
                }">${icon("user-check")} ${ticket.assigned_to ? "Reassign" : "Assign"}</button>`
              : ""
          }
          ${
            canReopen
              ? `<button type="button" class="btn btn--danger-ghost btn--sm" data-reopen="${escapeHtml(
                  ticket.id
                )}">${icon("rotate")} Reopen</button>`
              : ""
          }
          <a class="btn btn--ghost btn--sm" href="#/tickets/${encodeURIComponent(
            ticket.id
          )}">${icon("external-link")} Open</a>
        </div>
      </td>
    </tr>
  `;
}

function tableHtml(tickets) {
  return `
    <div class="table-wrap">
      <table class="table table--stack">
        <thead>
          <tr>
            <th scope="col">Ticket</th>
            <th scope="col">Status</th>
            <th scope="col">Severity</th>
            <th scope="col">Resident</th>
            <th scope="col">Technician</th>
            <th scope="col">Created</th>
            <th scope="col">Target</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>${tickets.map(buildRow).join("")}</tbody>
      </table>
    </div>
  `;
}

export default async function adminTicketsPage({
  container,
  query,
  refresh,
  setTitle,
  onCleanup,
}) {
  const statusParam = query.get("status");
  const state = {
    status: asEnum(statusParam, STATUS_META),
    active: query.get("active") === "1" && !statusParam,
    unassigned: query.get("unassigned") === "1",
    overdue: query.get("overdue") === "1",
    search: query.get("q") ?? "",
    category: asEnum(query.get("category"), {
      plumbing: 1,
      electrical: 1,
      carpentry_structure: 1,
    }),
    severity: asEnum(query.get("severity"), {
      low: 1,
      medium: 1,
      high: 1,
      emergency: 1,
    }),
    block: query.get("block") ?? "all",
    technicianId: query.get("tech") ?? "",
    from: query.get("from") ?? "",
    to: query.get("to") ?? "",
    sort: SORT_OPTIONS.some((option) => option.value === query.get("sort"))
      ? query.get("sort")
      : "newest",
    page: 0,
  };

  let profiles = [];
  let pageItems = [];
  let counts = {};
  let total = 0;
  let unsubscribe = null;
  let reloadTimer = null;
  let disposed = false;
  let loadToken = 0;
  let shellReady = false;

  setTitle("All tickets", "All tickets");

  const buildFilters = ({ includeStatus = true, includeScope = true } = {}) => {
    const filters = {
      search: state.search,
      category: state.category,
      severity: state.severity,
      block: state.block,
      technicianId: state.technicianId || undefined,
      from: state.from,
      to: state.to,
      unassigned: state.unassigned,
      overdue: state.overdue,
      sort: state.sort,
    };
    if (includeStatus) {
      if (state.status !== "all") {
        filters.status = state.status;
      } else if (includeScope && state.active) {
        filters.statuses = ACTIVE_STATUSES;
      }
    }
    return filters;
  };

  const syncUrl = () => {
    const params = new URLSearchParams();
    if (state.status !== "all") params.set("status", state.status);
    if (state.active) params.set("active", "1");
    if (state.unassigned) params.set("unassigned", "1");
    if (state.overdue) params.set("overdue", "1");
    if (state.search.trim()) params.set("q", state.search.trim());
    if (state.category !== "all") params.set("category", state.category);
    if (state.severity !== "all") params.set("severity", state.severity);
    if (state.block !== "all") params.set("block", state.block);
    if (state.technicianId) params.set("tech", state.technicianId);
    if (state.from) params.set("from", state.from);
    if (state.to) params.set("to", state.to);
    if (state.sort !== "newest") params.set("sort", state.sort);

    const search = params.toString();
    const target = `${window.location.pathname}${window.location.search}#/admin/tickets${
      search ? `?${search}` : ""
    }`;
    window.history.replaceState(null, "", target);
  };

  const technicianOptions = () =>
    profiles
      .filter((profile) => profile.role === "technician")
      .map(
        (profile) =>
          `<option value="${escapeHtml(profile.id)}" ${
            profile.id === state.technicianId ? "selected" : ""
          }>${escapeHtml(profile.full_name)}${profile.is_active ? "" : " (inactive)"}</option>`
      )
      .join("");

  const blockOptions = () => {
    const set = new Set(BLOCKS);
    if (state.block !== "all") set.add(state.block);
    profiles.forEach((profile) => {
      if (profile.block) set.add(profile.block);
    });
    return [...set]
      .sort((a, b) => a.localeCompare(b))
      .map(
        (block) =>
          `<option value="${escapeHtml(block)}" ${
            block === state.block ? "selected" : ""
          }>${escapeHtml(block)}</option>`
      )
      .join("");
  };

  const renderShell = () => {
    container.innerHTML = `
      <div class="page">
        ${pageHeader({
          eyebrow: "Admin · Ticket register",
          title: "All tickets",
          subtitle:
            "Search, filter and export every repair request in the hostel.",
          actions: `<button type="button" class="btn btn--secondary" data-export>${icon(
            "download"
          )} Export CSV</button>
            <a class="btn btn--primary" href="#/admin">${icon("gauge")} Triage desk</a>`,
        })}

        <div class="filter-panel stack">
          <div class="toolbar">
            <div class="field field--wide">
              <label class="field__label" for="admin-search">Search tickets</label>
              <div class="input-wrap">
                ${icon("search")}
                <input type="search" id="admin-search" placeholder="Tracking ID, title or description"
                  maxlength="80" autocomplete="off" value="${escapeHtml(state.search)}" />
              </div>
            </div>
            <div class="field">
              <label class="field__label" for="admin-sort">Sort by</label>
              <select id="admin-sort">
                ${SORT_OPTIONS.map(
                  (option) =>
                    `<option value="${option.value}" ${
                      option.value === state.sort ? "selected" : ""
                    }>${escapeHtml(option.label)}</option>`
                ).join("")}
              </select>
            </div>
            <div class="toolbar__actions">
              <button type="button" class="btn btn--secondary" data-reset>${icon(
                "refresh"
              )} Reset</button>
            </div>
          </div>

          <div data-chips>${statusChips({ active: state.status, counts: {} })}</div>

          <div class="form-grid form-grid--3">
            <div class="field">
              <label class="field__label" for="admin-category">Category</label>
              <select id="admin-category">
                <option value="all">All categories</option>
                ${categoryOptions(state.category === "all" ? "" : state.category)}
              </select>
            </div>
            <div class="field">
              <label class="field__label" for="admin-severity">Severity</label>
              <select id="admin-severity">
                <option value="all">All severities</option>
                ${severityOptions(state.severity === "all" ? "" : state.severity)}
              </select>
            </div>
            <div class="field">
              <label class="field__label" for="admin-block">Block</label>
              <select id="admin-block">
                <option value="all">All blocks</option>
                ${blockOptions()}
              </select>
            </div>
            <div class="field">
              <label class="field__label" for="admin-tech">Technician</label>
              <select id="admin-tech">
                <option value="">Any technician</option>
                ${technicianOptions()}
              </select>
            </div>
            <div class="field">
              <label class="field__label" for="admin-assignment">Assignment</label>
              <select id="admin-assignment">
                <option value="all" ${state.unassigned ? "" : "selected"}>Assigned or unassigned</option>
                <option value="unassigned" ${state.unassigned ? "selected" : ""}>Unassigned only</option>
              </select>
            </div>
            <div class="field">
              <label class="field__label" for="admin-timeliness">Timeliness</label>
              <select id="admin-timeliness">
                <option value="all" ${state.overdue ? "" : "selected"}>Any target date</option>
                <option value="overdue" ${state.overdue ? "selected" : ""}>Overdue only</option>
              </select>
            </div>
            <div class="field">
              <label class="field__label" for="admin-from">Reported from</label>
              <input type="date" id="admin-from" value="${escapeHtml(state.from)}" />
            </div>
            <div class="field">
              <label class="field__label" for="admin-to">Reported to</label>
              <input type="date" id="admin-to" value="${escapeHtml(state.to)}" />
            </div>
            <div class="field">
              <span class="field__label">Active view</span>
              <div class="row-between" style="min-height:44px">
                <span class="text-sm text-muted" data-active-state>
                  ${state.active ? "Active tickets only" : "All statuses"}
                </span>
                <button type="button" class="link-btn" data-clear-active ${state.active ? "" : "hidden"}>
                  Show all
                </button>
              </div>
            </div>
          </div>

          <p class="text-xs text-muted" data-summary aria-live="polite">Loading tickets…</p>
        </div>

        <div data-list aria-live="polite">${loadingBlock("Loading tickets…")}</div>
        <div data-pagination></div>
      </div>
    `;

    shellReady = true;
    bindEvents();
  };

  const updateChips = () => {
    const chips = container.querySelector("[data-chips]");
    if (!chips) return;
    chips.innerHTML = statusChips({ active: state.status, counts });
    chips.querySelectorAll("[data-status]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.status === state.status));
    });
  };

  const renderResults = () => {
    const list = container.querySelector("[data-list]");
    const pagination = container.querySelector("[data-pagination]");
    const summary = container.querySelector("[data-summary]");
    if (!list || !pagination || !summary) return;

    updateChips();

    summary.textContent = `${pluralize(total, "ticket")}${
      state.active ? " in the active queue" : ""
    }${state.unassigned ? " · unassigned only" : ""}${
      state.overdue ? " · overdue only" : ""
    }`;

    if (!pageItems.length) {
      list.innerHTML = emptyState({
        iconName: "search",
        title: "No tickets match",
        text: "Try clearing a filter, widening the date range or searching for a different tracking ID.",
        actionHtml:
          '<button type="button" class="btn btn--secondary" data-clear>Clear all filters</button>',
      });
      pagination.innerHTML = "";
      return;
    }

    list.innerHTML = tableHtml(pageItems);
    pagination.innerHTML = paginationHtml({
      page: state.page,
      pageSize: PAGE_SIZE,
      total,
    });
  };

  const setLoading = (busy) => {
    const list = container.querySelector("[data-list]");
    if (list && busy) list.innerHTML = loadingBlock("Loading tickets…");
  };

  const load = async ({ silent = false } = {}) => {
    const token = ++loadToken;
    if (!silent) setLoading(true);

    try {
      const filters = buildFilters();
      const [result, nextCounts] = await Promise.all([
        getTickets({
          ...filters,
          page: state.page,
          pageSize: PAGE_SIZE,
          count: true,
        }),
        (async () => {
          const base = buildFilters({ includeStatus: false, includeScope: false });
          const pairs = await Promise.all(
            Object.keys(STATUS_META).map(async (status) => {
              const statusFilters = { ...base, status };
              if (state.active) statusFilters.statuses = ACTIVE_STATUSES;
              return [status, await countTickets(statusFilters)];
            })
          );
          const next = { all: 0 };
          pairs.forEach(([status, count]) => {
            next[status] = count;
            next.all += count;
          });
          return next;
        })(),
      ]);

      if (disposed || token !== loadToken) return;

      total = result.count ?? result.data.length;
      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      if (state.page > pages - 1 && total > 0) {
        state.page = pages - 1;
        return load({ silent: true });
      }

      pageItems = result.data;
      counts = nextCounts;
      renderResults();
      syncUrl();
    } catch (error) {
      console.error(error);
      if (disposed || token !== loadToken) return;
      if (silent) {
        toast("Could not refresh tickets. Check your connection.", "warning");
        return;
      }
      const list = container.querySelector("[data-list]");
      if (list) {
        list.innerHTML = errorState({
          title: "We could not load the ticket register",
          text: "Check your connection and try again.",
          actionHtml:
            '<button type="button" class="btn btn--primary" data-retry>Try again</button>',
        });
        list.querySelector("[data-retry]")?.addEventListener("click", () => void load());
      }
    }
  };

  const reloadFromFilters = () => {
    state.page = 0;
    void load();
  };

  const resetFilters = () => {
    state.status = "all";
    state.active = false;
    state.unassigned = false;
    state.overdue = false;
    state.search = "";
    state.category = "all";
    state.severity = "all";
    state.block = "all";
    state.technicianId = "";
    state.from = "";
    state.to = "";
    state.sort = "newest";
    state.page = 0;

    const setValue = (selector, value) => {
      const element = container.querySelector(selector);
      if (element) element.value = value;
    };
    setValue("#admin-search", "");
    setValue("#admin-sort", "newest");
    setValue("#admin-category", "all");
    setValue("#admin-severity", "all");
    setValue("#admin-block", "all");
    setValue("#admin-tech", "");
    setValue("#admin-assignment", "all");
    setValue("#admin-timeliness", "all");
    setValue("#admin-from", "");
    setValue("#admin-to", "");
    const activeState = container.querySelector("[data-active-state]");
    if (activeState) activeState.textContent = "All statuses";
    container.querySelector("[data-clear-active]")?.setAttribute("hidden", "");
    void load();
  };

  const handleAssign = (ticketId) => {
    const ticket = pageItems.find((item) => item.id === ticketId);
    if (!ticket) return;
    openAssignModal({
      ticket,
      onAssigned: () => {
        void load({ silent: true });
      },
    });
  };

  const handleReopen = (ticketId) => {
    const ticket = pageItems.find((item) => item.id === ticketId);
    if (!ticket) return;
    openAdminReopenModal({
      ticket,
      onDone: () => {
        void load({ silent: true });
      },
    });
  };

  const exportCsv = async (button) => {
    setButtonBusy(button, true, "Exporting…");
    try {
      const tickets = await getAllTicketsForExport(buildFilters());
      if (!tickets.length) {
        toast("There are no tickets to export with these filters.", "warning");
        return;
      }
      const header = [
        "Tracking ID",
        "Title",
        "Status",
        "Severity",
        "Category",
        "Block",
        "Floor",
        "Room",
        "Resident",
        "Technician",
        "Reported",
        "Target date",
        "Resolved",
        "Closed",
        "Rating",
        "Reopened",
      ];
      const rows = tickets.map((ticket) => [
        ticket.tracking_id,
        ticket.title,
        STATUS_META[ticket.status]?.label ?? ticket.status,
        ticket.severity,
        ticket.category,
        ticket.block,
        ticket.floor,
        ticket.room_number,
        ticket.resident?.full_name ?? "",
        ticket.technician?.full_name ?? "",
        ticket.created_at,
        ticket.target_date ?? "",
        ticket.resolved_at ?? "",
        ticket.closed_at ?? "",
        ticket.rating ?? "",
        ticket.reopen_count ?? 0,
      ]);
      const csv = `\uFEFF${[header, ...rows]
        .map((row) => row.map(csvCell).join(","))
        .join("\r\n")}`;
      downloadFile(`hostelcare-tickets-${todayISO()}.csv`, csv, "text/csv;charset=utf-8");
      toast(`${pluralize(tickets.length, "ticket")} exported.`, "success", {
        title: "CSV ready",
      });
    } catch (error) {
      handleError(error, "Could not export the ticket register.");
    } finally {
      setButtonBusy(button, false);
    }
  };

  const applySearch = debounce(() => {
    const input = container.querySelector("#admin-search");
    if (!input) return;
    state.search = input.value;
    reloadFromFilters();
  }, 300);

  const bindEvents = () => {
    container.querySelector("#admin-search")?.addEventListener("input", applySearch);
    container.querySelector("#admin-sort")?.addEventListener("change", (event) => {
      state.sort = event.target.value;
      reloadFromFilters();
    });
    container.querySelector("#admin-category")?.addEventListener("change", (event) => {
      state.category = event.target.value;
      reloadFromFilters();
    });
    container.querySelector("#admin-severity")?.addEventListener("change", (event) => {
      state.severity = event.target.value;
      reloadFromFilters();
    });
    container.querySelector("#admin-block")?.addEventListener("change", (event) => {
      state.block = event.target.value;
      reloadFromFilters();
    });
    container.querySelector("#admin-tech")?.addEventListener("change", (event) => {
      state.technicianId = event.target.value;
      reloadFromFilters();
    });
    container.querySelector("#admin-assignment")?.addEventListener("change", (event) => {
      state.unassigned = event.target.value === "unassigned";
      reloadFromFilters();
    });
    container.querySelector("#admin-timeliness")?.addEventListener("change", (event) => {
      state.overdue = event.target.value === "overdue";
      reloadFromFilters();
    });
    container.querySelector("#admin-from")?.addEventListener("change", (event) => {
      state.from = event.target.value;
      reloadFromFilters();
    });
    container.querySelector("#admin-to")?.addEventListener("change", (event) => {
      state.to = event.target.value;
      reloadFromFilters();
    });
    container.querySelector("[data-reset]")?.addEventListener("click", resetFilters);
    container.querySelector("[data-export]")?.addEventListener("click", (event) => {
      void exportCsv(event.currentTarget);
    });
    container.querySelector("[data-clear-active]")?.addEventListener("click", () => {
      state.active = false;
      state.page = 0;
      const activeState = container.querySelector("[data-active-state]");
      if (activeState) activeState.textContent = "All statuses";
      container.querySelector("[data-clear-active]")?.setAttribute("hidden", "");
      void load();
    });

    container.querySelector("[data-chips]")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-status]");
      if (!button) return;
      state.status = button.dataset.status;
      state.active = false;
      state.page = 0;
      const activeState = container.querySelector("[data-active-state]");
      if (activeState) activeState.textContent = "All statuses";
      container.querySelector("[data-clear-active]")?.setAttribute("hidden", "");
      void load();
    });

    container.querySelector("[data-pagination]")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button || button.disabled) return;
      state.page = Number(button.dataset.page);
      void load();
      container
        .querySelector("[data-list]")
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
    });

    container.querySelector("[data-list]")?.addEventListener("click", (event) => {
      if (event.target.closest("[data-clear]")) {
        resetFilters();
        return;
      }
      const assignButton = event.target.closest("[data-assign]");
      if (assignButton) {
        handleAssign(assignButton.dataset.assign);
        return;
      }
      const reopenButton = event.target.closest("[data-reopen]");
      if (reopenButton) handleReopen(reopenButton.dataset.reopen);
    });
  };

  container.innerHTML = `
    <div class="page">
      ${pageHeader({
        eyebrow: "Admin · Ticket register",
        title: "All tickets",
        subtitle:
          "Search, filter and export every repair request in the hostel.",
      })}
      ${loadingBlock("Loading the ticket register…")}
    </div>
  `;

  try {
    profiles = await getProfiles();
  } catch (error) {
    console.error(error);
    container.innerHTML = `
      <div class="page">
        ${pageHeader({
          eyebrow: "Admin · Ticket register",
          title: "All tickets",
          subtitle:
            "Search, filter and export every repair request in the hostel.",
        })}
        ${errorState({
          title: "We could not load the ticket register",
          text: "Check your connection and try again.",
          actionHtml:
            '<button type="button" class="btn btn--primary" data-retry>Try again</button>',
        })}
      </div>
    `;
    container.querySelector("[data-retry]")?.addEventListener("click", () => refresh());
    return;
  }

  if (!shellReady) renderShell();
  await load();

  if (!unsubscribe) {
    try {
      unsubscribe = subscribeToTickets(() => {
        window.clearTimeout(reloadTimer);
        reloadTimer = window.setTimeout(() => void load({ silent: true }), 900);
      });
    } catch (realtimeError) {
      console.error("Could not subscribe to ticket updates", realtimeError);
    }
  }

  onCleanup(() => {
    disposed = true;
    window.clearTimeout(reloadTimer);
    applySearch.cancel();
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  });
}
