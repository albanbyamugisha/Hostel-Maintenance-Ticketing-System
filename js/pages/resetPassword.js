import { updatePassword } from "../auth.js";
import { navigate } from "../router.js";
import { store, homeForRole } from "../store.js";
import { renderAuthLayout, authAlert, passwordField, bindPasswordToggles } from "../components/authLayout.js";
import { setButtonBusy, clearFormErrors, showFieldError } from "../ui.js";
import { toast } from "../toast.js";
import { errorMessage } from "../utils.js";
import { icon } from "../icons.js";

export default function resetPasswordPage() {
  if (!store.session) {
    renderAuthLayout({
      title: "This reset link has expired",
      subtitle: "Password reset links are single-use and time-limited for your security.",
      body: `
        <div class="stack">
          <div class="alert alert--warning">
            ${icon("alert-triangle")}
            <div>Open the most recent link from your email, or request a fresh one. If you are already signed in, use your profile page to change your password.</div>
          </div>
          <a class="btn btn--primary btn--block" href="#/forgot-password">
            ${icon("mail")} Request a new link
          </a>
          <a class="btn btn--secondary btn--block" href="#/login">Back to sign in</a>
        </div>
      `,
    });
    return;
  }

  renderAuthLayout({
    title: "Choose a new password",
    subtitle: `You are resetting the password for ${store.profile?.email || store.session.user.email}.`,
    body: `
      <div data-reset-alert hidden></div>

      <form class="auth-form" data-reset-form novalidate>
        ${passwordField({
          id: "reset-password",
          autocomplete: "new-password",
          label: "New password",
          hint: "At least 6 characters. Avoid reusing your old password.",
        })}

        <div class="field">
          <label class="field__label" for="reset-confirm">Confirm new password</label>
          <input type="password" id="reset-confirm" name="confirm" autocomplete="new-password"
            required aria-describedby="reset-confirm-error" />
          <p class="field__error" id="reset-confirm-error" data-error role="alert" hidden></p>
        </div>

        <button type="submit" class="btn btn--primary btn--block">
          ${icon("key")} Save new password
        </button>
      </form>

      <div class="alert alert--info mt-4">
        ${icon("shield-check")}
        <div>After saving, you will stay signed in on this device. Any other sessions keep their existing sign-in until they expire.</div>
      </div>
    `,
    footer: `
      <p class="auth-foot" style="margin-top: var(--s-5)">
        <a href="#/login">Cancel and return to sign in</a>
      </p>
    `,
  });

  bindPasswordToggles();

  const form = document.querySelector("[data-reset-form]");
  const passwordInput = form.querySelector("#reset-password");
  const passwordError = form.querySelector("#reset-password-error");
  const confirmInput = form.querySelector("#reset-confirm");
  const confirmError = form.querySelector("#reset-confirm-error");
  const alertBox = document.querySelector("[data-reset-alert]");
  const submitButton = form.querySelector("[type='submit']");

  [passwordInput, confirmInput].forEach((input) => {
    input.addEventListener("input", () => {
      input.removeAttribute("aria-invalid");
      (input === passwordInput ? passwordError : confirmError).hidden = true;
      alertBox.hidden = true;
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormErrors(form);
    alertBox.hidden = true;

    const password = passwordInput.value;
    const confirm = confirmInput.value;

    let invalid = false;
    if (password.length < 6) {
      showFieldError(passwordInput, passwordError, "Use at least 6 characters.");
      invalid = true;
    }
    if (confirm !== password) {
      showFieldError(confirmInput, confirmError, "Passwords do not match.");
      invalid = true;
    }
    if (invalid) return;

    setButtonBusy(submitButton, true, "Saving…");
    try {
      await updatePassword(password);
      toast("Password updated. You are signed in.", "success");
      navigate(homeForRole(store.profile?.role), { replace: true });
    } catch (error) {
      console.error(error);
      alertBox.innerHTML = authAlert(errorMessage(error, "Could not update your password."));
      alertBox.hidden = false;
      setButtonBusy(submitButton, false);
    }
  });
}
