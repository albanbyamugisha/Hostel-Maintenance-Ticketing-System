import { icon } from "./icons.js";

/* --------------------------------------------------------------------------
   Metadata
   -------------------------------------------------------------------------- */
export const STATUS_META = {
  reported: {
    label: "Reported",
    icon: "flag",
    description: "Waiting for the maintenance desk to triage it.",
  },
  assigned: {
    label: "Assigned",
    icon: "user-check",
    description: "A technician has been given the job.",
  },
  in_progress: {
    label: "In progress",
    icon: "wrench",
    description: "A technician is working on the repair.",
  },
  on_hold: {
    label: "On hold",
    icon: "pause",
    description: "Work is paused while waiting for parts or approval.",
  },
  resolved: {
    label: "Resolved",
    icon: "check-circle",
    description: "The technician finished; the resident needs to confirm.",
  },
  closed: {
    label: "Closed",
    icon: "lock",
    description: "The resident confirmed the repair. Archived for audit.",
  },
  reopened: {
    label: "Reopened",
    icon: "rotate",
    description: "The resident or an admin reported the issue is not fixed.",
  },
};

export const SEVERITY_META = {
  low: {
    label: "Low",
    icon: "arrow-down",
    hint: "Cosmetic or a minor inconvenience.",
  },
  medium: {
    label: "Medium",
    icon: "minus",
    hint: "Affects daily use but is not urgent.",
  },
  high: {
    label: "High",
    icon: "alert-triangle",
    hint: "Needs attention soon; major disruption or safety risk.",
  },
  emergency: {
    label: "Emergency",
    icon: "siren",
    hint: "Immediate danger: fire, live wires, flooding, lockout.",
  },
};

export const CATEGORY_META = {
  plumbing: { label: "Plumbing", icon: "droplet", hint: "Water, drains, taps, toilets" },
  electrical: { label: "Electrical", icon: "zap", hint: "Sockets, lights, wiring" },
  carpentry_structure: {
    label: "Carpentry & structure",
    icon: "hammer",
    hint: "Doors, locks, furniture, fittings",
  },
};

export const EVENT_META = {
  created: { label: "reported the issue", icon: "flag" },
  assigned: { label: "assigned the job", icon: "user-check" },
  reassigned: { label: "reassigned the job", icon: "refresh" },
  status_change: { label: "updated the status", icon: "activity" },
  note: { label: "added a note", icon: "message" },
  work_log: { label: "logged work", icon: "clipboard" },
  parts_used: { label: "recorded parts used", icon: "wrench" },
  rating: { label: "rated the repair", icon: "star" },
  reopened: { label: "reopened the ticket", icon: "rotate" },
};

export const STATUS_ORDER = [
  "reported",
  "assigned",
  "in_progress",
  "on_hold",
  "resolved",
  "closed",
  "reopened",
];

export const SEVERITY_RANK = {
  emergency: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/* --------------------------------------------------------------------------
   Escaping — every dynamic value rendered as HTML goes through this.
   -------------------------------------------------------------------------- */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

export const escapeAttr = escapeHtml;

/* --------------------------------------------------------------------------
   Labels and badges
   -------------------------------------------------------------------------- */
export function statusLabel(status) {
  return STATUS_META[status]?.label ?? String(status ?? "Unknown");
}

export function severityLabel(severity) {
  return SEVERITY_META[severity]?.label ?? String(severity ?? "Unknown");
}

export function categoryLabel(category) {
  return CATEGORY_META[category]?.label ?? String(category ?? "Unknown");
}

export function roleLabel(role) {
  return role === "admin" ? "Admin" : role === "technician" ? "Technician" : "Resident";
}

export function specialtyLabel(specialty) {
  if (!specialty) return "—";
  return specialty === "carpentry_structure"
    ? "Carpentry & structure"
    : specialty.charAt(0).toUpperCase() + specialty.slice(1);
}

export function statusBadge(status) {
  const meta = STATUS_META[status] ?? { label: statusLabel(status), icon: "flag" };
  return `<span class="badge badge--status-${escapeAttr(status)}">${icon(
    meta.icon
  )}${escapeHtml(meta.label)}</span>`;
}

export function severityBadge(severity) {
  const meta = SEVERITY_META[severity] ?? { label: severityLabel(severity), icon: "flag" };
  return `<span class="badge badge--sev-${escapeAttr(severity)}">${icon(
    meta.icon
  )}${escapeHtml(meta.label)}</span>`;
}

export function categoryBadge(category) {
  const meta = CATEGORY_META[category] ?? { label: categoryLabel(category), icon: "wrench" };
  return `<span class="badge badge--category">${icon(meta.icon)}${escapeHtml(meta.label)}</span>`;
}

export function rolePill(role) {
  return `<span class="role-pill role-pill--${escapeAttr(role)}">${escapeHtml(
    roleLabel(role)
  )}</span>`;
}

/* --------------------------------------------------------------------------
   Dates and times
   -------------------------------------------------------------------------- */
export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value, options = {}) {
  const date = parseDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options,
  }).format(date);
}

export function formatDateTime(value) {
  const date = parseDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatTime(value) {
  const date = parseDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function relativeTime(value) {
  const date = parseDate(value);
  if (!date) return "";
  const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absolute = Math.abs(deltaSeconds);

  if (absolute < 45) return "just now";

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const divisions = [
    { amount: 60, unit: "second" },
    { amount: 60, unit: "minute" },
    { amount: 24, unit: "hour" },
    { amount: 7, unit: "day" },
    { amount: 4.34524, unit: "week" },
    { amount: 12, unit: "month" },
    { amount: Number.POSITIVE_INFINITY, unit: "year" },
  ];

  let duration = deltaSeconds;
  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return "";
}

export function todayISO() {
  return toISODate(new Date());
}

export function toISODate(date) {
  if (!date) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function addDaysISO(days, from = new Date()) {
  const date = new Date(from);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function daysBetween(from, to = new Date()) {
  const start = parseDate(from);
  if (!start) return null;
  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const end = parseDate(to);
  const endMidnight = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endMidnight - startMidnight) / 86400000);
}

export function isOverdue(ticket) {
  if (!ticket?.target_date) return false;
  if (["resolved", "closed"].includes(ticket.status)) return false;
  return daysBetween(ticket.target_date) > 0;
}

export function daysOverdue(ticket) {
  if (!isOverdue(ticket)) return 0;
  return daysBetween(ticket.target_date);
}

export function formatHours(hours) {
  if (hours === null || hours === undefined || Number.isNaN(Number(hours))) return "—";
  const value = Number(hours);
  if (value < 1) return `${Math.round(value * 60)}m`;
  if (value < 24) return `${value.toFixed(1)}h`;
  const days = Math.floor(value / 24);
  const remainder = Math.round(value % 24);
  return remainder ? `${days}d ${remainder}h` : `${days}d`;
}

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* --------------------------------------------------------------------------
   People
   -------------------------------------------------------------------------- */
export function initials(name) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function avatarHtml(name, role = "resident", extraClass = "") {
  const roleClass =
    role === "technician" ? "avatar--tech" : role === "admin" ? "avatar--admin" : "";
  return `<span class="avatar ${roleClass} ${extraClass}" aria-hidden="true">${escapeHtml(
    initials(name)
  )}</span>`;
}

/* --------------------------------------------------------------------------
   Sorting and formatting
   -------------------------------------------------------------------------- */
export function sortTicketsByPriority(tickets, { overdueFirst = false } = {}) {
  return [...tickets].sort((a, b) => {
    if (overdueFirst) {
      const overdueA = isOverdue(a) ? 1 : 0;
      const overdueB = isOverdue(b) ? 1 : 0;
      if (overdueA !== overdueB) return overdueB - overdueA;
    }
    const severityDiff =
      (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
    if (severityDiff) return severityDiff;
    if (a.target_date && b.target_date && a.target_date !== b.target_date) {
      return a.target_date.localeCompare(b.target_date);
    }
    if (a.target_date && !b.target_date) return -1;
    if (!a.target_date && b.target_date) return 1;
    return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
  });
}

export function locationLabel(ticket) {
  if (!ticket) return "";
  const where =
    ticket.location_type === "common_area"
      ? `${ticket.room_number} (common area)`
      : `Room ${ticket.room_number}`;
  return `${ticket.block} · Floor ${ticket.floor} · ${where}`;
}

export function truncate(text, length = 90) {
  const value = String(text ?? "");
  return value.length > length ? `${value.slice(0, length - 1).trimEnd()}…` : value;
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${Number(count) === 1 ? singular : plural}`;
}

export function ratingStars(rating) {
  const value = Number(rating) || 0;
  return `<span class="stars" role="img" aria-label="${value} out of 5 stars">${Array.from(
    { length: 5 },
    (_, index) => icon("star", index < value ? "is-filled" : "")
  ).join("")}</span>`;
}

/* --------------------------------------------------------------------------
   Errors
   -------------------------------------------------------------------------- */
export function errorMessage(error, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;
  const raw = String(error.message ?? error.error_description ?? error);
  const lower = raw.toLowerCase();

  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed") ||
    lower.includes("network request failed")
  ) {
    return "Network error. Check your connection and try again.";
  }
  if (lower.includes("invalid login credentials")) {
    return "Email or password is incorrect.";
  }
  if (lower.includes("email not confirmed")) {
    return "Please confirm your email address before signing in.";
  }
  if (lower.includes("user already registered")) {
    return "An account with this email already exists.";
  }
  if (lower.includes("password should be at least")) {
    return "Password must be at least 6 characters.";
  }
  if (lower.includes("for security purposes")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (lower.includes("jwt expired") || lower.includes("invalid jwt")) {
    return "Your session has expired. Please sign in again.";
  }
  if (lower.includes("row-level security") || lower.includes("permission denied")) {
    return "You do not have permission to do that.";
  }
  return raw || fallback;
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value ?? "").trim());
}

export function safeNextPath(value) {
  if (!value) return null;
  const path = String(value);
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

/* --------------------------------------------------------------------------
   Files and downloads
   -------------------------------------------------------------------------- */
export function csvCell(value) {
  let text = String(value ?? "");
  // Prevent spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function downloadFile(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* --------------------------------------------------------------------------
   Small helpers
   -------------------------------------------------------------------------- */
export function debounce(fn, wait = 300) {
  let timer;
  const debounced = (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => window.clearTimeout(timer);
  return debounced;
}

export function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = (Math.random() * 16) | 0;
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
