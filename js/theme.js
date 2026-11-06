import { icon } from "./icons.js";

const STORAGE_KEY = "hmt-theme";
export const THEMES = ["system", "light", "dark"];

export function getStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function effectiveTheme() {
  const theme = getStoredTheme();
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function updateMetaThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", effectiveTheme() === "dark" ? "#0b1210" : "#f5f2ea");
  }
}

export function updateThemeToggles() {
  const dark = effectiveTheme() === "dark";
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.innerHTML = icon(dark ? "sun" : "moon");
    const label = dark ? "Switch to light theme" : "Switch to dark theme";
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
  });
}

export function applyTheme(theme, { persist = true } = {}) {
  const next = THEMES.includes(theme) ? theme : "system";
  if (next === "system") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = next;
  }

  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage may be unavailable in private mode */
    }
  }

  updateMetaThemeColor();
  updateThemeToggles();
  window.dispatchEvent(new CustomEvent("themechange", { detail: { theme: next } }));
  return next;
}

export function toggleTheme() {
  const next = effectiveTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}

export function initTheme() {
  applyTheme(getStoredTheme(), { persist: false });

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const handleSystemChange = () => {
    if (getStoredTheme() === "system") {
      updateMetaThemeColor();
      updateThemeToggles();
      window.dispatchEvent(new CustomEvent("themechange", { detail: { theme: "system" } }));
    }
  };
  media.addEventListener?.("change", handleSystemChange);

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      applyTheme(getStoredTheme(), { persist: false });
    }
  });
}

export function bindThemeToggle(button) {
  if (!button || button.dataset.themeBound === "true") return;
  button.dataset.themeBound = "true";
  updateThemeToggles();
  button.addEventListener("click", () => toggleTheme());
}
