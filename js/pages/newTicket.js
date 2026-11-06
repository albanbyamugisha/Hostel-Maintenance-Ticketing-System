import { createTicket, uploadTicketPhotos, attachTicketPhotos, removeTicketPhotos } from "../api.js";
import { navigate } from "../router.js";
import { pageHeader } from "../components/pageBits.js";
import { PhotoUploader } from "../components/photoUploader.js";
import { setButtonBusy, showFieldError, clearFormErrors, handleError } from "../ui.js";
import { toast } from "../toast.js";
import { icon } from "../icons.js";
import {
  escapeHtml,
  CATEGORY_META,
  SEVERITY_META,
  todayISO,
} from "../utils.js";

export default function newTicketPage({ container, profile, onCleanup }) {
  const defaultBlock = profile.block || "";
  const defaultRoom = profile.room_number || "";

  container.innerHTML = `
    <div class="page">
      ${pageHeader({
        eyebrow: "Resident · New request",
        title: "Report a maintenance issue",
        subtitle:
          "The more detail you add, the faster the right person can fix it. Photos help a lot.",
        actions: `<a class="btn btn--ghost" href="#/tickets">${icon("arrow-left")} My tickets</a>`,
      })}

      <div class="detail-grid">
        <div class="detail-main">
          <form class="card" data-ticket-form novalidate>
            <div class="card__body stack">
              <div data-form-alert hidden></div>

              <section class="stack" aria-labelledby="where-heading">
                <div>
                  <h2 id="where-heading" class="text-md">Where is the problem?</h2>
                  <p class="text-sm text-muted">Give the technician enough detail to find it first time.</p>
                </div>

                <div class="field">
                  <span class="field__label" id="location-type-label">Location type</span>
                  <div class="segmented" role="radiogroup" aria-labelledby="location-type-label">
                    <label>
                      <input type="radio" name="location_type" value="room" checked />
                      <span>My room</span>
                    </label>
                    <label>
                      <input type="radio" name="location_type" value="common_area" />
                      <span>Shared area</span>
                    </label>
                  </div>
                </div>

                <div class="form-grid form-grid--3">
                  <div class="field">
                    <label class="field__label" for="ticket-block">
                      Block <span class="req" aria-hidden="true">*</span>
                    </label>
                    <input type="text" id="ticket-block" name="block" list="ticket-blocks"
                      maxlength="20" value="${escapeHtml(defaultBlock)}" required
                      placeholder="Block A" aria-describedby="ticket-block-error" />
                    <datalist id="ticket-blocks">
                      <option value="Block A"></option>
                      <option value="Block B"></option>
                      <option value="Block C"></option>
                      <option value="Block D"></option>
                    </datalist>
                    <p class="field__error" id="ticket-block-error" data-error role="alert" hidden></p>
                  </div>

                  <div class="field">
                    <label class="field__label" for="ticket-floor">
                      Floor <span class="req" aria-hidden="true">*</span>
                    </label>
                    <input type="text" id="ticket-floor" name="floor" maxlength="10" required
                      placeholder="e.g. 2nd floor" aria-describedby="ticket-floor-error" />
                    <p class="field__error" id="ticket-floor-error" data-error role="alert" hidden></p>
                  </div>

                  <div class="field">
                    <label class="field__label" for="ticket-room">
                      Room or area <span class="req" aria-hidden="true">*</span>
                    </label>
                    <input type="text" id="ticket-room" name="room_number" maxlength="10"
                      value="${escapeHtml(defaultRoom)}" required placeholder="e.g. 201"
                      aria-describedby="ticket-room-error" />
                    <p class="field__error" id="ticket-room-error" data-error role="alert" hidden></p>
                  </div>
                </div>
              </section>

              <hr class="divider" />

              <section class="stack" aria-labelledby="what-heading">
                <div>
                  <h2 id="what-heading" class="text-md">What needs fixing?</h2>
                  <p class="text-sm text-muted">Choose the closest category and tell us what you can see or hear.</p>
                </div>

                <div class="field">
                  <label class="field__label" for="ticket-category">
                    Category <span class="req" aria-hidden="true">*</span>
                  </label>
                  <select id="ticket-category" name="category" required>
                    ${Object.entries(CATEGORY_META)
                      .map(
                        ([value, meta]) =>
                          `<option value="${value}">${escapeHtml(meta.label)} — ${escapeHtml(
                            meta.hint
                          )}</option>`
                      )
                      .join("")}
                  </select>
                </div>

                <div class="field">
                  <span class="field__label" id="severity-label">
                    How urgent is it? <span class="req" aria-hidden="true">*</span>
                  </span>
                  <div class="severity-picker" role="radiogroup" aria-labelledby="severity-label">
                    ${Object.entries(SEVERITY_META)
                      .map(
                        ([value, meta]) => `
                          <label class="severity-option" data-sev="${value}">
                            <input type="radio" name="severity" value="${value}"
                              ${value === "medium" ? "checked" : ""} required />
                            <span class="severity-option__name">${icon(meta.icon)}${escapeHtml(
                              meta.label
                            )}</span>
                            <span class="severity-option__hint">${escapeHtml(meta.hint)}</span>
                          </label>
                        `
                      )
                      .join("")}
                  </div>
                  <p class="field__error" id="ticket-severity-error" data-error role="alert" hidden></p>
                </div>

                <div data-emergency-note hidden>
                  <div class="alert alert--danger">
                    ${icon("siren")}
                    <div><strong>Emergencies need a phone call too.</strong> If there is fire, flooding, a live wire or someone is locked in, call the warden on duty now. This ticket alerts the maintenance desk, but it is not a 24/7 emergency line.</div>
                  </div>
                </div>

                <div class="field">
                  <label class="field__label" for="ticket-title">
                    Short title <span class="req" aria-hidden="true">*</span>
                  </label>
                  <input type="text" id="ticket-title" name="title" maxlength="120" required
                    placeholder="e.g. Bathroom tap will not stop dripping"
                    aria-describedby="ticket-title-hint ticket-title-error" />
                  <div class="row-between">
                    <p class="field__hint" id="ticket-title-hint">5–120 characters. Be specific.</p>
                    <span class="char-count" data-title-count>0/120</span>
                  </div>
                  <p class="field__error" id="ticket-title-error" data-error role="alert" hidden></p>
                </div>

                <div class="field">
                  <label class="field__label" for="ticket-description">
                    Description <span class="req" aria-hidden="true">*</span>
                  </label>
                  <textarea id="ticket-description" name="description" rows="6" maxlength="2000"
                    required placeholder="What is happening? When did it start? Is it getting worse? Anything you already tried?"
                    aria-describedby="ticket-description-hint ticket-description-error"></textarea>
                  <div class="row-between">
                    <p class="field__hint" id="ticket-description-hint">10–2000 characters. Do not include passwords or personal documents.</p>
                    <span class="char-count" data-description-count>0/2000</span>
                  </div>
                  <p class="field__error" id="ticket-description-error" data-error role="alert" hidden></p>
                </div>
              </section>

              <hr class="divider" />

              <section class="stack" aria-labelledby="photos-heading">
                <div>
                  <h2 id="photos-heading" class="text-md">Add photos</h2>
                  <p class="text-sm text-muted">Optional, up to 3. Take a wide shot first, then a close-up.</p>
                </div>
                <div data-photo-uploader></div>
              </section>

              <div class="form-actions form-actions--between">
                <a class="btn btn--secondary" href="#/tickets">Cancel</a>
                <button type="submit" class="btn btn--primary btn--lg" data-submit>
                  ${icon("send")} Submit report
                </button>
              </div>
            </div>
          </form>
        </div>

        <aside class="detail-side">
          <section class="card">
            <div class="card__head"><h2>Before you submit</h2></div>
            <div class="card__body stack-sm">
              <p class="text-sm"><strong>Be specific.</strong> “Tap drips constantly, bucket underneath” beats “tap broken”.</p>
              <p class="text-sm"><strong>Check access.</strong> Make sure the technician can reach the room or area during the day.</p>
              <p class="text-sm"><strong>One issue per ticket.</strong> Separate tickets help us assign the right trade and track each repair.</p>
              <p class="text-sm"><strong>Your privacy.</strong> Your dashboard shows your reports, their status and the maintenance team’s updates.</p>
            </div>
          </section>

          <section class="card">
            <div class="card__body stack-sm">
              <h2 class="text-sm">What happens next?</h2>
              <ol class="stack-sm text-sm" style="padding-left: 1.1rem">
                <li>The desk triages your report.</li>
                <li>A technician is assigned, usually with a target date.</li>
                <li>You get notified at every status change.</li>
                <li>When the work is done, you confirm and close it.</li>
              </ol>
              <p class="text-xs text-muted">Submitted ${todayISO()}. You can add notes or more photos later.</p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  `;

  const form = container.querySelector("[data-ticket-form]");
  const alertBox = container.querySelector("[data-form-alert]");
  const submitButton = form.querySelector("[data-submit]");
  const titleInput = form.querySelector("#ticket-title");
  const descriptionInput = form.querySelector("#ticket-description");
  const titleCount = form.querySelector("[data-title-count]");
  const descriptionCount = form.querySelector("[data-description-count]");
  const emergencyNote = form.querySelector("[data-emergency-note]");

  const uploader = new PhotoUploader(container.querySelector("[data-photo-uploader]"));
  onCleanup(() => uploader.destroy());

  const fields = {
    block: form.querySelector("#ticket-block"),
    floor: form.querySelector("#ticket-floor"),
    room: form.querySelector("#ticket-room"),
    category: form.querySelector("#ticket-category"),
    title: titleInput,
    description: descriptionInput,
  };

  const errors = {
    block: form.querySelector("#ticket-block-error"),
    floor: form.querySelector("#ticket-floor-error"),
    room: form.querySelector("#ticket-room-error"),
    title: form.querySelector("#ticket-title-error"),
    description: form.querySelector("#ticket-description-error"),
  };

  const updateCounters = () => {
    titleCount.textContent = `${titleInput.value.length}/120`;
    descriptionCount.textContent = `${descriptionInput.value.length}/2000`;
  };
  updateCounters();

  titleInput.addEventListener("input", () => {
    updateCounters();
    titleInput.removeAttribute("aria-invalid");
    errors.title.hidden = true;
  });
  descriptionInput.addEventListener("input", () => {
    updateCounters();
    descriptionInput.removeAttribute("aria-invalid");
    errors.description.hidden = true;
  });

  form.querySelectorAll("input, textarea, select").forEach((input) => {
    input.addEventListener("input", () => {
      if (input.name === "severity") {
        emergencyNote.hidden = form.querySelector("input[name='severity']:checked")?.value !== "emergency";
        return;
      }
      input.removeAttribute("aria-invalid");
      const key = Object.keys(fields).find((name) => fields[name] === input);
      if (key && errors[key]) errors[key].hidden = true;
    });
  });

  form.querySelectorAll("input[name='severity']").forEach((input) => {
    input.addEventListener("change", () => {
      emergencyNote.hidden = input.value !== "emergency" || !input.checked;
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormErrors(form);
    alertBox.hidden = true;
    if (uploader.processing) {
      toast("Please wait for your photos to finish processing.", "info");
      return;
    }

    const block = fields.block.value.trim();
    const floor = fields.floor.value.trim();
    const room = fields.room.value.trim();
    const category = fields.category.value;
    const severity = form.querySelector("input[name='severity']:checked")?.value;
    const locationType = form.querySelector("input[name='location_type']:checked")?.value;
    const title = titleInput.value.trim();
    const description = descriptionInput.value.trim();

    let invalid = false;
    if (block.length < 1 || block.length > 20) {
      showFieldError(fields.block, errors.block, "Enter the hostel block.");
      invalid = true;
    }
    if (floor.length < 1 || floor.length > 10) {
      showFieldError(fields.floor, errors.floor, "Enter the floor or level.");
      invalid = true;
    }
    if (room.length < 1 || room.length > 10) {
      showFieldError(fields.room, errors.room, "Enter the room number or shared area.");
      invalid = true;
    }
    if (title.length < 5 || title.length > 120) {
      showFieldError(fields.title, errors.title, "Use a title between 5 and 120 characters.");
      invalid = true;
    }
    if (description.length < 10 || description.length > 2000) {
      showFieldError(
        fields.description,
        errors.description,
        "Describe the issue in 10–2000 characters."
      );
      invalid = true;
    }
    if (!category) {
      alertBox.innerHTML = `<div class="alert alert--danger">${icon(
        "alert-circle"
      )}<div>Choose a category.</div></div>`;
      alertBox.hidden = false;
      invalid = true;
    }
    if (!severity) {
      const severityError = form.querySelector("#ticket-severity-error");
      severityError.textContent = "Choose how urgent the issue is.";
      severityError.hidden = false;
      invalid = true;
    }
    if (!locationType) {
      invalid = true;
    }

    if (invalid) {
      form.querySelector("[aria-invalid='true']")?.focus();
      alertBox.hidden = false;
      alertBox.innerHTML = `<div class="alert alert--danger">${icon(
        "alert-circle"
      )}<div>Please fix the highlighted fields and try again.</div></div>`;
      return;
    }

    setButtonBusy(submitButton, true, "Submitting…");
    submitButton.disabled = true;
    uploader.setDisabled(true);

    let ticket;
    try {
      ticket = await createTicket({
        block,
        floor,
        roomNumber: room,
        locationType,
        category,
        severity,
        title,
        description,
        photoPaths: [],
      });
    } catch (error) {
      console.error(error);
      setButtonBusy(submitButton, false);
      uploader.setDisabled(false);
      alertBox.innerHTML = `<div class="alert alert--danger">${icon(
        "alert-circle"
      )}<div>${escapeHtml(
        error.message || "Could not submit the ticket. Please try again."
      )}</div></div>`;
      alertBox.hidden = false;
      return;
    }

    const blobs = uploader.getBlobs();
    let photoWarning = false;

    if (blobs.length) {
      let paths = [];
      try {
        paths = await uploadTicketPhotos(ticket.id, blobs);
        await attachTicketPhotos(ticket.id, paths);
      } catch (error) {
        console.error(error);
        if (paths.length) {
          try { await removeTicketPhotos(paths); } catch (cleanupError) { console.error(cleanupError); }
        }
        photoWarning = true;
      }
    }

    toast(
      `Ticket ${ticket.tracking_id} submitted. The maintenance desk has been notified.`,
      "success",
      { title: "Report received", duration: 6500 }
    );

    if (photoWarning) {
      toast(
        "The ticket was created but the photos could not be uploaded. You can add them from the ticket page.",
        "warning",
        { title: "Photos not uploaded", duration: 8000 }
      );
    }

    navigate(`/tickets/${ticket.id}`, { replace: true });
  });
}
