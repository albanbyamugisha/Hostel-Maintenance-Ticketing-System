import {
  technicianUpdateStatus,
  addWorkLog,
  residentConfirmClose,
  residentReject,
  adminReopen,
  uploadTicketPhotos,
  removeTicketPhotos,
  attachTicketPhotos,
} from "../api.js";
import {
  openModal,
  promptDialog,
  setButtonBusy,
  handleError,
  starsInputHtml,
  bindStarInput,
} from "../ui.js";
import { PhotoUploader } from "./photoUploader.js";
import { toast } from "../toast.js";
import { pluralize } from "../utils.js";
import { icon } from "../icons.js";

/**
 * Dialog-driven ticket actions. Every mutation goes through the local workflow layer;
 * these helpers only collect input, upload optional photos and report errors.
 */

async function uploadThen(ticketId, uploader, action) {
  if (uploader?.processing) throw new Error("Please wait for your photos to finish processing.");
  const blobs = uploader?.getBlobs() ?? [];
  let paths = [];
  try {
    if (blobs.length) paths = await uploadTicketPhotos(ticketId, blobs);
    return await action(paths);
  } catch (error) {
    if (paths.length) {
      await removeTicketPhotos(paths).catch((cleanupError) => {
        console.error("Could not roll back uploaded photos", cleanupError);
      });
    }
    throw error;
  }
}

function openLogModal({ ticket, mode, onDone }) {
  const isResolve = mode === "resolve";
  const title = isResolve ? "Mark the job resolved" : "Add a work log";
  const subtitle = `${ticket.tracking_id} · ${ticket.title}`;
  const minLength = isResolve ? 10 : 3;
  let uploader = null;

  const { modal, close } = openModal({
    title,
    subtitle,
    body: `
      <form class="stack" data-log-form novalidate>
        <div class="alert alert--${isResolve ? "info" : "brand"}">
          ${icon(isResolve ? "check-circle" : "clipboard")}
          <div>
            ${
              isResolve
                ? "The resident will be asked to confirm the repair. Describe what you fixed and any parts you used."
                : "Work logs are visible to the resident and the maintenance desk."
            }
          </div>
        </div>

        <div class="field">
          <label class="field__label" for="log-note">
            ${isResolve ? "Work completed" : "Work log"} <span class="req" aria-hidden="true">*</span>
          </label>
          <textarea id="log-note" name="note" rows="5" maxlength="2000" required
            data-autofocus placeholder="${
              isResolve
                ? "e.g. Replaced the tap cartridge, tested for leaks and cleaned up."
                : "e.g. Checked the socket, ordered a replacement switch."
            }" aria-describedby="log-note-hint log-note-error"></textarea>
          <div class="row-between">
            <p class="field__hint" id="log-note-hint">At least ${minLength} characters, up to 2000.</p>
            <span class="char-count" data-count>0/2000</span>
          </div>
          <p class="field__error" id="log-note-error" data-note-error role="alert" hidden></p>
        </div>

        <div class="field">
          <label class="field__label" for="log-parts">Parts used (optional)</label>
          <input type="text" id="log-parts" name="parts" maxlength="500"
            placeholder="e.g. 1× tap cartridge, 2× wall plugs" />
        </div>

        <div class="field">
          <span class="field__label">Work photos (optional)</span>
          <div data-photo-uploader></div>
        </div>
      </form>
    `,
    footer: `
      <button type="button" class="btn btn--secondary" data-cancel>Cancel</button>
      <button type="button" class="btn btn--primary" data-submit>
        ${icon(isResolve ? "check-circle" : "send")} ${isResolve ? "Resolve job" : "Add work log"}
      </button>
    `,
    onMount(dialog, closeDialog) {
      const form = dialog.querySelector("[data-log-form]");
      const note = dialog.querySelector("#log-note");
      const parts = dialog.querySelector("#log-parts");
      const errorElement = dialog.querySelector("[data-note-error]");
      const counter = dialog.querySelector("[data-count]");
      const submitButton = dialog.querySelector("[data-submit]");
      uploader = new PhotoUploader(dialog.querySelector("[data-photo-uploader]"), {
        label: "Add work photos",
      });

      let submitting = false;
      const updateCounter = () => {
        counter.textContent = `${note.value.length}/2000`;
      };
      updateCounter();

      note.addEventListener("input", () => {
        updateCounter();
        note.removeAttribute("aria-invalid");
        errorElement.hidden = true;
      });

      const submit = async () => {
        if (submitting) return;
        const value = note.value.trim();
        if (value.length < minLength) {
          note.setAttribute("aria-invalid", "true");
          errorElement.textContent = `Please write at least ${minLength} characters.`;
          errorElement.hidden = false;
          note.focus();
          return;
        }

        submitting = true;
        setButtonBusy(submitButton, true, isResolve ? "Resolving…" : "Saving…");
        uploader.setDisabled(true);
        try {
          const updated = await uploadThen(ticket.id, uploader, (photoPaths) =>
            isResolve
              ? technicianUpdateStatus(ticket.id, "resolved", {
                  note: value,
                  partsUsed: parts.value.trim() || null,
                  photoPaths,
                })
              : addWorkLog(ticket.id, {
                  note: value,
                  partsUsed: parts.value.trim() || null,
                  photoPaths,
                })
          );
          toast(
            isResolve
              ? "The resident has been asked to confirm the repair."
              : "Work log added to the ticket.",
            "success",
            { title: isResolve ? "Job resolved" : "Work log saved" }
          );
          closeDialog("done");
          onDone?.(updated);
        } catch (error) {
          submitting = false;
          setButtonBusy(submitButton, false);
          uploader.setDisabled(false);
          handleError(error, "Could not save the work log.");
        }
      };

      dialog.querySelector("[data-cancel]").addEventListener("click", () => closeDialog("cancel"));
      submitButton.addEventListener("click", submit);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        void submit();
      });
    },
    onClose() {
      uploader?.destroy();
    },
  });

  return { modal, close };
}

export function openResolveModal({ ticket, onDone }) {
  return openLogModal({ ticket, mode: "resolve", onDone });
}

export function openWorkLogModal({ ticket, onDone }) {
  return openLogModal({ ticket, mode: "work_log", onDone });
}

export async function openHoldModal({ ticket, onDone }) {
  const reason = await promptDialog({
    title: "Put this job on hold",
    label: "Why is work paused?",
    placeholder: "e.g. Waiting for a replacement cartridge from the supplier.",
    confirmLabel: "Put on hold",
    helper: "The resident and the maintenance desk will see this reason.",
    minLength: 3,
    maxLength: 500,
    danger: true,
  });
  if (reason === null) return;

  try {
    const updated = await technicianUpdateStatus(ticket.id, "on_hold", { note: reason });
    toast("The job is on hold and the desk has been notified.", "success", {
      title: "Job paused",
    });
    onDone?.(updated);
  } catch (error) {
    handleError(error, "Could not put this job on hold.");
  }
}

export async function openRejectModal({ ticket, onDone }) {
  const reason = await promptDialog({
    title: "The issue is not fixed",
    label: "What still needs fixing?",
    placeholder: "Tell the technician what is still wrong or what was missed.",
    confirmLabel: "Reopen ticket",
    helper: "The ticket will be reopened and the technician and desk will be notified.",
    minLength: 5,
    maxLength: 500,
    danger: true,
  });
  if (reason === null) return;

  try {
    const updated = await residentReject(ticket.id, reason);
    toast("The ticket has been reopened for another look.", "success", {
      title: "Ticket reopened",
    });
    onDone?.(updated);
  } catch (error) {
    handleError(error, "Could not reopen this ticket.");
  }
}

export async function openAdminReopenModal({ ticket, onDone }) {
  const reason = await promptDialog({
    title: "Reopen this ticket",
    label: "Reason for reopening",
    placeholder: "e.g. The resident contacted the desk to say the leak has returned.",
    confirmLabel: "Reopen ticket",
    helper: "The resident and the assigned technician will be notified.",
    minLength: 5,
    maxLength: 500,
    danger: true,
  });
  if (reason === null) return;

  try {
    const updated = await adminReopen(ticket.id, reason);
    toast("The ticket has been reopened.", "success", { title: "Ticket reopened" });
    onDone?.(updated);
  } catch (error) {
    handleError(error, "Could not reopen this ticket.");
  }
}

export function openConfirmCloseModal({ ticket, onDone }) {
  let stars = null;

  const { modal, close } = openModal({
    title: "Confirm the repair",
    subtitle: `${ticket.tracking_id} · ${ticket.title}`,
    body: `
      <form class="stack" data-confirm-form novalidate>
        <div class="alert alert--success">
          ${icon("check-circle")}
          <div>Closing the ticket confirms the repair is complete. You can still reopen it by contacting the maintenance desk.</div>
        </div>

        ${starsInputHtml({ legend: "How was the repair? (optional)" })}

        <div class="field">
          <label class="field__label" for="confirm-feedback">Feedback (optional)</label>
          <textarea id="confirm-feedback" name="feedback" rows="4" maxlength="1000"
            placeholder="Anything the technician or the desk should know?"
            aria-describedby="confirm-feedback-hint"></textarea>
          <div class="row-between">
            <p class="field__hint" id="confirm-feedback-hint">Up to 1000 characters.</p>
            <span class="char-count" data-count>0/1000</span>
          </div>
        </div>
      </form>
    `,
    footer: `
      <button type="button" class="btn btn--secondary" data-cancel>Cancel</button>
      <button type="button" class="btn btn--primary" data-submit>
        ${icon("check")} Confirm & close
      </button>
    `,
    onMount(dialog, closeDialog) {
      const form = dialog.querySelector("[data-confirm-form]");
      const feedback = dialog.querySelector("#confirm-feedback");
      const counter = dialog.querySelector("[data-count]");
      const submitButton = dialog.querySelector("[data-submit]");
      stars = bindStarInput(dialog);
      let submitting = false;

      feedback.addEventListener("input", () => {
        counter.textContent = `${feedback.value.length}/1000`;
      });

      const submit = async () => {
        if (submitting) return;
        submitting = true;
        setButtonBusy(submitButton, true, "Closing…");
        try {
          const updated = await residentConfirmClose(
            ticket.id,
            stars?.getValue() ?? null,
            feedback.value.trim() || null
          );
          toast("Thanks for confirming. The ticket is now closed.", "success", {
            title: "Repair confirmed",
          });
          closeDialog("done");
          onDone?.(updated);
        } catch (error) {
          submitting = false;
          setButtonBusy(submitButton, false);
          handleError(error, "Could not close this ticket.");
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

export function openAttachPhotosModal({ ticket, onDone }) {
  const existing = Array.isArray(ticket.photo_paths) ? ticket.photo_paths.length : 0;
  const remaining = Math.max(0, 3 - existing);
  if (!remaining) {
    toast("This ticket already has the maximum of 3 photos.", "warning");
    return null;
  }

  let uploader = null;
  const { modal, close } = openModal({
    title: "Add photos",
    subtitle: `${ticket.tracking_id} · ${pluralize(remaining, "photo")} can be added`,
    body: `
      <div class="stack">
        <div class="alert alert--info">
          ${icon("camera")}
          <div>Photos are compressed on your device before upload. Add a wide shot and a close-up if possible.</div>
        </div>
        <div data-photo-uploader></div>
      </div>
    `,
    footer: `
      <button type="button" class="btn btn--secondary" data-cancel>Cancel</button>
      <button type="button" class="btn btn--primary" data-submit>
        ${icon("upload")} Upload photos
      </button>
    `,
    onMount(dialog, closeDialog) {
      const submitButton = dialog.querySelector("[data-submit]");
      uploader = new PhotoUploader(dialog.querySelector("[data-photo-uploader]"), {
        max: remaining,
        label: "Add photos to this ticket",
      });
      let submitting = false;

      const submit = async () => {
        if (submitting) return;
        if (!uploader.getCount()) {
          toast("Choose at least one photo first.", "warning");
          return;
        }
        submitting = true;
        setButtonBusy(submitButton, true, "Uploading…");
        uploader.setDisabled(true);
        try {
          await uploadThen(ticket.id, uploader, (paths) => attachTicketPhotos(ticket.id, paths));
          toast("Photos added to the ticket.", "success", { title: "Upload complete" });
          closeDialog("done");
          onDone?.();
        } catch (error) {
          submitting = false;
          setButtonBusy(submitButton, false);
          uploader.setDisabled(false);
          handleError(error, "Could not upload the photos.");
        }
      };

      dialog.querySelector("[data-cancel]").addEventListener("click", () => closeDialog("cancel"));
      submitButton.addEventListener("click", submit);
    },
    onClose() {
      uploader?.destroy();
    },
  });

  return { modal, close };
}

export function statusHelpText(ticket) {
  if (ticket.status === "on_hold" && ticket.hold_reason) {
    return `On hold: ${ticket.hold_reason}`;
  }
  return "";
}
