import { signUp } from "../auth.js";
import { navigate } from "../router.js";
import {
  renderAuthLayout,
  authAlert,
  passwordField,
  bindPasswordToggles,
} from "../components/authLayout.js";
import { setButtonBusy, clearFormErrors, showFieldError } from "../ui.js";
import { toast } from "../toast.js";
import { errorMessage, isEmail } from "../utils.js";
import { icon } from "../icons.js";

const PHONE_PATTERN = /^\+?[\d\s()-]{7,20}$/;

export default function registerPage() {
  renderAuthLayout({
    title: "Create your account",
    subtitle:
      "Resident accounts can report issues and follow repairs. Staff accounts are created by the maintenance desk.",
    body: `
      <div data-register-alert hidden></div>

      <form class="auth-form" data-register-form novalidate>
        <div class="field">
          <label class="field__label" for="reg-name">
            Full name <span class="req" aria-hidden="true">*</span>
          </label>
          <input type="text" id="reg-name" name="full_name" autocomplete="name"
            maxlength="80" required aria-describedby="reg-name-error" autofocus />
          <p class="field__error" id="reg-name-error" data-error role="alert" hidden></p>
        </div>

        <div class="field">
          <label class="field__label" for="reg-email">
            Email address <span class="req" aria-hidden="true">*</span>
          </label>
          <input type="email" id="reg-email" name="email" autocomplete="email"
            inputmode="email" required aria-describedby="reg-email-error" />
          <p class="field__error" id="reg-email-error" data-error role="alert" hidden></p>
        </div>

        <div class="form-grid form-grid--2">
          <div class="field">
            <label class="field__label" for="reg-phone">Phone number</label>
            <input type="tel" id="reg-phone" name="phone" autocomplete="tel"
              inputmode="tel" maxlength="20" placeholder="+254 700 000 000"
              aria-describedby="reg-phone-hint reg-phone-error" />
            <p class="field__hint" id="reg-phone-hint">Optional, used by the technician.</p>
            <p class="field__error" id="reg-phone-error" data-error role="alert" hidden></p>
          </div>

          <div class="field">
            <label class="field__label" for="reg-block">Hostel block</label>
            <input type="text" id="reg-block" name="block" list="block-options"
              maxlength="20" placeholder="Block A" aria-describedby="reg-block-error" />
            <datalist id="block-options">
              <option value="Block A"></option>
              <option value="Block B"></option>
              <option value="Block C"></option>
              <option value="Block D"></option>
            </datalist>
            <p class="field__error" id="reg-block-error" data-error role="alert" hidden></p>
          </div>
        </div>

        <div class="field">
          <label class="field__label" for="reg-room">Room number</label>
          <input type="text" id="reg-room" name="room_number" maxlength="10"
            placeholder="e.g. 201" aria-describedby="reg-room-error" />
          <p class="field__error" id="reg-room-error" data-error role="alert" hidden></p>
        </div>

        ${passwordField({
          id: "reg-password",
          autocomplete: "new-password",
          label: "Password",
          hint: "At least 6 characters. Use a mix of letters and numbers.",
        })}

        <div class="field">
          <label class="field__label" for="reg-confirm">Confirm password</label>
          <input type="password" id="reg-confirm" name="confirm" autocomplete="new-password"
            required aria-describedby="reg-confirm-error" />
          <p class="field__error" id="reg-confirm-error" data-error role="alert" hidden></p>
        </div>

        <label class="checkbox-field">
          <input type="checkbox" name="terms" required />
          <span>I understand this account is for reporting genuine maintenance issues and that misuse may be reviewed by the hostel team.</span>
        </label>

        <button type="submit" class="btn btn--primary btn--block">
          ${icon("user-plus")} Create account
        </button>
      </form>
    `,
    footer: `
      <p class="auth-foot" style="margin-top: var(--s-5)">
        Already have an account? <a href="#/login">Sign in</a>
      </p>
    `,
  });

  bindPasswordToggles();

  const form = document.querySelector("[data-register-form]");
  const alertBox = document.querySelector("[data-register-alert]");
  const submitButton = form.querySelector("[type='submit']");

  const fields = {
    name: form.querySelector("#reg-name"),
    email: form.querySelector("#reg-email"),
    phone: form.querySelector("#reg-phone"),
    block: form.querySelector("#reg-block"),
    room: form.querySelector("#reg-room"),
    password: form.querySelector("#reg-password"),
    confirm: form.querySelector("#reg-confirm"),
    terms: form.querySelector("input[name='terms']"),
  };

  const errors = {
    name: form.querySelector("#reg-name-error"),
    email: form.querySelector("#reg-email-error"),
    phone: form.querySelector("#reg-phone-error"),
    block: form.querySelector("#reg-block-error"),
    room: form.querySelector("#reg-room-error"),
    password: form.querySelector("#reg-password-error"),
    confirm: form.querySelector("#reg-confirm-error"),
  };

  form.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", () => {
      input.removeAttribute("aria-invalid");
      const key = Object.keys(fields).find((name) => fields[name] === input);
      if (key && errors[key]) errors[key].hidden = true;
      alertBox.hidden = true;
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormErrors(form);
    alertBox.hidden = true;

    const fullName = fields.name.value.trim();
    const email = fields.email.value.trim();
    const phone = fields.phone.value.trim();
    const block = fields.block.value.trim();
    const room = fields.room.value.trim();
    const password = fields.password.value;
    const confirm = fields.confirm.value;

    let invalid = false;
    if (fullName.length < 2) {
      showFieldError(fields.name, errors.name, "Enter your full name.");
      invalid = true;
    }
    if (!email) {
      showFieldError(fields.email, errors.email, "Enter your email address.");
      invalid = true;
    } else if (!isEmail(email)) {
      showFieldError(fields.email, errors.email, "Enter a valid email address.");
      invalid = true;
    }
    if (phone && !PHONE_PATTERN.test(phone)) {
      showFieldError(fields.phone, errors.phone, "Enter a valid phone number.");
      invalid = true;
    }
    if (block.length > 20) {
      showFieldError(fields.block, errors.block, "Block name must be 20 characters or fewer.");
      invalid = true;
    }
    if (room.length > 10) {
      showFieldError(fields.room, errors.room, "Room number must be 10 characters or fewer.");
      invalid = true;
    }
    if (password.length < 6) {
      showFieldError(fields.password, errors.password, "Use at least 6 characters.");
      invalid = true;
    }
    if (confirm !== password) {
      showFieldError(fields.confirm, errors.confirm, "Passwords do not match.");
      invalid = true;
    }
    if (!fields.terms.checked) {
      alertBox.innerHTML = authAlert("Please confirm the acceptable-use statement.");
      alertBox.hidden = false;
      invalid = true;
    }
    if (invalid) {
      form.querySelector("[aria-invalid='true']")?.focus();
      return;
    }

    setButtonBusy(submitButton, true, "Creating account…");
    try {
      const data = await signUp({
        fullName,
        email,
        password,
        phone,
        block,
        roomNumber: room,
      });

      if (data.session) {
        toast("Account created. Welcome to HostelCare.", "success");
        navigate("/", { replace: true });
      } else {
        navigate("/login?notice=check-email", { replace: true });
      }
    } catch (error) {
      console.error(error);
      alertBox.innerHTML = authAlert(errorMessage(error, "Could not create your account."));
      alertBox.hidden = false;
      setButtonBusy(submitButton, false);
    }
  });
}
