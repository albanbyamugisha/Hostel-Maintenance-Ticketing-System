import { getTechnicians, assignTicket } from "../api.js";
import { openModal, setButtonBusy, handleError } from "../ui.js";
import { toast } from "../toast.js";
import {
  escapeHtml,
  specialtyLabel,
  todayISO,
  addDaysISO,
  formatDate,
  categoryLabel,
} from "../utils.js";
import { icon } from "../icons.js";

/**
 * Admin assignment dialog. Loads the technician workload view so the desk can
 * balance jobs before committing the assignment.
 */
export async function openAssignModal({ ticket, onAssigned }) {
  let technicians = [];
  let loading = true;
  let submitting = false;

  const defaultDate = ticket.target_date || addDaysISO(3);
  const matchingSpecialty = ticket.category;

  const { modal, close } = openModal({
    title: ticket.assigned_to ? "Reassign ticket" : "Assign a technician",
    subtitle: `${ticket.tracking_id} · ${ticket.title}`,
    body: `
      <form class="stack" data-assign-form novalidate>
        <div class="field">
          <label class="field__label" for="assign-tech">
            Technician <span class="req" aria-hidden="true">*</span>
          </label>
          <select id="assign-tech" name="technician" required data-autofocus disabled>
            <option value="">Loading technicians…</option>
          </select>
          <p class="field__hint">Workload is the number of open jobs currently assigned.</p>
          <p class="field__error" data-error role="alert" hidden></p>
        </div>

        <div class="field">
          <label class="field__label" for="assign-date">Target completion date</label>
          <input type="date" id="assign-date" name="target_date" min="${todayISO()}"
            value="${escapeHtml(defaultDate)}" />
          <p class="field__hint">Optional, but it powers overdue tracking and the reports.</p>
        </div>

        <div class="alert alert--info" data-assign-note>
          ${icon("info")}
          <div>The technician and the resident will both receive a notification.</div>
        </div>
      </form>
    `,
    footer: `
      <button type="button" class="btn btn--secondary" data-cancel>Cancel</button>
      <button type="button" class="btn btn--primary" data-submit disabled>
        ${icon("user-check")} Assign ticket
      </button>
    `,
    onMount(dialog, closeDialog) {
      const form = dialog.querySelector("[data-assign-form]");
      const select = dialog.querySelector("#assign-tech");
      const dateInput = dialog.querySelector("#assign-date");
      const errorElement = dialog.querySelector("[data-error]");
      const submitButton = dialog.querySelector("[data-submit]");
      const note = dialog.querySelector("[data-assign-note]");

      const showError = (message) => {
        errorElement.textContent = message;
        errorElement.hidden = false;
        select.setAttribute("aria-invalid", "true");
        select.focus();
      };

      const fillTechnicians = () => {
        loading = false;
        if (!technicians.length) {
          select.innerHTML = '<option value="">No active technicians</option>';
          submitButton.disabled = true;
          note.className = "alert alert--warning";
          note.innerHTML = `${icon("alert-triangle")}<div>Add an active technician under <a href="#/admin/users">People</a> before assigning jobs.</div>`;
          return;
        }

        const sorted = [...technicians].sort((a, b) => {
          const aMatch = a.specialty === matchingSpecialty ? 0 : 1;
          const bMatch = b.specialty === matchingSpecialty ? 0 : 1;
          if (aMatch !== bMatch) return aMatch - bMatch;
          if ((a.open_tickets ?? 0) !== (b.open_tickets ?? 0)) {
            return (a.open_tickets ?? 0) - (b.open_tickets ?? 0);
          }
          return String(a.full_name).localeCompare(String(b.full_name));
        });

        select.innerHTML = `
          <option value="">Choose a technician…</option>
          ${sorted
            .map(
              (technician) => `
                <option value="${escapeHtml(technician.id)}" ${
                  technician.id === ticket.assigned_to ? "selected" : ""
                }>
                  ${escapeHtml(technician.full_name)} — ${escapeHtml(
                    specialtyLabel(technician.specialty)
                  )} · ${technician.open_tickets ?? 0} open${
                    technician.specialty === matchingSpecialty ? " · recommended" : ""
                  }
                </option>`
            )
            .join("")}
        `;
        select.disabled = false;
        submitButton.disabled = false;
        if (ticket.assigned_to) select.value = ticket.assigned_to;
      };

      select.addEventListener("change", () => {
        select.removeAttribute("aria-invalid");
        errorElement.hidden = true;
      });

      const submit = async () => {
        if (submitting || loading) return;
        const technicianId = select.value;
        if (!technicianId) {
          showError("Choose a technician for this ticket.");
          return;
        }
        const targetDate = dateInput.value || null;
        if (targetDate && targetDate < todayISO()) {
          dateInput.setAttribute("aria-invalid", "true");
          dateInput.focus();
          toast("Target date cannot be in the past.", "error");
          return;
        }

        submitting = true;
        setButtonBusy(submitButton, true, "Assigning…");
        try {
          const updated = await assignTicket(ticket.id, technicianId, targetDate);
          const technician = technicians.find((item) => item.id === technicianId);
          toast(
            `Assigned to ${technician?.full_name ?? "technician"}${
              targetDate ? ` · due ${formatDate(targetDate)}` : ""
            }.`,
            "success",
            { title: "Ticket assigned" }
          );
          closeDialog("assigned");
          onAssigned?.(updated);
        } catch (error) {
          submitting = false;
          setButtonBusy(submitButton, false);
          handleError(error, "Could not assign this ticket.");
        }
      };

      dialog.querySelector("[data-cancel]").addEventListener("click", () => closeDialog("cancel"));
      submitButton.addEventListener("click", submit);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        void submit();
      });

      void (async () => {
        try {
          technicians = await getTechnicians();
          fillTechnicians();
        } catch (error) {
          console.error(error);
          loading = false;
          select.innerHTML = '<option value="">Could not load technicians</option>';
          showError(
            "Could not load technicians. Check your connection and close this dialog to try again."
          );
        }
      })();
    },
  });

  modal.querySelector("[data-cancel]")?.focus({ preventScroll: true });
  return close;
}

export function assignmentSummary(ticket) {
  return `${ticket.tracking_id} · ${categoryLabel(ticket.category)}`;
}
