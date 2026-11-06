import { escapeHtml, STATUS_META, CATEGORY_META, SEVERITY_META } from "../utils.js";
import { icon } from "../icons.js";

export function pageHeader({ eyebrow = "", title, subtitle = "", actions = "", iconName = "" }) {
  return `
    <header class="page-head">
      <div class="page-head__main">
        ${
          eyebrow
            ? `<p class="eyebrow">${iconName ? icon(iconName) : ""}${escapeHtml(eyebrow)}</p>`
            : ""
        }
        <h1 class="page-title">${escapeHtml(title)}</h1>
        ${subtitle ? `<p class="page-sub">${escapeHtml(subtitle)}</p>` : ""}
      </div>
      ${actions ? `<div class="page-actions">${actions}</div>` : ""}
    </header>
  `;
}

export function kpiCard({ label, value, meta = "", iconName = "activity", tone = "" }) {
  return `
    <div class="kpi${tone ? ` kpi--${tone}` : ""}">
      <div class="kpi__top">
        <span class="kpi__label">${escapeHtml(label)}</span>
        <span class="kpi__icon">${icon(iconName)}</span>
      </div>
      <span class="kpi__value">${escapeHtml(String(value))}</span>
      ${meta ? `<span class="kpi__meta">${escapeHtml(meta)}</span>` : ""}
    </div>
  `;
}

export function kpiGrid(cards) {
  return `<div class="kpi-grid">${cards.map(kpiCard).join("")}</div>`;
}

export function paginationHtml({ page, pageSize, total }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) {
    return `<p class="pagination__info" style="padding-top: var(--s-2)">${total} result${
      total === 1 ? "" : "s"
    }</p>`;
  }
  const current = Math.min(page + 1, pages);
  const start = Math.max(1, current - 2);
  const end = Math.min(pages, start + 4);
  const numbers = [];
  for (let number = start; number <= end; number += 1) numbers.push(number);

  return `
    <nav class="pagination" aria-label="Pagination">
      <span class="pagination__info">
        Showing ${(current - 1) * pageSize + 1}–${Math.min(
          current * pageSize,
          total
        )} of ${total}
      </span>
      <div class="pagination__buttons">
        <button type="button" class="pagination__page" data-page="${current - 2}"
          ${current === 1 ? "disabled" : ""} aria-label="Previous page">
          ${icon("chevron-left")}
        </button>
        ${numbers
          .map(
            (number) => `
              <button type="button" class="pagination__page" data-page="${number - 1}"
                ${number === current ? 'aria-current="page"' : ""}
                aria-label="Page ${number}">${number}</button>
            `
          )
          .join("")}
        <button type="button" class="pagination__page" data-page="${current}"
          ${current === pages ? "disabled" : ""} aria-label="Next page">
          ${icon("chevron-right")}
        </button>
      </div>
    </nav>
  `;
}

export function statusChips({ active = "all", counts = {}, statuses = null, includeAll = true }) {
  const list = statuses ?? Object.keys(STATUS_META);
  return `
    <div class="chip-row" role="group" aria-label="Filter by status">
      ${
        includeAll
          ? `<button type="button" class="chip" data-status="all" aria-pressed="${
              active === "all"
            }">All <span class="chip__count">${counts.all ?? 0}</span></button>`
          : ""
      }
      ${list
        .map(
          (status) => `
            <button type="button" class="chip" data-status="${status}"
              aria-pressed="${active === status}">
              ${escapeHtml(STATUS_META[status]?.label ?? status)}
              <span class="chip__count">${counts[status] ?? 0}</span>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

export function categoryOptions(selected = "") {
  return Object.entries(CATEGORY_META)
    .map(
      ([value, meta]) =>
        `<option value="${value}" ${value === selected ? "selected" : ""}>${escapeHtml(
          meta.label
        )}</option>`
    )
    .join("");
}

export function severityOptions(selected = "") {
  return Object.entries(SEVERITY_META)
    .map(
      ([value, meta]) =>
        `<option value="${value}" ${value === selected ? "selected" : ""}>${escapeHtml(
          meta.label
        )}</option>`
    )
    .join("");
}

export function statusOptions(selected = "") {
  return Object.entries(STATUS_META)
    .map(
      ([value, meta]) =>
        `<option value="${value}" ${value === selected ? "selected" : ""}>${escapeHtml(
          meta.label
        )}</option>`
    )
    .join("");
}

export function statRow(label, value) {
  return `
    <div class="row-between" style="padding-block: 0.35rem">
      <span class="text-sm text-muted">${escapeHtml(label)}</span>
      <span class="text-sm"><strong>${escapeHtml(String(value))}</strong></span>
    </div>
  `;
}
