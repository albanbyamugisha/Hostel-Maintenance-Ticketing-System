import { refreshProfile, updatePassword } from "../auth.js";
import { updateMyProfile } from "../api.js";
import { refreshShell } from "../appShell.js";
import { store } from "../store.js";
import { pageHeader } from "../components/pageBits.js";
import { passwordField, bindPasswordToggles } from "../components/authLayout.js";
import {
  clearFormErrors,
  handleError,
  setButtonBusy,
  showFieldError,
} from "../ui.js";
import { toast } from "../toast.js";
import { icon } from "../icons.js";
import { applyTheme, getStoredTheme, THEMES } from "../theme.js";
import {
  avatarHtml,
  escapeHtml,
  formatDate,
  initials,
  roleLabel,
  rolePill,
  specialtyLabel,
} from "../utils.js";

const PHONE_PATTERN = /^\+?[\d\s()-]{7,20}$/;
const THEME_LABELS = { system: "System", light: "Light", dark: "Dark" };

function accountSummary(profile) {
  const residence = [profile.block, profile.room_number].filter(Boolean).join(" · ");
  return `
    <div class="stack-sm">
      <div class="row" style="gap:0.75rem">
        <span class="avatar avatar--lg" data-account-avatar aria-hidden="true">${escapeHtml(
          initials(profile.full_name)
        )}</span>
        <div class="stack-sm" style="gap:0.1rem;min-width:0">
          <strong class="truncate" data-account-name>${escapeHtml(profile.full_name)}</strong>
          <span class="text-sm text-muted" data-account-email>${escapeHtml(
            profile.email || "No email on record"
          )}</span>
        </div>
      </div>
      <div class="row" style="gap:0.4rem;flex-wrap:wrap">
        ${rolePill(profile.role)}
        ${
          profile.is_active
            ? '<span class="badge badge--success">Active</span>'
            : '<span class="badge badge--outline">Inactive</span>'
        }
      </div>
    </div>
    <dl class="meta-grid" style="margin-top:var(--s-4)">
      <div class="meta">
        <dt class="meta__label">Role</dt>
        <dd class="meta__value">${escapeHtml(roleLabel(profile.role))}</dd>
      </div>
      ${
        profile.role === "technician"
          ? `<div class="meta">
              <dt class="meta__label">Specialty</dt>
              <dd class="meta__value">${escapeHtml(specialtyLabel(profile.specialty))}</dd>
            </div>`
          : ""
      }
      <div class="meta">
        <dt class="meta__label">Residence</dt>
        <dd class="meta__value" data-account-residence>${escapeHtml(
          residence || "Not set"
        )}</dd>
      </div>
      <div class="meta">
        <dt class="meta__label">Member since</dt>
        <dd class="meta__value">${escapeHtml(formatDate(profile.created_at))}</dd>
      </div>
    </dl>
  `;
}

function themePicker(current) {
  return `
    <div class="segmented" role="radiogroup" aria-label="Colour theme">
      ${THEMES.map(
        (theme) => `
          <label>
            <input type="radio" name="theme" value="${theme}" ${
          theme === current ? "checked" : ""
        } />
            <span>${escapeHtml(THEME_LABELS[theme])}</span>
          </label>
        `
      ).join("")}
    </div>
    <p class="field__hint" style="margin-top:var(--s-2)">
      System follows your device's light or dark preference.
    </p>
  `;
}

export default async function profilePage({ container, setTitle, onCleanup }) {
  const profile = store.profile;
  setTitle("Your profile", "Profile");

  if (!profile) {
    container.innerHTML = `<div class="page">${pageHeader({
      title: "Your profile",
      subtitle: "We could not load your account details. Please refresh.",
    })}</div>`;
    return;
  }

  container.innerHTML = `
    <div class="page">
      ${pageHeader({
        eyebrow: "Account",
        title: "Your profile",
        subtitle:
          "Keep your contact details up to date so technicians can reach you, and manage how HostelCare looks.",
      })}

      <div class="dashboard-grid">
        <div class="dashboard-main stack">
          <section class="card">
            <div class="card__head">
              <div>
                <h2>Personal details</h2>
                <p class="section-head__sub">Used on your tickets and notifications.</p>
              </div>
            </div>
            <form data-profile-form novalidate>
              <div class="card__body stack">
                <div class="form-grid form-grid--2">
                  <div class="field">
                    <label class="field__label" for="profile-name">
                      Full name <span class="req" aria-hidden="true">*</span>
                    </label>
                    <input type="text" id="profile-name" name="full_name" autocomplete="name"
                      maxlength="80" required value="${escapeHtml(profile.full_name)}"
                      aria-describedby="profile-name-error" />
                    <p class="field__error" id="profile-name-error" data-error role="alert" hidden></p>
                  </div>
                  <div class="field">
                    <label class="field__label" for="profile-phone">Phone number</label>
                    <input type="tel" id="profile-phone" name="phone" autocomplete="tel"
                      inputmode="tel" maxlength="20" value="${escapeHtml(profile.phone || "")}"
                      placeholder="+254 700 000 000"
                      aria-describedby="profile-phone-hint profile-phone-error" />
                    <p class="field__hint" id="profile-phone-hint">
                      Optional contact number for your account.
                    </p>
                    <p class="field__error" id="profile-phone-error" data-error role="alert" hidden></p>
                  </div>
                </div>

                <div class="form-grid form-grid--2">
                  <div class="field">
                    <label class="field__label" for="profile-block">Hostel block</label>
                    <input type="text" id="profile-block" name="block" list="profile-blocks"
                      maxlength="20" value="${escapeHtml(profile.block || "")}"
                      placeholder="Block A" aria-describedby="profile-block-error" />
                    <datalist id="profile-blocks">
                      <option value="Block A"></option>
                      <option value="Block B"></option>
                      <option value="Block C"></option>
                      <option value="Block D"></option>
                    </datalist>
                    <p class="field__error" id="profile-block-error" data-error role="alert" hidden></p>
                  </div>
                  <div class="field">
                    <label class="field__label" for="profile-room">Room number</label>
                    <input type="text" id="profile-room" name="room_number" maxlength="10"
                      value="${escapeHtml(profile.room_number || "")}" placeholder="e.g. 201"
                      aria-describedby="profile-room-error" />
                    <p class="field__error" id="profile-room-error" data-error role="alert" hidden></p>
                  </div>
                </div>

                <div class="form-grid form-grid--2">
                  <div class="field">
                    <label class="field__label" for="profile-email">Email address</label>
                    <input type="email" id="profile-email" value="${escapeHtml(
                      profile.email || ""
                    )}" readonly disabled />
                    <p class="field__hint">Contact the maintenance desk to change your email.</p>
                  </div>
                  <div class="field">
                    <span class="field__label">Account role</span>
                    <p style="min-height:44px;display:flex;align-items:center">
                      ${rolePill(profile.role)}
                    </p>
                    <p class="field__hint">Roles are managed by an administrator.</p>
                  </div>
                </div>
              </div>
              <div class="card__foot">
                <button type="submit" class="btn btn--primary" data-save-profile>
                  ${icon("check")} Save changes
                </button>
              </div>
            </form>
          </section>

          <section class="card">
            <div class="card__head">
              <div>
                <h2>Password</h2>
                <p class="section-head__sub">Use at least 6 characters. You stay signed in after updating.</p>
              </div>
            </div>
            <form data-password-form novalidate>
              <div class="card__body stack">
                ${passwordField({
                  id: "profile-new-password",
                  name: "new_password",
                  label: "New password",
                  autocomplete: "new-password",
                  hint: "Mix letters, numbers and symbols for a stronger password.",
                })}
                <div class="field">
                  <label class="field__label" for="profile-confirm-password">
                    Confirm new password <span class="req" aria-hidden="true">*</span>
                  </label>
                  <div class="input-wrap">
                    <input type="password" id="profile-confirm-password" name="confirm_password"
                      autocomplete="new-password" minlength="6" required
                      aria-describedby="profile-confirm-password-error" />
                    <button type="button" class="input-wrap__action"
                      data-toggle-password="profile-confirm-password"
                      aria-label="Show password" aria-pressed="false">${icon("eye")}</button>
                  </div>
                  <p class="field__error" id="profile-confirm-password-error" data-error role="alert" hidden></p>
                </div>
              </div>
              <div class="card__foot">
                <button type="submit" class="btn btn--secondary" data-save-password>
                  ${icon("key")} Update password
                </button>
              </div>
            </form>
          </section>
        </div>

        <aside class="dashboard-side stack">
          <section class="card">
            <div class="card__head">
              <h2>Account</h2>
            </div>
            <div class="card__body">
              ${accountSummary(profile)}
            </div>
          </section>

          <section class="card">
            <div class="card__head">
              <div>
                <h2>Appearance</h2>
                <p class="section-head__sub">Saved on this device.</p>
              </div>
            </div>
            <div class="card__body">
              ${themePicker(getStoredTheme())}
            </div>
          </section>

          <section class="card">
            <div class="card__head">
              <h2>Session</h2>
            </div>
            <div class="card__body stack-sm">
              <p class="text-sm text-muted">
                Signed in${profile.email ? ` as ${escapeHtml(profile.email)}` : ""}. Signing out
                clears this device's session.
              </p>
              <button type="button" class="btn btn--secondary" data-sign-out>
                ${icon("logout")} Sign out
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  `;

  bindPasswordToggles(container);

  const profileForm = container.querySelector("[data-profile-form]");
  const passwordForm = container.querySelector("[data-password-form]");
  const profileFields = {
    name: profileForm.querySelector("#profile-name"),
    phone: profileForm.querySelector("#profile-phone"),
    block: profileForm.querySelector("#profile-block"),
    room: profileForm.querySelector("#profile-room"),
    errors: {
      name: profileForm.querySelector("#profile-name-error"),
      phone: profileForm.querySelector("#profile-phone-error"),
      block: profileForm.querySelector("#profile-block-error"),
      room: profileForm.querySelector("#profile-room-error"),
    },
  };

  const validateProfile = () => {
    clearFormErrors(profileForm);
    let valid = true;
    const name = profileFields.name.value.trim();
    const phone = profileFields.phone.value.trim();
    const block = profileFields.block.value.trim();
    const room = profileFields.room.value.trim();

    if (name.length < 2) {
      showFieldError(
        profileFields.name,
        profileFields.errors.name,
        "Enter your full name (at least 2 characters)."
      );
      valid = false;
    } else if (name.length > 80) {
      showFieldError(
        profileFields.name,
        profileFields.errors.name,
        "Keep your name under 80 characters."
      );
      valid = false;
    }

    if (phone && !PHONE_PATTERN.test(phone)) {
      showFieldError(
        profileFields.phone,
        profileFields.errors.phone,
        "Enter a valid phone number, for example +254 700 000 000."
      );
      valid = false;
    }

    if (block.length > 20) {
      showFieldError(
        profileFields.block,
        profileFields.errors.block,
        "Keep the block name under 20 characters."
      );
      valid = false;
    }

    if (room.length > 10) {
      showFieldError(
        profileFields.room,
        profileFields.errors.room,
        "Keep the room number under 10 characters."
      );
      valid = false;
    }

    return valid ? { name, phone, block, room } : null;
  };

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    const values = validateProfile();
    if (!values) return;

    const button = profileForm.querySelector("[data-save-profile]");
    setButtonBusy(button, true, "Saving…");

    try {
      const updated = await updateMyProfile(profile.id, {
        full_name: values.name,
        phone: values.phone,
        block: values.block,
        room_number: values.room,
      });
      await refreshProfile();
      refreshShell();

      const nameNode = container.querySelector("[data-account-name]");
      if (nameNode) nameNode.textContent = updated.full_name;
      const avatar = container.querySelector("[data-account-avatar]");
      if (avatar) avatar.textContent = initials(updated.full_name);
      const residence = container.querySelector("[data-account-residence]");
      if (residence) {
        residence.textContent =
          [updated.block, updated.room_number].filter(Boolean).join(" · ") || "Not set";
      }

      toast("Your profile has been updated.", "success", { title: "Saved" });
    } catch (error) {
      handleError(error, "Could not save your profile.");
    } finally {
      setButtonBusy(button, false);
    }
  };

  const passwordFields = {
    next: passwordForm.querySelector("#profile-new-password"),
    confirm: passwordForm.querySelector("#profile-confirm-password"),
    nextError: passwordForm.querySelector("#profile-new-password-error"),
    confirmError: passwordForm.querySelector("#profile-confirm-password-error"),
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    clearFormErrors(passwordForm);

    const next = passwordFields.next.value;
    const confirm = passwordFields.confirm.value;
    let valid = true;

    if (next.length < 6) {
      showFieldError(
        passwordFields.next,
        passwordFields.nextError,
        "Use at least 6 characters."
      );
      valid = false;
    }
    if (confirm !== next) {
      showFieldError(
        passwordFields.confirm,
        passwordFields.confirmError,
        "Passwords do not match."
      );
      valid = false;
    }
    if (!valid) return;

    const button = passwordForm.querySelector("[data-save-password]");
    setButtonBusy(button, true, "Updating…");

    try {
      await updatePassword(next);
      passwordForm.reset();
      toast("Your password has been updated.", "success", { title: "Password changed" });
    } catch (error) {
      handleError(error, "Could not update your password.");
    } finally {
      setButtonBusy(button, false);
    }
  };

  const handleThemeChange = (event) => {
    const input = event.target.closest("input[name='theme']");
    if (!input) return;
    applyTheme(input.value);
    toast(`Theme set to ${THEME_LABELS[input.value] ?? input.value}.`, "info", {
      duration: 1800,
    });
  };

  profileForm.addEventListener("submit", handleProfileSubmit);
  passwordForm.addEventListener("submit", handlePasswordSubmit);
  container.addEventListener("change", handleThemeChange);

  onCleanup(() => {
    container.removeEventListener("change", handleThemeChange);
  });
}
