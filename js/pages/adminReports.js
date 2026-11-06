import { getAdminReports } from "../api.js";
import { kpiGrid, pageHeader } from "../components/pageBits.js";
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
  addDaysISO,
  categoryLabel,
  cssVar,
  csvCell,
  downloadFile,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatHours,
  pluralize,
  prefersReducedMotion,
  severityLabel,
  specialtyLabel,
  statusLabel,
  todayISO,
} from "../utils.js";

const CHART_JS_URL = new URL("../../vendor/chart.umd.min.js", import.meta.url).href;

const PRESETS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "ytd", label: "This year" },
  { value: "all", label: "All time" },
];

const STATUS_DOT_VARS = {
  reported: "--st-reported-dot",
  assigned: "--st-assigned-dot",
  in_progress: "--st-in-progress-dot",
  on_hold: "--st-on-hold-dot",
  resolved: "--st-resolved-dot",
  closed: "--st-closed-dot",
  reopened: "--st-reopened-dot",
};

const SEVERITY_COLOR_VARS = {
  low: "--muted",
  medium: "--info",
  high: "--warning",
  emergency: "--danger",
};

const CATEGORY_COLOR_VARS = {
  plumbing: "--info",
  electrical: "--accent",
  carpentry_structure: "--brand",
};

let chartLoader = null;

/**
 * Load the bundled Chart.js library on first use. The reports page is the only page
 * that needs it, so it must never block the initial app boot.
 */
function loadChartJs() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (chartLoader) return chartLoader;

  chartLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHART_JS_URL;
    script.async = true;
    script.crossOrigin = "anonymous";
    const timeout = window.setTimeout(() => {
      script.onload = script.onerror = null;
      script.remove();
      chartLoader = null;
      reject(new Error("Chart.js loading timed out."));
    }, 12000);
    script.onload = () => {
      window.clearTimeout(timeout);
      if (window.Chart) {
        resolve(window.Chart);
      } else {
        chartLoader = null;
        reject(new Error("Chart.js loaded but did not initialise."));
      }
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      chartLoader = null;
      script.remove();
      reject(new Error("Could not load the chart library."));
    };
    document.head.appendChild(script);
  });

  return chartLoader;
}

function presetRange(preset) {
  const today = todayISO();
  switch (preset) {
    case "7":
      return { from: addDaysISO(-6), to: today };
    case "30":
      return { from: addDaysISO(-29), to: today };
    case "90":
      return { from: addDaysISO(-89), to: today };
    case "ytd":
      return { from: `${new Date().getFullYear()}-01-01`, to: today };
    case "all":
      return { from: "", to: "" };
    default:
      return null;
  }
}

function validPreset(value) {
  return PRESETS.some((preset) => preset.value === value) ? value : null;
}

function rangeLabel(from, to) {
  if (!from && !to) return "All time";
  if (from && to) return `${formatDate(from)} – ${formatDate(to)}`;
  if (from) return `Since ${formatDate(from)}`;
  return `Up to ${formatDate(to)}`;
}

function percent(part, total) {
  if (!total) return 0;
  return Math.round((Number(part) / Number(total)) * 1000) / 10;
}

function chartCard({ title, subtitle = "", body }) {
  return `
    <section class="chart-card">
      <div class="chart-card__head">
        <h3>${escapeHtml(title)}</h3>
        ${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}
      </div>
      ${body}
    </section>
  `;
}

function chartBox(id, boxClass = "") {
  return `<div class="chart-box ${boxClass}"><canvas id="${id}" role="img" aria-label="Chart"></canvas></div>`;
}

function emptyChart(text = "No tickets in this range.") {
  return `<div class="empty" style="padding: var(--s-5) var(--s-3)">
    <span class="empty__icon">${icon("bar-chart")}</span>
    <p>${escapeHtml(text)}</p>
  </div>`;
}

function technicianRows(technicians) {
  if (!technicians.length) {
    return `<tr><td colspan="7" class="text-muted">No technicians on record.</td></tr>`;
  }
  return technicians
    .map(
      (technician) => `
      <tr>
        <td class="cell-title" data-label="">
          <strong>${escapeHtml(technician.full_name)}</strong>
          ${
            technician.is_active
              ? ""
              : '<span class="badge badge--outline" style="margin-left:0.35rem">Inactive</span>'
          }
        </td>
        <td data-label="Specialty">${escapeHtml(specialtyLabel(technician.specialty))}</td>
        <td data-label="Assigned">${escapeHtml(String(technician.assigned_count ?? 0))}</td>
        <td data-label="Resolved">${escapeHtml(String(technician.resolved_count ?? 0))}</td>
        <td data-label="Avg resolution">${escapeHtml(
          formatHours(technician.avg_resolution_hours)
        )}</td>
        <td data-label="Avg rating">${
          technician.avg_rating === null || technician.avg_rating === undefined
            ? '<span class="text-muted">—</span>'
            : `${icon("star", "is-filled")} ${escapeHtml(
                Number(technician.avg_rating).toFixed(1)
              )}`
        }</td>
        <td data-label="Reopen rate">${
          technician.reopen_rate === null || technician.reopen_rate === undefined
            ? '<span class="text-muted">—</span>'
            : `${escapeHtml(String(technician.reopen_rate))}%`
        }</td>
      </tr>
    `
    )
    .join("");
}

function overdueRows(overdue) {
  if (!overdue.length) {
    return `<tr><td colspan="7" class="text-muted">Nothing is overdue in this range. Nice work.</td></tr>`;
  }
  return overdue
    .map(
      (ticket) => `
      <tr>
        <td class="cell-title" data-label="">
          <a href="#/tickets/${encodeURIComponent(ticket.id)}">${escapeHtml(
            ticket.tracking_id
          )}</a>
          <span class="cell-sub">${escapeHtml(ticket.title)}</span>
        </td>
        <td data-label="Status">${escapeHtml(statusLabel(ticket.status))}</td>
        <td data-label="Block">${escapeHtml(ticket.block)}</td>
        <td data-label="Target">${escapeHtml(formatDate(ticket.target_date))}</td>
        <td data-label="Days overdue" class="overdue-text">${escapeHtml(
          String(ticket.days_overdue ?? 0)
        )}</td>
        <td data-label="Technician">${
          ticket.technician_name
            ? escapeHtml(ticket.technician_name)
            : '<span class="text-muted">Unassigned</span>'
        }</td>
        <td class="cell-actions" data-label="">
          <a class="btn btn--ghost btn--sm" href="#/tickets/${encodeURIComponent(
            ticket.id
          )}">${icon("external-link")} Open</a>
        </td>
      </tr>
    `
    )
    .join("");
}

function reportHtml(report) {
  const totals = report?.totals ?? {};
  const byStatus = report?.by_status ?? [];
  const byCategory = report?.by_category ?? [];
  const bySeverity = report?.by_severity ?? [];
  const byBlock = report?.by_block ?? [];
  const perWeek = report?.per_week ?? [];
  const technicians = report?.technicians ?? [];
  const overdue = report?.overdue ?? [];
  const total = Number(totals.total ?? 0);
  const resolved = byStatus
    .filter((item) => ["resolved", "closed"].includes(item.key))
    .reduce((sum, item) => sum + Number(item.count ?? 0), 0);
  const resolutionRate = percent(resolved, total);

  if (!total) {
    return `
      <div class="stack">
        ${kpiGrid([
          { label: "Total tickets", value: 0, meta: "In the selected range", iconName: "ticket" },
          { label: "Open", value: 0, meta: "Awaiting resolution", iconName: "activity" },
          { label: "Unassigned", value: 0, meta: "Need triage", iconName: "user-plus" },
          { label: "Overdue", value: 0, meta: "Past target date", iconName: "alert-triangle" },
          { label: "Avg resolution", value: "—", meta: "Created → resolved", iconName: "timer" },
          { label: "Avg assignment", value: "—", meta: "Created → assigned", iconName: "clock" },
        ])}
        ${emptyState({
          iconName: "bar-chart",
          title: "No tickets in this range",
          text: "Widen the date range or choose All time to see the full history.",
          actionHtml:
            '<button type="button" class="btn btn--secondary" data-all-time>Show all time</button>',
        })}
      </div>
    `;
  }

  return `
    <div class="stack">
      ${kpiGrid([
        {
          label: "Total tickets",
          value: total,
          meta: "In the selected range",
          iconName: "ticket",
        },
        {
          label: "Open",
          value: Number(totals.open ?? 0),
          meta: "Awaiting resolution",
          iconName: "activity",
        },
        {
          label: "Unassigned",
          value: Number(totals.unassigned ?? 0),
          meta: "Reported or reopened",
          iconName: "user-plus",
          tone: Number(totals.unassigned ?? 0) > 0 ? "warning" : "",
        },
        {
          label: "Overdue",
          value: Number(totals.overdue ?? 0),
          meta: "Past target date",
          iconName: "alert-triangle",
          tone: Number(totals.overdue ?? 0) > 0 ? "danger" : "",
        },
        {
          label: "Avg resolution",
          value: formatHours(totals.avg_resolution_hours),
          meta: "Created → resolved",
          iconName: "timer",
        },
        {
          label: "Avg assignment",
          value: formatHours(totals.avg_assign_hours),
          meta: "Created → assigned",
          iconName: "clock",
        },
      ])}

      <div class="chart-grid" data-charts></div>

      <section class="card">
        <div class="card__head">
          <div>
            <h2>Technician workload</h2>
            <p class="section-head__sub">Volume, speed and satisfaction for every technician.</p>
          </div>
          <span class="badge badge--outline">${escapeHtml(
            pluralize(technicians.length, "technician")
          )}</span>
        </div>
        <div class="table-wrap">
          <table class="table table--stack">
            <thead>
              <tr>
                <th scope="col">Technician</th>
                <th scope="col">Specialty</th>
                <th scope="col">Assigned</th>
                <th scope="col">Resolved</th>
                <th scope="col">Avg resolution</th>
                <th scope="col">Avg rating</th>
                <th scope="col">Reopen rate</th>
              </tr>
            </thead>
            <tbody>${technicianRows(technicians)}</tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <div class="card__head">
          <div>
            <h2>Overdue tickets</h2>
            <p class="section-head__sub">Open jobs past their target date, oldest first.</p>
          </div>
          <span class="badge ${
            overdue.length ? "badge--danger" : "badge--success"
          }">${escapeHtml(pluralize(overdue.length, "ticket"))}</span>
        </div>
        <div class="table-wrap">
          <table class="table table--stack">
            <thead>
              <tr>
                <th scope="col">Ticket</th>
                <th scope="col">Status</th>
                <th scope="col">Block</th>
                <th scope="col">Target</th>
                <th scope="col">Days overdue</th>
                <th scope="col">Technician</th>
                <th scope="col"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>${overdueRows(overdue)}</tbody>
          </table>
        </div>
      </section>

      <p class="text-xs text-muted">
        ${escapeHtml(pluralize(total, "ticket"))} in range ·
        ${escapeHtml(String(resolutionRate))}% resolved or closed ·
        generated ${escapeHtml(formatDateTime(new Date()))}
      </p>
    </div>
  `;
}

function chartsHtml(report) {
  const byStatus = report.by_status ?? [];
  const byCategory = report.by_category ?? [];
  const bySeverity = report.by_severity ?? [];
  const byBlock = report.by_block ?? [];
  const perWeek = report.per_week ?? [];

  return [
    chartCard({
      id: "chart-weekly",
      title: "Tickets reported per week",
      subtitle: pluralize(
        perWeek.reduce((sum, item) => sum + Number(item.count ?? 0), 0),
        "ticket"
      ),
      body: perWeek.length
        ? chartBox("chart-weekly", "chart-box--tall")
        : emptyChart(),
    }),
    chartCard({
      id: "chart-status",
      title: "Status mix",
      subtitle: pluralize(byStatus.length, "status", "statuses"),
      body: byStatus.length ? chartBox("chart-status") : emptyChart(),
    }),
    chartCard({
      id: "chart-severity",
      title: "Severity mix",
      subtitle: pluralize(bySeverity.length, "level"),
      body: bySeverity.length ? chartBox("chart-severity") : emptyChart(),
    }),
    chartCard({
      id: "chart-category",
      title: "Tickets by category",
      subtitle: pluralize(byCategory.length, "category", "categories"),
      body: byCategory.length ? chartBox("chart-category") : emptyChart(),
    }),
    chartCard({
      id: "chart-block",
      title: "Tickets by block",
      subtitle: pluralize(byBlock.length, "block"),
      body: byBlock.length ? chartBox("chart-block") : emptyChart(),
    }),
  ].join("");
}

export default async function adminReportsPage({
  container,
  query,
  refresh,
  setTitle,
  onCleanup,
}) {
  const queryPreset = validPreset(query.get("preset"));
  const queryFrom = query.get("from") ?? "";
  const queryTo = query.get("to") ?? "";
  const hasExplicitRange = Boolean(queryFrom || queryTo);

  const state = {
    preset: queryPreset ?? (hasExplicitRange ? "custom" : "90"),
    from: queryFrom,
    to: queryTo,
  };

  if (!hasExplicitRange && state.preset !== "custom") {
    const range = presetRange(state.preset);
    if (range) {
      state.from = range.from;
      state.to = range.to;
    }
  }

  let report = null;
  let disposed = false;
  let loadToken = 0;
  let chartToken = 0;
  let charts = [];
  let shellReady = false;

  setTitle("Reports", "Reports");

  const destroyCharts = () => {
    charts.forEach((chart) => {
      try {
        chart.destroy();
      } catch (error) {
        console.error("Could not destroy chart", error);
      }
    });
    charts = [];
  };

  const syncUrl = () => {
    const params = new URLSearchParams();
    if (state.preset !== "custom") params.set("preset", state.preset);
    if (state.from) params.set("from", state.from);
    if (state.to) params.set("to", state.to);
    const search = params.toString();
    const target = `${window.location.pathname}${window.location.search}#/admin/reports${
      search ? `?${search}` : ""
    }`;
    window.history.replaceState(null, "", target);
  };

  const themePalette = () => ({
    ink: cssVar("--ink"),
    ink2: cssVar("--ink-2"),
    muted: cssVar("--muted"),
    line: cssVar("--line"),
    surface: cssVar("--surface"),
    brand: cssVar("--brand"),
    accent: cssVar("--accent"),
    danger: cssVar("--danger"),
    warning: cssVar("--warning"),
    info: cssVar("--info"),
    success: cssVar("--success"),
  });

  const statusColor = (key, palette) =>
    cssVar(STATUS_DOT_VARS[key] ?? "") || palette.brand;

  const severityColor = (key, palette) =>
    cssVar(SEVERITY_COLOR_VARS[key] ?? "") || palette.muted;

  const categoryColor = (key, palette) =>
    cssVar(CATEGORY_COLOR_VARS[key] ?? "") || palette.brand;

  const baseScales = (palette, { horizontal = false } = {}) => {
    const valueAxis = {
      beginAtZero: true,
      grid: { color: palette.line, drawBorder: false },
      ticks: { color: palette.muted, precision: 0 },
    };
    const categoryAxis = {
      grid: { display: false },
      ticks: { color: palette.ink2 },
    };
    return horizontal
      ? { x: valueAxis, y: categoryAxis }
      : { x: categoryAxis, y: valueAxis };
  };

  const buildCharts = async (data) => {
    const token = ++chartToken;
    destroyCharts();

    const grid = container.querySelector("[data-charts]");
    if (!grid) return;

    grid.innerHTML = chartsHtml(data);

    const byStatus = data.by_status ?? [];
    const byCategory = data.by_category ?? [];
    const bySeverity = data.by_severity ?? [];
    const byBlock = data.by_block ?? [];
    const perWeek = data.per_week ?? [];

    if (!byStatus.length && !byCategory.length && !bySeverity.length && !byBlock.length) {
      return;
    }

    let Chart;
    try {
      Chart = await loadChartJs();
    } catch (error) {
      console.error(error);
      if (token !== chartToken || disposed) return;
      grid.innerHTML = `
        <div class="alert alert--warning" role="status">
          ${icon("wifi-off")}
          <div>
            <strong>Charts could not load</strong>
            <p>The chart library is unavailable right now. The tables below still work, and the CSV export is unaffected.</p>
          </div>
        </div>
      `;
      return;
    }

    if (token !== chartToken || disposed) return;

    const palette = themePalette();
    const animate = !prefersReducedMotion();

    Chart.defaults.font.family = cssVar("--font-sans");
    Chart.defaults.color = palette.muted;

    const legendOptions = {
      position: "bottom",
      labels: {
        color: palette.ink2,
        boxWidth: 10,
        boxHeight: 10,
        usePointStyle: true,
        padding: 12,
      },
    };

    const tooltipOptions = {
      backgroundColor: palette.surface,
      titleColor: palette.ink,
      bodyColor: palette.ink2,
      borderColor: palette.line,
      borderWidth: 1,
      padding: 10,
      displayColors: true,
    };

    const make = (id, config) => {
      const canvas = grid.querySelector(`#${id}`);
      if (!canvas) return;
      try {
        charts.push(new Chart(canvas, config));
      } catch (error) {
        console.error(`Could not build ${id}`, error);
      }
    };

    if (perWeek.length) {
      make("chart-weekly", {
        type: "line",
        data: {
          labels: perWeek.map((item) =>
            formatDate(item.week, { month: "short", day: "numeric" })
          ),
          datasets: [
            {
              label: "Tickets reported",
              data: perWeek.map((item) => Number(item.count ?? 0)),
              borderColor: palette.brand,
              backgroundColor: palette.brand,
              pointBackgroundColor: palette.brand,
              pointBorderColor: palette.surface,
              pointBorderWidth: 2,
              pointRadius: 3.5,
              pointHoverRadius: 5,
              borderWidth: 2.5,
              tension: 0.32,
              fill: false,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: animate ? undefined : false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: tooltipOptions,
          },
          scales: baseScales(palette),
        },
      });
    }

    if (byStatus.length) {
      make("chart-status", {
        type: "doughnut",
        data: {
          labels: byStatus.map((item) => statusLabel(item.key)),
          datasets: [
            {
              data: byStatus.map((item) => Number(item.count ?? 0)),
              backgroundColor: byStatus.map((item) =>
                statusColor(item.key, palette)
              ),
              borderColor: palette.surface,
              borderWidth: 2,
              hoverOffset: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: animate ? undefined : false,
          cutout: "60%",
          plugins: {
            legend: legendOptions,
            tooltip: tooltipOptions,
          },
        },
      });
    }

    if (bySeverity.length) {
      make("chart-severity", {
        type: "doughnut",
        data: {
          labels: bySeverity.map((item) => severityLabel(item.key)),
          datasets: [
            {
              data: bySeverity.map((item) => Number(item.count ?? 0)),
              backgroundColor: bySeverity.map((item) =>
                severityColor(item.key, palette)
              ),
              borderColor: palette.surface,
              borderWidth: 2,
              hoverOffset: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: animate ? undefined : false,
          cutout: "60%",
          plugins: {
            legend: legendOptions,
            tooltip: tooltipOptions,
          },
        },
      });
    }

    if (byCategory.length) {
      make("chart-category", {
        type: "bar",
        data: {
          labels: byCategory.map((item) => categoryLabel(item.key)),
          datasets: [
            {
              label: "Tickets",
              data: byCategory.map((item) => Number(item.count ?? 0)),
              backgroundColor: byCategory.map((item) =>
                categoryColor(item.key, palette)
              ),
              borderRadius: 6,
              borderSkipped: false,
              maxBarThickness: 26,
            },
          ],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          animation: animate ? undefined : false,
          plugins: {
            legend: { display: false },
            tooltip: tooltipOptions,
          },
          scales: baseScales(palette, { horizontal: true }),
        },
      });
    }

    if (byBlock.length) {
      make("chart-block", {
        type: "bar",
        data: {
          labels: byBlock.map((item) => item.key),
          datasets: [
            {
              label: "Tickets",
              data: byBlock.map((item) => Number(item.count ?? 0)),
              backgroundColor: palette.brand,
              borderRadius: 6,
              borderSkipped: false,
              maxBarThickness: 46,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: animate ? undefined : false,
          plugins: {
            legend: { display: false },
            tooltip: tooltipOptions,
          },
          scales: baseScales(palette),
        },
      });
    }
  };

  const updatePresetChips = () => {
    container.querySelectorAll("[data-preset]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.preset === state.preset));
    });
    const indicator = container.querySelector("[data-custom-indicator]");
    if (indicator) indicator.hidden = state.preset !== "custom";
  };

  const updateRangeSummary = () => {
    const summary = container.querySelector("[data-range-summary]");
    if (summary) {
      summary.textContent = `Showing tickets reported ${rangeLabel(
        state.from,
        state.to
      ).toLowerCase()}.`;
    }
  };

  const setInputs = () => {
    const fromInput = container.querySelector("#report-from");
    const toInput = container.querySelector("#report-to");
    if (fromInput) fromInput.value = state.from;
    if (toInput) toInput.value = state.to;
    updatePresetChips();
    updateRangeSummary();
  };

  const setReportLoading = () => {
    const region = container.querySelector("[data-report]");
    if (region) region.innerHTML = loadingBlock("Crunching the numbers…");
  };

  const load = async () => {
    const token = ++loadToken;
    if (state.from && state.to && state.from > state.to) {
      toast("The start date must be on or before the end date.", "warning", {
        title: "Check the date range",
      });
      return;
    }

    setReportLoading();

    try {
      const data = await getAdminReports(state.from || null, state.to || null);
      if (disposed || token !== loadToken) return;

      report = data ?? { totals: {} };
      const region = container.querySelector("[data-report]");
      if (region) region.innerHTML = reportHtml(report);
      syncUrl();
      updateRangeSummary();
      await buildCharts(report);
    } catch (error) {
      console.error(error);
      if (disposed || token !== loadToken) return;
      const region = container.querySelector("[data-report]");
      if (!region) return;
      region.innerHTML = errorState({
        title: "We could not build this report",
        text: "Check your connection and try again.",
        actionHtml:
          '<button type="button" class="btn btn--primary" data-retry>Try again</button>',
      });
      region.querySelector("[data-retry]")?.addEventListener("click", () => void load());
    }
  };

  const applyPreset = (preset) => {
    const range = presetRange(preset);
    state.preset = preset;
    if (range) {
      state.from = range.from;
      state.to = range.to;
    }
    setInputs();
    void load();
  };

  const exportCsv = (button) => {
    if (!report) {
      toast("The report is still loading. Try again in a moment.", "warning");
      return;
    }

    setButtonBusy(button, true, "Exporting…");
    try {
      const totals = report.totals ?? {};
      const lines = [];
      const push = (...cells) => lines.push(cells.map(csvCell).join(","));
      const blank = () => lines.push("");

      push("HostelCare maintenance report");
      push("Range", rangeLabel(state.from, state.to));
      push("From", state.from || "All time");
      push("To", state.to || "Today");
      push("Generated", new Date().toISOString());
      blank();

      push("Summary");
      push("Metric", "Value");
      push("Total tickets", totals.total ?? 0);
      push("Open tickets", totals.open ?? 0);
      push("Unassigned tickets", totals.unassigned ?? 0);
      push("Overdue tickets", totals.overdue ?? 0);
      push("Average resolution (hours)", totals.avg_resolution_hours ?? "");
      push("Average assignment (hours)", totals.avg_assign_hours ?? "");
      blank();

      const section = (title, keyHeader, rows, formatKey = (key) => key) => {
        push(title);
        push(keyHeader, "Count");
        (rows ?? []).forEach((row) => push(formatKey(row.key), row.count ?? 0));
        blank();
      };

      section("Tickets by status", "Status", report.by_status, statusLabel);
      section("Tickets by category", "Category", report.by_category, categoryLabel);
      section("Tickets by severity", "Severity", report.by_severity, severityLabel);
      section("Tickets by block", "Block", report.by_block);

      push("Tickets reported per week");
      push("Week starting", "Count");
      (report.per_week ?? []).forEach((row) => push(row.week, row.count ?? 0));
      blank();

      push("Technician workload");
      push(
        "Technician",
        "Specialty",
        "Assigned",
        "Resolved",
        "Avg resolution (hours)",
        "Avg rating",
        "Reopen rate (%)"
      );
      (report.technicians ?? []).forEach((row) =>
        push(
          row.full_name,
          specialtyLabel(row.specialty),
          row.assigned_count ?? 0,
          row.resolved_count ?? 0,
          row.avg_resolution_hours ?? "",
          row.avg_rating ?? "",
          row.reopen_rate ?? ""
        )
      );
      blank();

      push("Overdue tickets");
      push(
        "Tracking ID",
        "Title",
        "Status",
        "Block",
        "Target date",
        "Days overdue",
        "Technician"
      );
      (report.overdue ?? []).forEach((row) =>
        push(
          row.tracking_id,
          row.title,
          statusLabel(row.status),
          row.block,
          row.target_date,
          row.days_overdue ?? 0,
          row.technician_name ?? "Unassigned"
        )
      );

      const name = `hostelcare-report-${state.from || "all"}-to-${state.to || "today"}.csv`;
      downloadFile(name, `\uFEFF${lines.join("\r\n")}`, "text/csv;charset=utf-8");
      toast("Report exported as CSV.", "success", { title: "Download ready" });
    } catch (error) {
      handleError(error, "Could not export the report.");
    } finally {
      setButtonBusy(button, false);
    }
  };

  const renderShell = () => {
    container.innerHTML = `
      <div class="page">
        ${pageHeader({
          eyebrow: "Admin · Reports",
          title: "Reports",
          subtitle:
            "Resolution speed, workload and demand trends for the maintenance desk. Pick a range to explore.",
          actions: `<button type="button" class="btn btn--secondary" data-export>${icon(
            "download"
          )} Export CSV</button>
            <a class="btn btn--primary" href="#/admin">${icon("gauge")} Triage desk</a>`,
        })}

        <div class="filter-panel stack">
          <div class="toolbar">
            <div class="chip-row" role="group" aria-label="Report date range" data-presets>
              ${PRESETS.map(
                (preset) => `
                  <button type="button" class="chip" data-preset="${preset.value}"
                    aria-pressed="${preset.value === state.preset}">${escapeHtml(
                  preset.label
                )}</button>
                `
              ).join("")}
              <span class="text-xs text-muted" data-custom-indicator ${
                state.preset === "custom" ? "" : "hidden"
              }>Custom range</span>
            </div>
            <div class="toolbar__actions">
              <button type="button" class="btn btn--secondary btn--sm" data-refresh>${icon(
                "refresh"
              )} Refresh</button>
            </div>
          </div>

          <div class="form-grid form-grid--3">
            <div class="field">
              <label class="field__label" for="report-from">Reported from</label>
              <input type="date" id="report-from" value="${escapeHtml(state.from)}" />
            </div>
            <div class="field">
              <label class="field__label" for="report-to">Reported to</label>
              <input type="date" id="report-to" value="${escapeHtml(state.to)}" />
            </div>
            <div class="field">
              <span class="field__label">Apply range</span>
              <button type="button" class="btn btn--primary" data-apply>${icon(
                "bar-chart"
              )} Build report</button>
            </div>
          </div>

          <p class="text-xs text-muted" data-range-summary>${escapeHtml(
            `Showing tickets reported ${rangeLabel(state.from, state.to).toLowerCase()}.`
          )}</p>
        </div>

        <div data-report aria-live="polite">${loadingBlock("Crunching the numbers…")}</div>
      </div>
    `;

    shellReady = true;
    bindEvents();
  };

  const bindEvents = () => {
    container.querySelector("[data-presets]")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-preset]");
      if (!button) return;
      applyPreset(button.dataset.preset);
    });

    container.querySelector("#report-from")?.addEventListener("change", (event) => {
      state.from = event.target.value;
      state.preset = "custom";
      updatePresetChips();
      updateRangeSummary();
    });

    container.querySelector("#report-to")?.addEventListener("change", (event) => {
      state.to = event.target.value;
      state.preset = "custom";
      updatePresetChips();
      updateRangeSummary();
    });

    container.querySelector("[data-apply]")?.addEventListener("click", () => {
      void load();
    });

    container.querySelector("[data-refresh]")?.addEventListener("click", () => {
      void load();
    });

    container.querySelector("[data-export]")?.addEventListener("click", (event) => {
      exportCsv(event.currentTarget);
    });

    container.querySelector("[data-report]")?.addEventListener("click", (event) => {
      const allTime = event.target.closest("[data-all-time]");
      if (allTime) applyPreset("all");
    });
  };

  const handleThemeChange = () => {
    if (!report) return;
    const region = container.querySelector("[data-report]");
    if (!region) return;
    const grid = region.querySelector("[data-charts]");
    if (!grid) return;
    void buildCharts(report);
  };

  window.addEventListener("themechange", handleThemeChange);

  container.innerHTML = `
    <div class="page">
      ${pageHeader({
        eyebrow: "Admin · Reports",
        title: "Reports",
        subtitle:
          "Resolution speed, workload and demand trends for the maintenance desk. Pick a range to explore.",
      })}
      ${loadingBlock("Loading reports…")}
    </div>
  `;

  if (!shellReady) renderShell();
  onCleanup(() => {
    disposed = true;
    loadToken += 1;
    chartToken += 1;
    destroyCharts();
    window.removeEventListener("themechange", handleThemeChange);
  });
  await load();
}
