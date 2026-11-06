import { escapeHtml } from "./utils.js";
import { icon } from "./icons.js";

const ICONS = {
  info: "info",
  success: "check-circle",
  error: "alert-circle",
  warning: "alert-triangle",
};

const MAX_TOASTS = 4;

function getRegion() {
  let region = document.getElementById("toast-region");
  if (!region) {
    region = document.createElement("div");
    region.id = "toast-region";
    region.className = "toast-region";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-atomic", "false");
    document.body.appendChild(region);
  }
  return region;
}

/**
 * Show a transient notification. Uses the page-level aria-live region so
 * screen readers announce messages without stealing focus.
 */
export function toast(message, type = "info", { title = "", duration = 5000 } = {}) {
  const region = getRegion();
  const variant = Object.prototype.hasOwnProperty.call(ICONS, type) ? type : "info";

  const element = document.createElement("div");
  element.className = `toast toast--${variant}`;
  element.innerHTML = `
    <span class="toast__icon">${icon(ICONS[variant])}</span>
    <div class="toast__body">
      ${title ? `<strong class="toast__title">${escapeHtml(title)}</strong>` : ""}
      <span>${escapeHtml(message)}</span>
    </div>
    <button type="button" class="toast__close" aria-label="Dismiss notification">
      ${icon("x")}
    </button>
  `;

  const remove = () => {
    if (!element.isConnected) return;
    element.classList.add("is-leaving");
    window.setTimeout(() => element.remove(), 200);
  };

  element.querySelector(".toast__close").addEventListener("click", remove);
  region.appendChild(element);

  while (region.children.length > MAX_TOASTS) {
    region.firstElementChild?.remove();
  }

  if (duration > 0) {
    window.setTimeout(remove, duration);
  }

  return remove;
}

export const toastSuccess = (message, options) => toast(message, "success", options);
export const toastError = (message, options) => toast(message, "error", options);
export const toastWarning = (message, options) => toast(message, "warning", options);
