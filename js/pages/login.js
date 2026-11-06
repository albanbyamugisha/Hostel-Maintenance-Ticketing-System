import { signIn } from "../auth.js";
import { navigate } from "../router.js";
import { renderAuthLayout, authAlert, passwordField, bindPasswordToggles } from "../components/authLayout.js";
import { setButtonBusy, clearFormErrors, showFieldError } from "../ui.js";
import { toast } from "../toast.js";
import { escapeHtml, errorMessage, isEmail, safeNextPath } from "../utils.js";
import { icon } from "../icons.js";

export default function loginPage({ query }) {
  const next = safeNextPath(query.get("next"));
  const notice = query.get("notice");

  renderAuthLayout({
    title: "Welcome back",
    subtitle: "Sign in to report an issue, manage repairs or oversee hostel maintenance.",
    body: `
      <div data-login-alert hidden></div>

      ${
        notice === "signed-out"
          ? `<div class="alert alert--success mb-4">${icon(
              "check-circle"
            )}<div>You have been signed out safely.</div></div>`
          : ""
      }

      <form class="auth-form" data-login-form novalidate>
        <div class="field">
          <label class="field__label" for="login-email">Email address</label>
          <input type="email" id="login-email" name="email" autocomplete="email"
            inputmode="email" required autofocus aria-describedby="login-email-error" />
          <p class="field__error" id="login-email-error" data-error role="alert" hidden></p>
        </div>

        ${passwordField({
          id: "login-password",
          autocomplete: "current-password",
          label: "Password",
        })}

        <div class="auth-links">
          <span class="text-xs text-muted">Sign out when using a shared device.</span>
          <a href="#/forgot-password">Forgot password?</a>
        </div>

        <button type="submit" class="btn btn--primary btn--block">
          ${icon("log-in")} Sign in
        </button>
      </form>


    `,
    footer: `
      <p class="auth-foot" style="margin-top: var(--s-5)">
        New here? <a href="#/register">Create a resident account</a>
      </p>
    `,
  });

  bindPasswordToggles();

  const form = document.querySelector("[data-login-form]");
  const emailInput = form.querySelector("#login-email");
  const emailError = form.querySelector("#login-email-error");
  const passwordInput = form.querySelector("#login-password");
  const passwordError = form.querySelector("#login-password-error");
  const alertBox = document.querySelector("[data-login-alert]");
  const submitButton = form.querySelector("[type='submit']");

  const showAlert = (message) => {
    alertBox.innerHTML = authAlert(message);
    alertBox.hidden = false;
  };

  [emailInput, passwordInput].forEach((input) => {
    input.addEventListener("input", () => {
      input.removeAttribute("aria-invalid");
      const error = input === emailInput ? emailError : passwordError;
      if (error) error.hidden = true;
      alertBox.hidden = true;
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormErrors(form);
    alertBox.hidden = true;

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    let invalid = false;
    if (!email) {
      showFieldError(emailInput, emailError, "Enter your email address.");
      invalid = true;
    } else if (!isEmail(email)) {
      showFieldError(emailInput, emailError, "Enter a valid email address.");
      invalid = true;
    }
    if (!password) {
      showFieldError(passwordInput, passwordError, "Enter your password.");
      invalid = true;
    }
    if (invalid) return;

    setButtonBusy(submitButton, true, "Signing in…");
    try {
      await signIn(email, password);
      toast("Signed in. Welcome back.", "success");
      navigate(next || "/", { replace: true });
    } catch (error) {
      console.error(error);
      showAlert(errorMessage(error, "Could not sign in. Please try again."));
      setButtonBusy(submitButton, false);
      passwordInput.focus();
    }
  });
}
