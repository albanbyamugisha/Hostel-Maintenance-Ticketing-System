import { openCreateTechnicianModal } from "../components/createTechnicianModal.js";
import { adminResetPassword } from "../auth.js";
import { adminUpdateUser, getProfiles } from "../api.js";
import { kpiGrid, pageHeader, paginationHtml } from "../components/pageBits.js";
import {
  emptyState,
  errorState,
  handleError,
  loadingBlock,
  openModal,
  setButtonBusy,
  skeletonKpis,
} from "../ui.js";
import { toast } from "../toast.js";
import { icon } from "../icons.js";
import {
  avatarHtml,
  debounce,
  escapeHtml,
  formatDate,
  pluralize,
  roleLabel,
  rolePill,
  specialtyLabel,
} from "../utils.js";

const PAGE_SIZE = 10;
const ROLE_ORDER = { admin: 0, technician: 1, resident: 2 };
const ROLES = ["resident", "technician", "admin"];
const SPECIALTIES = [
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "carpentry_structure", label: "Carpentry & structure" },
  { value: "general", label: "General maintenance" },
];

function sortUsers(users) {
  return [...users].sort((a, b) => {
    const role = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9);
    if (role) return role;
    return String(a.full_name ?? "").localeCompare(String(b.full_name ?? ""));
  });
}

function contactLine(user) {
  const parts = [];
  if (user.phone) parts.push(user.phone);
  const residence = [user.block, user.room_number].filter(Boolean).join(" · ");
  if (residence) parts.push(residence);
  return parts.join(" · ");
}

function userRow(user, currentUserId) {
  const isSelf = user.id === currentUserId;
  const contact = contactLine(user);

  return `
    <tr>
      <td class="cell-title" data-label="">
        <span class="row" style="gap:0.5rem">
          ${avatarHtml(user.full_name, user.role, "avatar--sm")}
          <span class="stack-sm" style="gap:0">
            <span>
              <strong>${escapeHtml(user.full_name)}</strong>
              ${isSelf ? '<span class="role-pill" style="margin-left:0.3rem">You</span>' : ""}
            </span>
            <span class="cell-sub">${escapeHtml(user.email || "No email on record")}</span>
          </span>
        </span>
      </td>
      <td data-label="Role">${rolePill(user.role)}</td>
      <td data-label="Specialty">${escapeHtml(
        user.role === "technician" ? specialtyLabel(user.specialty) : "—"
      )}</td>
      <td data-label="Contact">
        ${contact ? escapeHtml(contact) : '<span class="text-muted">—</span>'}
      </td>
      <td data-label="Status">
        ${
          user.is_active
            ? '<span class="badge badge--success">Active</span>'
            : '<span class="badge badge--outline">Inactive</span>'
        }
      </td>
      <td data-label="Joined">${escapeHtml(formatDate(user.created_at))}</td>
      <td class="cell-actions" data-label="">
        <button type="button" class="btn btn--secondary btn--sm" data-edit="${escapeHtml(
          user.id
        )}">${icon("edit")} Edit</button>
      </td>
    </tr>
  `;
}

function tableHtml(users, currentUserId) {
  return `
    <div class="table-wrap">
      <table class="table table--stack">
        <thead>
          <tr>
            <th scope="col">Person</th>
            <th scope="col">Role</th>
            <th scope="col">Specialty</th>
            <th scope="col">Contact</th>
            <th scope="col">Status</th>
            <th scope="col">Joined</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>${users.map((user) => userRow(user, currentUserId)).join("")}</tbody>
      </table>
    </div>
  `;
}

function roleChips(active, counts) {
  return `
    <div class="chip-row" role="group" aria-label="Filter by role">
      ${["all", ...ROLES]
        .map(
          (role) => `
            <button type="button" class="chip" data-role-filter="${role}"
              aria-pressed="${active === role}">
              ${escapeHtml(role === "all" ? "Everyone" : roleLabel(role))}
              <span class="chip__count">${counts[role] ?? 0}</span>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function openEditUserModal({ user, currentUserId, onSaved }) {
  const isSelf = user.id === currentUserId;
  const specialtyOptions = SPECIALTIES.map(
    (specialty) =>
      `<option value="${specialty.value}" ${
        specialty.value === user.specialty ? "selected" : ""
      }>${escapeHtml(specialty.label)}</option>`
  ).join("");

  const { modal, close } = openModal({
    title: isSelf ? "Your account" : `Edit ${user.full_name}`,
    subtitle: user.email || "No email on record",
    body: `
      <form class="stack" data-user-form novalidate>
        ${
          isSelf
            ? `<div class="alert alert--info">${icon(
                "shield-check"
              )}<div>You cannot demote or deactivate your own admin account. Another admin must make that change.</div></div>`
            : `<div class="alert alert--info">${icon(
                "info"
              )}<div>Changing a role takes effect immediately. Deactivated accounts are signed out and cannot use the app.</div></div>`
        }

        <div class="meta-grid">
          <div class="meta">
            <span class="meta__label">Name</span>
            <span class="meta__value">${escapeHtml(user.full_name)}</span>
          </div>
          <div class="meta">
            <span class="meta__label">Joined</span>
            <span class="meta__value">${escapeHtml(formatDate(user.created_at))}</span>
          </div>
          <div class="meta">
            <span class="meta__label">Residence</span>
            <span class="meta__value">${escapeHtml(
              [user.block, user.room_number].filter(Boolean).join(" · ") || "—"
            )}</span>
          </div>
          <div class="meta">
            <span class="meta__label">Phone</span>
            <span class="meta__value">${escapeHtml(user.phone || "—")}</span>
          </div>
        </div>

        <div class="field">
          <label class="field__label" for="user-role">Role</label>
          <select id="user-role" ${isSelf ? "disabled" : ""}>
            ${ROLES.map(
              (role) =>
                `<option value="${role}" ${role === user.role ? "selected" : ""}>${escapeHtml(
                  roleLabel(role)
                )}</option>`
            ).join("")}
          </select>
          <p class="field__hint">Residents report issues, technicians work jobs, admins triage and manage people.</p>
        </div>

        <div class="field" data-specialty-field ${
          user.role === "technician" ? "" : "hidden"
        }>
          <label class="field__label" for="user-specialty">
            Specialty <span class="req" aria-hidden="true">*</span>
          </label>
          <select id="user-specialty" ${user.role === "technician" ? "" : "disabled"}>
            ${specialtyOptions}
          </select>
          <p class="field__hint">Used to recommend the best technician when assigning work.</p>
          <p class="field__error" data-specialty-error role="alert" hidden></p>
        </div>

        <div class="field">
          <span class="field__label">Account status</span>
          <label class="switch">
            <input type="checkbox" id="user-active" ${user.is_active ? "checked" : ""} ${
              isSelf ? "disabled" : ""
            } />
            <span class="switch__track" aria-hidden="true"></span>
            <span>${user.is_active ? "Active — can sign in" : "Inactive — blocked from signing in"}</span>
          </label>
          <p class="field__hint" data-active-hint>
            ${
              isSelf
                ? "Your own account must stay active."
                : "Deactivating does not delete history; the account can be reactivated later."
            }
          </p>
        </div>
        <div class="field">
          <label class="field__label" for="user-new-password">Reset password (optional)</label>
          <input type="password" id="user-new-password" autocomplete="new-password" minlength="6" />
          <p class="field__hint">Leave blank to keep the current password. Use at least 6 characters for a new one.</p>
        </div>
      </form>
    `,
    footer: `
      <button type="button" class="btn btn--secondary" data-cancel>Cancel</button>
      <button type="button" class="btn btn--primary" data-submit>
        ${icon("check")} Save changes
      </button>
    `,
    onMount(dialog, closeDialog) {
      const form = dialog.querySelector("[data-user-form]");
      const roleSelect = dialog.querySelector("#user-role");
      const specialtyField = dialog.querySelector("[data-specialty-field]");
      const specialtySelect = dialog.querySelector("#user-specialty");
      const specialtyError = dialog.querySelector("[data-specialty-error]");
      const activeInput = dialog.querySelector("#user-active");
      const activeHint = dialog.querySelector("[data-active-hint]");
      const submitButton = dialog.querySelector("[data-submit]");
      let submitting = false;

      const syncSpecialty = () => {
        const isTechnician = roleSelect.value === "technician";
        specialtyField.hidden = !isTechnician;
        specialtySelect.disabled = !isTechnician;
        if (isTechnician && !specialtySelect.value) {
          specialtySelect.value = "general";
        }
        specialtyError.hidden = true;
        specialtySelect.removeAttribute("aria-invalid");
      };

      roleSelect.addEventListener("change", syncSpecialty);
      activeInput.addEventListener("change", () => {
        activeHint.textContent = activeInput.checked
          ? "The account will be able to sign in again."
          : "The account will be blocked from signing in until reactivated.";
      });

      const submit = async () => {
        if (submitting) return;
        const role = roleSelect.value;
        const specialty = role === "technician" ? specialtySelect.value : null;

        if (role === "technician" && !specialty) {
          specialtySelect.setAttribute("aria-invalid", "true");
          specialtyError.textContent = "Choose a specialty for this technician.";
          specialtyError.hidden = false;
          specialtySelect.focus();
          return;
        }
        if (isSelf && (role !== "admin" || !activeInput.checked)) {
          toast("You cannot demote or deactivate your own admin account.", "error");
          return;
        }

        const newPassword = dialog.querySelector('#user-new-password').value;
        if (newPassword && newPassword.length < 6) {
          toast('Use at least 6 characters for the new password.', 'warning');
          return;
        }
        submitting = true;
        setButtonBusy(submitButton, true, "Saving…");
        try {
          const updated = await adminUpdateUser(user.id, {
            role,
            specialty,
            is_active: activeInput.checked,
          });
          if (newPassword) await adminResetPassword(user.id, newPassword);
          toast(`${updated.full_name}'s account was updated.`, "success", {
            title: "Changes saved",
          });
          closeDialog("saved");
          onSaved?.(updated);
        } catch (error) {
          submitting = false;
          setButtonBusy(submitButton, false);
          handleError(error, "Could not update this account.");
        }
      };

      dialog.querySelector("[data-cancel]").addEventListener("click", () => closeDialog("cancel"));
      submitButton.addEventListener("click", submit);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        void submit();
      });
    },
  });

  return { modal, close };
}

export default async function adminUsersPage({
  container,
  profile,
  query,
  refresh,
  setTitle,
  onCleanup,
}) {
  const roleParam = query.get("role");
  const state = {
    search: query.get("q") ?? "",
    role: ROLES.includes(roleParam) ? roleParam : "all",
    status: query.get("status") === "inactive" ? "inactive" : "all",
    page: 0,
  };

  let users = [];
  let disposed = false;

  setTitle("People", "People");
  container.innerHTML = `
    <div class="page">
      ${pageHeader({
        eyebrow: "Admin · People",
        title: "People & roles",
        subtitle: "Manage who can report, repair and triage. Residents register themselves. Add technician accounts here.",
        actions: `<button type="button" class="btn btn--primary" data-add-technician>${icon("user-plus")} Add technician</button><button type="button" class="btn btn--secondary" data-refresh>${icon(
          "refresh"
        )} Refresh</button>`,
      })}
      ${skeletonKpis(4)}
      ${loadingBlock("Loading people…")}
    </div>
  `;

  const counts = () => {
    const result = { all: users.length };
    ROLES.forEach((role) => {
      result[role] = users.filter((user) => user.role === role).length;
    });
    return result;
  };

  const filtered = () => {
    const term = state.search.trim().toLowerCase();
    let result = users;
    if (state.role !== "all") {
      result = result.filter((user) => user.role === state.role);
    }
    if (state.status === "inactive") {
      result = result.filter((user) => !user.is_active);
    }
    if (term) {
      result = result.filter((user) =>
        [
          user.full_name,
          user.email,
          user.phone,
          user.block,
          user.room_number,
          user.specialty,
          user.role,
        ]
          .join(" ")
          .toLowerCase()
          .includes(term)
      );
    }
    return sortUsers(result);
  };

  const render = () => {
    const activeCount = users.filter((user) => user.is_active).length;
    const technicians = users.filter((user) => user.role === "technician");
    const activeTechnicians = technicians.filter((user) => user.is_active);
    const admins = users.filter((user) => user.role === "admin");

    container.innerHTML = `
      <div class="page">
        ${pageHeader({
          eyebrow: "Admin · People",
          title: "People & roles",
          subtitle:
            "Manage who can report, repair and triage. Residents register themselves. Add technician accounts here.",
          actions: `<button type="button" class="btn btn--primary" data-add-technician>${icon("user-plus")} Add technician</button><button type="button" class="btn btn--secondary" data-refresh>${icon(
            "refresh"
          )} Refresh</button>`,
        })}

        ${kpiGrid([
          {
            label: "People",
            value: users.length,
            meta: `${activeCount} active account${activeCount === 1 ? "" : "s"}`,
            iconName: "users",
          },
          {
            label: "Residents",
            value: counts().resident,
            meta: "Can report and confirm repairs",
            iconName: "home",
          },
          {
            label: "Technicians",
            value: technicians.length,
            meta: `${activeTechnicians.length} active and assignable`,
            iconName: "wrench",
          },
          {
            label: "Admins",
            value: admins.length,
            meta: "Can triage, report and manage people",
            iconName: "shield",
          },
        ])}

        <div class="filter-panel stack">
          <div class="toolbar">
            <div class="field field--wide">
              <label class="field__label" for="people-search">Search people</label>
              <div class="input-wrap">
                ${icon("search")}
                <input type="search" id="people-search" placeholder="Name, email, phone, block or room"
                  maxlength="80" autocomplete="off" value="${escapeHtml(state.search)}" />
              </div>
            </div>
            <div class="field">
              <label class="field__label" for="people-status">Account status</label>
              <select id="people-status">
                <option value="all" ${state.status === "all" ? "selected" : ""}>All accounts</option>
                <option value="inactive" ${state.status === "inactive" ? "selected" : ""}>Inactive only</option>
              </select>
            </div>
            <div class="toolbar__actions">
              <button type="button" class="btn btn--secondary" data-reset>${icon(
                "refresh"
              )} Reset</button>
            </div>
          </div>

          <div data-role-chips>${roleChips(state.role, counts())}</div>
          <p class="text-xs text-muted" data-summary aria-live="polite"></p>
        </div>

        <div data-list aria-live="polite"></div>
        <div data-pagination></div>
      </div>
    `;

    bindEvents();
    updateList();
  };

  const updateList = () => {
    const chips = container.querySelector("[data-role-chips]");
    const list = container.querySelector("[data-list]");
    const pagination = container.querySelector("[data-pagination]");
    const summary = container.querySelector("[data-summary]");
    if (!chips || !list || !pagination || !summary) return;

    const result = filtered();
    const pages = Math.max(1, Math.ceil(result.length / PAGE_SIZE));
    state.page = Math.min(Math.max(state.page, 0), pages - 1);
    const pageItems = result.slice(state.page * PAGE_SIZE, state.page * PAGE_SIZE + PAGE_SIZE);

    chips.innerHTML = roleChips(state.role, counts());
    summary.textContent = `${pluralize(result.length, "person", "people")}${
      state.status === "inactive" ? " · inactive only" : ""
    }${state.search.trim() ? ` · matching “${state.search.trim()}”` : ""}`;

    if (!result.length) {
      list.innerHTML = users.length
        ? emptyState({
            iconName: "search",
            title: "No people match",
            text: "Try a different name, role or status.",
            actionHtml:
              '<button type="button" class="btn btn--secondary" data-clear>Clear filters</button>',
          })
        : emptyState({
            iconName: "users",
            title: "No accounts yet",
            text: "Share the sign-up page with residents and technicians so they can create accounts.",
            actionHtml:
              '<a class="btn btn--secondary" href="#/register">Open sign-up page</a>',
          });
    } else {
      list.innerHTML = tableHtml(pageItems, profile.id);
    }

    pagination.innerHTML = result.length
      ? paginationHtml({ page: state.page, pageSize: PAGE_SIZE, total: result.length })
      : "";
  };

  const resetFilters = () => {
    state.search = "";
    state.role = "all";
    state.status = "all";
    state.page = 0;
    const search = container.querySelector("#people-search");
    const status = container.querySelector("#people-status");
    if (search) search.value = "";
    if (status) status.value = "all";
    updateList();
  };

  const applySearch = debounce(() => {
    const input = container.querySelector("#people-search");
    if (!input) return;
    state.search = input.value;
    state.page = 0;
    updateList();
  }, 220);

  const bindEvents = () => {
    container.querySelector('[data-add-technician]')?.addEventListener('click', () => {
      openCreateTechnicianModal({ onCreated() {
        state.role = 'technician';
        state.search = '';
        state.status = 'all';
        state.page = 0;
        void load({ silent: false });
      } });
    });
    container.querySelector("#people-search")?.addEventListener("input", applySearch);
    container.querySelector("#people-status")?.addEventListener("change", (event) => {
      state.status = event.target.value === "inactive" ? "inactive" : "all";
      state.page = 0;
      updateList();
    });
    container.querySelector("[data-reset]")?.addEventListener("click", resetFilters);
    container.querySelector("[data-refresh]")?.addEventListener("click", () => {
      void load({ silent: false });
    });

    container.querySelector("[data-role-chips]")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-role-filter]");
      if (!button) return;
      state.role = button.dataset.roleFilter;
      state.page = 0;
      updateList();
    });

    container.querySelector("[data-pagination]")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button || button.disabled) return;
      state.page = Number(button.dataset.page);
      updateList();
      container
        .querySelector("[data-list]")
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
    });

    container.querySelector("[data-list]")?.addEventListener("click", (event) => {
      if (event.target.closest("[data-clear]")) {
        resetFilters();
        return;
      }
      const editButton = event.target.closest("[data-edit]");
      if (!editButton) return;
      const user = users.find((item) => item.id === editButton.dataset.edit);
      if (!user) return;
      openEditUserModal({
        user,
        currentUserId: profile.id,
        onSaved: (updated) => {
          users = users.map((item) => (item.id === updated.id ? { ...item, ...updated } : item));
          render();
        },
      });
    });
  };

  const load = async ({ silent = false } = {}) => {
    if (!silent) {
      const list = container.querySelector("[data-list]");
      if (list) list.innerHTML = loadingBlock("Loading people…");
    }
    try {
      const next = await getProfiles();
      if (disposed) return;
      users = next;
      render();
      setTitle("People", "People");
    } catch (error) {
      console.error(error);
      if (disposed) return;
      if (silent) {
        toast("Could not refresh people. Check your connection.", "warning");
        return;
      }
      container.innerHTML = `
        <div class="page">
          ${pageHeader({
            eyebrow: "Admin · People",
            title: "People & roles",
            subtitle:
              "Manage who can report, repair and triage. Residents register themselves. Add technician accounts here.",
          })}
          ${errorState({
            title: "We could not load people",
            text: "Check your connection and try again.",
            actionHtml:
              '<button type="button" class="btn btn--primary" data-retry>Try again</button>',
          })}
        </div>
      `;
      container.querySelector("[data-retry]")?.addEventListener("click", () => refresh());
    }
  };

  onCleanup(() => {
    disposed = true;
    applySearch.cancel();
  });

  await load();
}
