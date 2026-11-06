import { icon } from "../icons.js";
import { escapeHtml } from "../utils.js";
import { bindThemeToggle, updateThemeToggles } from "../theme.js";

/**
 * Shared split-screen layout for sign-in, registration and password pages.
 */
export function renderAuthLayout({ title, subtitle = "", body, footer = "", wide = false }) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="auth-shell">
      <aside class="auth-panel" aria-label="About HostelCare">
        <a class="brand" href="#/login">
          <span class="brand__mark" aria-hidden="true">${icon("wrench")}</span>
          <span class="brand__text">
            <span class="brand__name">HostelCare</span>
            <span class="brand__sub">Maintenance desk</span>
          </span>
        </a>

        <div>
          <h2 class="auth-panel__headline">A fix is only a report away.</h2>
          <p class="auth-panel__lead">
            Report a fault, follow the repair and confirm the work — all in one calm,
            accountable place.
          </p>
          <ul class="auth-features">
            <li>${icon("camera")} Add photos so the right technician arrives prepared.</li>
            <li>${icon("activity")} Follow every status change in a clear audit trail.</li>
            <li>${icon("shield-check")} Explore separate resident, technician and administrator workspaces.</li>
          </ul>
        </div>

        <p class="auth-panel__foot">
          <span>Built for hostel teams</span>

        </p>
      </aside>

      <main class="auth-main">
        <div class="auth-card${wide ? " auth-card--wide" : ""}">
          <div class="auth-card__brand">
            <a class="brand" href="#/login" aria-label="HostelCare home">
              <span class="brand__mark" aria-hidden="true">${icon("wrench")}</span>
              <span class="brand__text">
                <span class="brand__name">HostelCare</span>
                <span class="brand__sub">Maintenance desk</span>
              </span>
            </a>
            <button type="button" class="icon-btn" data-theme-toggle aria-label="Toggle theme"></button>
          </div>

          <h1>${escapeHtml(title)}</h1>
          ${subtitle ? `<p class="auth-card__sub">${escapeHtml(subtitle)}</p>` : ""}

          ${body}
          ${footer}
        </div>

        <p class="auth-foot">
          &copy; ${new Date().getFullYear()} HostelCare

          <span aria-hidden="true">·</span>
          <a href="#/404">Help</a>
        </p>
      </main>
    </div>
  `;

  document.querySelectorAll("[data-theme-toggle]").forEach(bindThemeToggle);
  updateThemeToggles();
  document.title = `${title} · HostelCare`;
}

export function authAlert(message, type = "error") {
  return `
    <div class="alert alert--${escapeHtml(type)}" role="${type === "error" ? "alert" : "status"}">
      ${icon(type === "error" ? "alert-circle" : "info")}
      <div>${escapeHtml(message)}</div>
    </div>
  `;
}

export function passwordField({
  id,
  name = "password",
  label = "Password",
  autocomplete = "current-password",
  hint = "",
  minLength = 6,
}) {
  return `
    <div class="field">
      <label class="field__label" for="${id}">${escapeHtml(label)}</label>
      <div class="input-wrap">
        <input type="password" id="${id}" name="${name}" autocomplete="${escapeHtml(
          autocomplete
        )}" minlength="${minLength}" required aria-describedby="${id}-hint ${id}-error" />
        <button type="button" class="input-wrap__action" data-toggle-password="${id}"
          aria-label="Show password" aria-pressed="false">${icon("eye")}</button>
      </div>
      ${hint ? `<p class="field__hint" id="${id}-hint">${escapeHtml(hint)}</p>` : ""}
      <p class="field__error" id="${id}-error" data-error role="alert" hidden></p>
    </div>
  `;
}

export function bindPasswordToggles(root = document) {
  root.querySelectorAll("[data-toggle-password]").forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.togglePassword);
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute("aria-label", show ? "Hide password" : "Show password");
      button.setAttribute("aria-pressed", String(show));
    });
  });
}
