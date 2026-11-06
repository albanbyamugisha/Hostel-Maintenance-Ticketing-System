import { getAllTicketsForResident } from "../api.js";
import { pageHeader, paginationHtml, statusChips } from "../components/pageBits.js";
import { ticketList } from "../components/ticketCard.js";
import { emptyState, errorState, skeletonList } from "../ui.js";
import { icon } from "../icons.js";
import {
  STATUS_META,
  STATUS_ORDER,
  SEVERITY_RANK,
  debounce,
  pluralize,
} from "../utils.js";

const PAGE_SIZE = 8;
const OPEN_STATUSES = ["reported", "reopened", "assigned", "in_progress", "on_hold"];

function sortTickets(tickets, sort) {
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
    case "severity":
      return list.sort((a, b) => {
        const rank = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
        return rank || String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
      });
    case "target":
      return list.sort((a, b) => {
        if (a.target_date && b.target_date) return a.target_date.localeCompare(b.target_date);
        if (a.target_date) return -1;
        if (b.target_date) return 1;
        return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
      });
    case "status":
      return list.sort(
        (a, b) =>
          STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
          String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))
      );
    default:
      return list.sort((a, b) =>
        String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))
      );
  }
}

export default async function residentTicketsPage({ container, profile, query, refresh }) {
  const initialStatus = STATUS_META[query.get("status")] ? query.get("status") : "all";

  container.innerHTML = `
    <div class="page">
      ${pageHeader({
        eyebrow: "Resident · My requests",
        title: "My tickets",
        subtitle: "Every repair you have reported, from first report to final confirmation.",
        actions: `<a class="btn btn--primary" href="#/tickets/new">${icon(
          "plus"
        )} Report an issue</a>`,
      })}
      ${skeletonList(4)}
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
          eyebrow: "Resident · My requests",
          title: "My tickets",
          subtitle: "Every repair you have reported, from first report to final confirmation.",
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

  const counts = { all: tickets.length };
  Object.keys(STATUS_META).forEach((status) => {
    counts[status] = tickets.filter((ticket) => ticket.status === status).length;
  });
  const openCount = tickets.filter((ticket) => OPEN_STATUSES.includes(ticket.status)).length;
  const awaitingCount = counts.resolved;

  const state = {
    status: initialStatus,
    search: "",
    sort: "newest",
    page: 0,
  };

  container.innerHTML = `
    <div class="page">
      ${pageHeader({
        eyebrow: "Resident · My requests",
        title: "My tickets",
        subtitle: "Every repair you have reported, from first report to final confirmation.",
        actions: `<a class="btn btn--primary" href="#/tickets/new">${icon(
          "plus"
        )} Report an issue</a>`,
      })}

      <div class="filter-panel stack">
        <div class="toolbar">
          <div class="field field--wide">
            <label class="field__label" for="ticket-search">Search my tickets</label>
            <div class="input-wrap">
              ${icon("search")}
              <input type="search" id="ticket-search" placeholder="Tracking ID, title or room"
                maxlength="80" autocomplete="off" />
            </div>
          </div>
          <div class="field">
            <label class="field__label" for="ticket-sort">Sort by</label>
            <select id="ticket-sort">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="updated">Recently updated</option>
              <option value="severity">Most urgent</option>
              <option value="target">Target date</option>
              <option value="status">Status</option>
            </select>
          </div>
          <div class="toolbar__actions">
            <button type="button" class="btn btn--secondary" data-reset>${icon(
              "refresh"
            )} Reset</button>
          </div>
        </div>

        <div data-chips>${statusChips({ active: state.status, counts })}</div>
        <p class="text-xs text-muted" data-summary aria-live="polite"></p>
      </div>

      <div data-list aria-live="polite"></div>
      <div data-pagination></div>
    </div>
  `;

  const searchInput = container.querySelector("#ticket-search");
  const sortSelect = container.querySelector("#ticket-sort");
  const chips = container.querySelector("[data-chips]");
  const list = container.querySelector("[data-list]");
  const pagination = container.querySelector("[data-pagination]");
  const summary = container.querySelector("[data-summary]");

  const filtered = () => {
    const queryText = state.search.trim().toLowerCase();
    let result = tickets.filter(
      (ticket) => state.status === "all" || ticket.status === state.status
    );
    if (queryText) {
      result = result.filter((ticket) =>
        [
          ticket.tracking_id,
          ticket.title,
          ticket.description,
          ticket.block,
          ticket.floor,
          ticket.room_number,
          ticket.category,
        ]
          .join(" ")
          .toLowerCase()
          .includes(queryText)
      );
    }
    return sortTickets(result, state.sort);
  };

  const updateSummary = (result) => {
    summary.textContent = `${pluralize(result.length, "ticket")} · ${openCount} open · ${awaitingCount} awaiting your confirmation`;
  };

  const update = () => {
    const result = filtered();
    const pages = Math.max(1, Math.ceil(result.length / PAGE_SIZE));
    state.page = Math.min(Math.max(state.page, 0), pages - 1);
    const start = state.page * PAGE_SIZE;
    const pageItems = result.slice(start, start + PAGE_SIZE);

    chips.innerHTML = statusChips({ active: state.status, counts });
    chips.querySelectorAll("[data-status]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.status === state.status));
    });

    updateSummary(result);

    if (!result.length) {
      list.innerHTML = tickets.length
        ? emptyState({
            iconName: "search",
            title: "No tickets match",
            text: "Try a different search, status or sort order.",
            actionHtml:
              '<button type="button" class="btn btn--secondary" data-clear>Clear filters</button>',
          })
        : emptyState({
            iconName: "wrench",
            title: "No requests yet",
            text: "When something in your room or a shared area needs fixing, report it with a photo and a short description.",
            actionHtml:
              '<a class="btn btn--primary" href="#/tickets/new">Report your first issue</a>',
          });
    } else {
      list.innerHTML = ticketList(pageItems, { person: "technician" });
    }

    pagination.innerHTML = result.length
      ? paginationHtml({ page: state.page, pageSize: PAGE_SIZE, total: result.length })
      : "";
  };

  const resetFilters = () => {
    state.status = "all";
    state.search = "";
    state.sort = "newest";
    state.page = 0;
    searchInput.value = "";
    sortSelect.value = "newest";
    update();
  };

  const onSearch = debounce(() => {
    state.search = searchInput.value;
    state.page = 0;
    update();
  }, 220);

  searchInput.addEventListener("input", onSearch);
  sortSelect.addEventListener("change", () => {
    state.sort = sortSelect.value;
    state.page = 0;
    update();
  });

  chips.addEventListener("click", (event) => {
    const button = event.target.closest("[data-status]");
    if (!button) return;
    state.status = button.dataset.status;
    state.page = 0;
    update();
  });

  pagination.addEventListener("click", (event) => {
    const button = event.target.closest("[data-page]");
    if (!button || button.disabled) return;
    state.page = Number(button.dataset.page);
    update();
    container.querySelector("[data-list]")?.scrollIntoView({ block: "start", behavior: "smooth" });
  });

  list.addEventListener("click", (event) => {
    if (event.target.closest("[data-clear]")) resetFilters();
  });

  container.querySelector("[data-reset]").addEventListener("click", resetFilters);

  update();
}
