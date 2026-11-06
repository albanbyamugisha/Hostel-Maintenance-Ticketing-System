import { icon } from "./icons.js";
import { escapeHtml, errorMessage, uid } from "./utils.js";
import { toast } from "./toast.js";

/* --------------------------------------------------------------------------
   Modals with focus trapping and focus restoration
   -------------------------------------------------------------------------- */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function getFocusable(container) {
  return [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      !element.hasAttribute("hidden") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.offsetParent !== null
  );
}

export function openModal({
  title,
  subtitle = "",
  body = "",
  footer = "",
  wide = false,
  dismissible = true,
  onMount,
  onClose,
  initialFocus = "",
}) {
  const modalRoot = document.getElementById("modal-root") ?? document.body;
  const titleId = `modal-title-${uid()}`;
  const subtitleId = `modal-subtitle-${uid()}`;
  const previousFocus = document.activeElement;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <section class="modal${wide ? " modal--wide" : ""}" role="dialog" aria-modal="true"
      aria-labelledby="${titleId}"${subtitle ? ` aria-describedby="${subtitleId}"` : ""} tabindex="-1">
      <div class="modal__grab" aria-hidden="true"></div>
      <header class="modal__head">
        <div>
          <h2 id="${titleId}">${escapeHtml(title)}</h2>
          ${subtitle ? `<p class="modal__sub" id="${subtitleId}">${escapeHtml(subtitle)}</p>` : ""}
        </div>
        ${
          dismissible
            ? `<button type="button" class="icon-btn" data-modal-close aria-label="Close dialog">${icon(
                "x"
              )}</button>`
            : ""
        }
      </header>
      <div class="modal__body">${body}</div>
      ${footer ? `<footer class="modal__foot">${footer}</footer>` : ""}
    </section>
  `;

  modalRoot.appendChild(overlay);
  document.body.classList.add("modal-open");

  const modal = overlay.querySelector(".modal");
  let closed = false;

  const close = (reason = "dismiss") => {
    if (closed) return;
    closed = true;
    overlay.remove();
    if (!document.querySelector(".modal-overlay")) {
      document.body.classList.remove("modal-open");
    }
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }
    onClose?.(reason);
  };

  const handleKeydown = (event) => {
    if (event.key === "Escape" && dismissible) {
      event.preventDefault();
      close("escape");
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = getFocusable(modal);
    if (!focusable.length) {
      event.preventDefault();
      modal.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  overlay.addEventListener("keydown", handleKeydown);
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay && dismissible) close("overlay");
  });
  overlay.querySelector("[data-modal-close]")?.addEventListener("click", () => close("button"));

  onMount?.(modal, close);

  window.requestAnimationFrame(() => {
    const preferred =
      (initialFocus && modal.querySelector(initialFocus)) ||
      modal.querySelector("[data-autofocus]") ||
      getFocusable(modal)[0] ||
      modal;
    preferred?.focus({ preventScroll: true });
  });

  return { overlay, modal, close };
}

export function confirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  detailsHtml = "",
}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    openModal({
      title,
      body: `
        <p class="prose">${escapeHtml(message)}</p>
        ${detailsHtml}
      `,
      footer: `
        <button type="button" class="btn btn--secondary" data-cancel>${escapeHtml(
          cancelLabel
        )}</button>
        <button type="button" class="btn ${danger ? "btn--danger" : "btn--primary"}" data-confirm>
          ${escapeHtml(confirmLabel)}
        </button>
      `,
      initialFocus: "[data-confirm]",
      onMount(dialog, closeDialog) {
        dialog.querySelector("[data-cancel]").addEventListener("click", () => closeDialog("cancel"));
        dialog.querySelector("[data-confirm]").addEventListener("click", () => {
          finish(true);
          closeDialog("confirm");
        });
      },
      onClose() {
        finish(false);
      },
    });
  });
}

export function promptDialog({
  title,
  label,
  placeholder = "",
  confirmLabel = "Submit",
  cancelLabel = "Cancel",
  helper = "",
  minLength = 1,
  maxLength = 1000,
  danger = false,
  initialValue = "",
}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const fieldId = `prompt-${uid()}`;

    const { modal, close } = openModal({
      title,
      body: `
        <form class="stack" data-prompt-form novalidate>
          <div class="field">
            <label class="field__label" for="${fieldId}">
              ${escapeHtml(label)}
              <span class="req" aria-hidden="true">*</span>
            </label>
            <textarea id="${fieldId}" name="value" rows="4" maxlength="${maxLength}"
              placeholder="${escapeHtml(placeholder)}" data-autofocus
              aria-describedby="${fieldId}-hint ${fieldId}-error"
              required>${escapeHtml(initialValue)}</textarea>
            <div class="row-between">
              <p class="field__hint" id="${fieldId}-hint">${escapeHtml(helper)}</p>
              <span class="char-count" data-count>${initialValue.length}/${maxLength}</span>
            </div>
            <p class="field__error" id="${fieldId}-error" data-error role="alert" hidden></p>
          </div>
        </form>
      `,
      footer: `
        <button type="button" class="btn btn--secondary" data-cancel>${escapeHtml(cancelLabel)}</button>
        <button type="button" class="btn ${danger ? "btn--danger" : "btn--primary"}" data-submit>
          ${escapeHtml(confirmLabel)}
        </button>
      `,
      onMount(dialog, closeDialog) {
        const form = dialog.querySelector("[data-prompt-form]");
        const textarea = form.querySelector("textarea");
        const error = form.querySelector("[data-error]");
        const counter = form.querySelector("[data-count]");

        const updateCounter = () => {
          counter.textContent = `${textarea.value.length}/${maxLength}`;
          counter.dataset.over = String(textarea.value.length > maxLength);
        };
        textarea.addEventListener("input", () => {
          updateCounter();
          textarea.removeAttribute("aria-invalid");
          error.hidden = true;
        });
        updateCounter();

        const submit = () => {
          const value = textarea.value.trim();
          if (value.length < minLength) {
            textarea.setAttribute("aria-invalid", "true");
            error.textContent = `Please enter at least ${minLength} character${
              minLength === 1 ? "" : "s"
            }.`;
            error.hidden = false;
            textarea.focus();
            return;
          }
          finish(value);
          closeDialog("submit");
        };

        dialog.querySelector("[data-cancel]").addEventListener("click", () => closeDialog("cancel"));
        dialog.querySelector("[data-submit]").addEventListener("click", submit);
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          submit();
        });
        textarea.addEventListener("keydown", (event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
          }
        });
      },
      onClose() {
        finish(null);
      },
    });

    modal.querySelector("textarea")?.focus({ preventScroll: true });
    return close;
  });
}

/* --------------------------------------------------------------------------
   Form helpers
   -------------------------------------------------------------------------- */
export function setButtonBusy(button, busy, busyLabel = "Working…") {
  if (!button) return;
  if (busy) {
    if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${escapeHtml(
      busyLabel
    )}</span>`;
  } else {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }
}

export function showFieldError(input, errorElement, message) {
  input?.setAttribute("aria-invalid", "true");
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.hidden = false;
  }
}

export function clearFieldError(input, errorElement) {
  input?.removeAttribute("aria-invalid");
  if (errorElement) {
    errorElement.textContent = "";
    errorElement.hidden = true;
  }
}

export function clearFormErrors(form) {
  form?.querySelectorAll("[aria-invalid='true']").forEach((field) => {
    field.removeAttribute("aria-invalid");
  });
  form?.querySelectorAll("[data-error]").forEach((error) => {
    error.textContent = "";
    error.hidden = true;
  });
}

export function handleError(error, fallback = "Something went wrong. Please try again.") {
  console.error(error);
  toast(errorMessage(error, fallback), "error", { title: "Action failed" });
}

/* --------------------------------------------------------------------------
   States
   -------------------------------------------------------------------------- */
export function emptyState({
  iconName = "inbox",
  title,
  text,
  actionHtml = "",
  element = "div",
}) {
  return `
    <${element} class="empty">
      <span class="empty__icon">${icon(iconName)}</span>
      <div class="stack-sm" style="align-items:center">
        <h3>${escapeHtml(title)}</h3>
        ${text ? `<p>${escapeHtml(text)}</p>` : ""}
      </div>
      ${actionHtml}
    </${element}>
  `;
}

export function errorState({
  title = "Could not load this page",
  text = "Please refresh and try again.",
  actionHtml = "",
}) {
  return emptyState({ iconName: "alert-circle", title, text, actionHtml });
}

export function skeletonList(count = 3) {
  return `<div class="skeleton-stack" aria-hidden="true">${Array.from(
    { length: count },
    () => `
      <div class="card">
        <div class="card__body stack">
          <div class="skeleton skeleton--text-sm"></div>
          <div class="skeleton skeleton--title"></div>
          <div class="skeleton skeleton--text"></div>
          <div class="skeleton skeleton--text-sm"></div>
        </div>
      </div>`
  ).join("")}</div>`;
}

export function skeletonKpis(count = 4) {
  return `<div class="kpi-grid" aria-hidden="true">${Array.from(
    { length: count },
    () => '<div class="skeleton skeleton--kpi"></div>'
  ).join("")}</div>`;
}

export function loadingBlock(label = "Loading…") {
  return `<div class="loading-block" role="status"><span class="spinner" aria-hidden="true"></span>${escapeHtml(
    label
  )}</div>`;
}

/* --------------------------------------------------------------------------
   Photos / lightbox
   -------------------------------------------------------------------------- */
export function openLightbox(url, alt = "Ticket photo") {
  const element = document.createElement("div");
  element.className = "lightbox";
  element.setAttribute("role", "dialog");
  element.setAttribute("aria-modal", "true");
  element.setAttribute("aria-label", "Photo viewer");
  element.innerHTML = `
    <button type="button" class="icon-btn lightbox__close" aria-label="Close photo viewer">
      ${icon("x")}
    </button>
    <img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" />
    <p class="lightbox__caption">Press Escape to close</p>
  `;
  document.body.appendChild(element);
  const previousFocus = document.activeElement;
  const close = () => {
    element.remove();
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }
  };
  element.querySelector(".lightbox__close").addEventListener("click", close);
  element.addEventListener("click", (event) => {
    if (event.target === element) close();
  });
  element.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  window.requestAnimationFrame(() => element.querySelector("button")?.focus());
}

/* --------------------------------------------------------------------------
   Clipboard
   -------------------------------------------------------------------------- */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(String(text));
    toast("Copied to clipboard.", "success", { duration: 2200 });
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = String(text);
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    toast(copied ? "Copied to clipboard." : "Could not copy.", copied ? "success" : "error", {
      duration: 2400,
    });
    return copied;
  }
}

/* --------------------------------------------------------------------------
   Star rating input
   -------------------------------------------------------------------------- */
export function starsInputHtml({ legend = "Rate the repair (optional)" } = {}) {
  return `
    <fieldset class="star-input" data-star-input>
      <legend>${escapeHtml(legend)}</legend>
      <input type="hidden" name="rating" value="0" data-rating-value />
      <div class="star-input__row" role="group" aria-label="Star rating, 1 to 5">
        ${[1, 2, 3, 4, 5]
          .map(
            (value) => `
          <button type="button" class="star-input__btn" data-value="${value}"
            aria-label="${value} star${value === 1 ? "" : "s"}" aria-pressed="false">
            ${icon("star")}
          </button>`
          )
          .join("")}
      </div>
    </fieldset>
  `;
}

export function bindStarInput(container) {
  const input = container.querySelector("[data-rating-value]");
  const buttons = [...container.querySelectorAll("[data-value]")];
  if (!input || !buttons.length) return { getValue: () => 0 };

  const setValue = (value) => {
    input.value = String(value);
    buttons.forEach((button) => {
      const active = Number(button.dataset.value) <= value;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(Number(button.dataset.value) === value));
    });
  };

  buttons.forEach((button, index) => {
    button.addEventListener("click", () => setValue(Number(button.dataset.value)));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      let next = index;
      if (event.key === "ArrowLeft") next = Math.max(0, index - 1);
      if (event.key === "ArrowRight") next = Math.min(buttons.length - 1, index + 1);
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = buttons.length - 1;
      buttons[next].focus();
      setValue(Number(buttons[next].dataset.value));
    });
  });

  return {
    getValue: () => Number(input.value) || null,
    reset: () => setValue(0),
  };
}
