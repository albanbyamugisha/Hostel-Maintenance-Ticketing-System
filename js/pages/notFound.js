import { icon } from "../icons.js";
import { bindThemeToggle, updateThemeToggles } from "../theme.js";
import { homeForRole } from "../store.js";
import { store } from "../store.js";

export default function notFoundPage() {
  const app = document.getElementById("app");
  const home = store.session && store.profile ? homeForRole(store.profile.role) : "/login";

  app.innerHTML = `
    <div class="auth-main">
      <div class="auth-card">
        <div class="auth-card__brand">
          <a class="brand" href="#/">
            <span class="brand__mark" aria-hidden="true">${icon("wrench")}</span>
            <span class="brand__text">
              <span class="brand__name">HostelCare</span>
              <span class="brand__sub">Maintenance desk</span>
            </span>
          </a>
          <button type="button" class="icon-btn" data-theme-toggle aria-label="Toggle theme"></button>
        </div>

        <div class="card">
          <div class="card__body stack">
            <span class="empty__icon">${icon("circle-help")}</span>
            <div>
              <p class="eyebrow">Error 404</p>
              <h1 class="page-title">We could not find that page</h1>
              <p class="page-sub">The link may be old, mistyped, or the ticket may have been removed.</p>
            </div>
            <div class="form-actions">
              <a class="btn btn--primary" href="#${home}">${icon("home")} Go to my home page</a>
              <a class="btn btn--secondary" href="#/notifications">${icon("bell")} Notifications</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll("[data-theme-toggle]").forEach(bindThemeToggle);
  updateThemeToggles();
  document.title = "Page not found · HostelCare";
}
