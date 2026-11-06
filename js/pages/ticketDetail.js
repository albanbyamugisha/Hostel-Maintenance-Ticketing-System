import {
  getTicket,
  getTicketEvents,
  getSignedPhotoUrls,
  technicianUpdateStatus,
  addTicketNote,
  subscribeToTicket,
} from "../api.js";
import { pageHeader } from "../components/pageBits.js";
import { ticketStepper } from "../components/ticketStepper.js";
import { ticketTimeline } from "../components/ticketTimeline.js";
import { openAssignModal } from "../components/assignModal.js";
import {
  openResolveModal,
  openWorkLogModal,
  openHoldModal,
  openRejectModal,
  openAdminReopenModal,
  openConfirmCloseModal,
  openAttachPhotosModal,
} from "../components/ticketActions.js";
import {
  confirmDialog,
  emptyState,
  errorState,
  loadingBlock,
  openLightbox,
  copyToClipboard,
  handleError,
  setButtonBusy,
} from "../ui.js";
import { toast } from "../toast.js";
import { icon } from "../icons.js";
import {
  STATUS_META,
  escapeHtml,
  statusBadge,
  severityBadge,
  categoryBadge,
  statusLabel,
  locationLabel,
  formatDate,
  formatDateTime,
  relativeTime,
  isOverdue,
  daysOverdue,
  ratingStars,
  avatarHtml,
  specialtyLabel,
  pluralize,
} from "../utils.js";
import { markTicketRead } from "../notifications.js";

const ACTIVE_STATUSES = ["assigned", "in_progress", "on_hold", "reopened"];

function backLink(role) {
  if (role === "admin") return { href: "#/admin/tickets", label: "All tickets" };
  if (role === "technician") return { href: "#/jobs", label: "My jobs" };
  return { href: "#/tickets", label: "My tickets" };
}

function meta(label, valueHtml) {
  return `
    <div class="meta">
      <span class="meta__label">${escapeHtml(label)}</span>
      <span class="meta__value">${valueHtml}</span>
    </div>
  `;
}

function photoGrid(paths, photoUrls, label) {
  const available = (paths ?? [])
    .map((path) => ({ path, url: photoUrls[path] }))
    .filter((item) => item.url);

  if (!available.length) {
    return (paths ?? []).length
      ? `<div class="alert alert--warning">${icon(
          "image"
        )}<div>Photos are attached but could not be loaded. Refresh to try again.</div></div>`
      : `<p class="text-sm text-muted">No photos attached.</p>`;
  }

  return `
    <div class="photo-grid">
      ${available
        .map(
          (item, index) => `
            <button type="button" class="photo-thumb" data-lightbox-url="${escapeHtml(
              item.url
            )}" aria-label="Open ${escapeHtml(label)} ${index + 1}">
              <img src="${escapeHtml(item.url)}" alt="${escapeHtml(label)} ${index + 1}"
                loading="lazy" />
            </button>`
        )
        .join("")}
    </div>
  `;
}

function actionButtons(ticket, profile) {
  const buttons = [];
  const isResident = profile.role === "resident";
  const isTechnician = profile.role === "technician";
  const isAdmin = profile.role === "admin";
  const isOwner = ticket.resident_id === profile.id;
  const isAssigned = ticket.assigned_to === profile.id;

  if (isResident && isOwner) {
    if (ticket.status === "resolved") {
      buttons.push(
        `<button type="button" class="btn btn--primary btn--block" data-action="confirm">${icon(
          "check-circle"
        )} Confirm & close</button>`,
        `<button type="button" class="btn btn--danger-ghost btn--block" data-action="reject">${icon(
          "rotate"
        )} Not fixed — reopen</button>`
      );
    }
  }

  if (isTechnician && isAssigned) {
    if (["assigned", "reopened"].includes(ticket.status)) {
      buttons.push(
        `<button type="button" class="btn btn--primary btn--block" data-action="start">${icon(
          "play"
        )} Start job</button>`
      );
    }
    if (ticket.status === "in_progress") {
      buttons.push(
        `<button type="button" class="btn btn--primary btn--block" data-action="resolve">${icon(
          "check-circle"
        )} Mark resolved</button>`,
        `<button type="button" class="btn btn--secondary btn--block" data-action="hold">${icon(
          "pause"
        )} Put on hold</button>`
      );
    }
    if (ticket.status === "on_hold") {
      buttons.push(
        `<button type="button" class="btn btn--primary btn--block" data-action="resume">${icon(
          "play"
        )} Resume job</button>`
      );
    }
    if (ACTIVE_STATUSES.includes(ticket.status)) {
      buttons.push(
        `<button type="button" class="btn btn--secondary btn--block" data-action="worklog">${icon(
          "clipboard"
        )} Add work log</button>`
      );
    }
  }

  if (isAdmin) {
    if (["reported", "reopened", "assigned"].includes(ticket.status)) {
      buttons.push(
        `<button type="button" class="btn btn--primary btn--block" data-action="assign">${icon(
          "user-check"
        )} ${ticket.assigned_to ? "Reassign technician" : "Assign technician"}</button>`
      );
    }
    if (["resolved", "closed"].includes(ticket.status)) {
      buttons.push(
        `<button type="button" class="btn btn--danger-ghost btn--block" data-action="reopen">${icon(
          "rotate"
        )} Reopen ticket</button>`
      );
    }
    if (ACTIVE_STATUSES.includes(ticket.status)) {
      buttons.push(
        `<button type="button" class="btn btn--secondary btn--block" data-action="worklog">${icon(
          "clipboard"
        )} Add work log</button>`
      );
    }
  }

  if (isResident && isOwner && ticket.status !== "closed") {
    const photoCount = Array.isArray(ticket.photo_paths) ? ticket.photo_paths.length : 0;
    if (photoCount < 3) {
      buttons.push(
        `<button type="button" class="btn btn--secondary btn--block" data-action="attach">${icon(
          "camera"
        )} Add photos (${photoCount}/3)</button>`
      );
    }
  }

  return buttons;
}

function actionPanel(ticket, profile) {
  const buttons = actionButtons(ticket, profile);
  const isOwner = ticket.resident_id === profile.id;
  const isAssigned = ticket.assigned_to === profile.id;

  let guidance = "";
  if (profile.role === "technician" && !isAssigned) {
    guidance = `<div class="alert alert--info">${icon(
      "info"
    )}<div>This job is not assigned to you, so it is read-only.</div></div>`;
  } else if (profile.role === "resident" && !isOwner) {
    guidance = `<div class="alert alert--info">${icon(
      "info"
    )}<div>You are viewing this ticket as a resident, but you did not report it.</div></div>`;
  } else if (ticket.status === "resolved" && profile.role === "technician") {
    guidance = `<div class="alert alert--success">${icon(
      "check-circle"
    )}<div>Work is marked complete. The resident has been asked to confirm.</div></div>`;
  } else if (ticket.status === "closed") {
    guidance = `<div class="alert alert--success">${icon(
      "lock"
    )}<div>This ticket is closed. The full history is kept for audit.</div></div>`;
  } else if (ticket.status === "on_hold" && ticket.hold_reason) {
    guidance = `<div class="alert alert--warning">${icon(
      "pause"
    )}<div><strong>On hold:</strong> ${escapeHtml(ticket.hold_reason)}</div></div>`;
  }

  return `
    <section class="card" aria-labelledby="actions-heading">
      <div class="card__head">
        <h2 id="actions-heading">Actions</h2>
        ${statusBadge(ticket.status)}
      </div>
      <div class="card__body stack">
        <p class="text-sm text-muted">${escapeHtml(
          STATUS_META[ticket.status]?.description ?? "Ticket status."
        )}</p>
        ${guidance}
        ${
          buttons.length
            ? `<div class="stack-sm">${buttons.join("")}</div>`
            : `<p class="text-sm text-muted">No actions are available for you at this stage.</p>`
        }
        <hr class="divider" />
        <button type="button" class="btn btn--ghost btn--block" data-copy-link>${icon(
          "copy"
        )} Copy ticket link</button>
      </div>
    </section>
  `;
}

function detailCard(ticket) {
  const resident = ticket.resident;
  const technician = ticket.technician;
  const overdue = isOverdue(ticket);

  return `
    <section class="card" aria-labelledby="details-heading">
      <div class="card__head"><h2 id="details-heading">Ticket details</h2></div>
      <div class="card__body">
        <div class="meta-grid">
          ${meta(
            "Tracking ID",
            `<span class="mono">${escapeHtml(ticket.tracking_id)}</span>`
          )}
          ${meta("Category", categoryBadge(ticket.category))}
          ${meta("Priority", severityBadge(ticket.severity))}
          ${meta("Location", `${icon("map-pin")} ${escapeHtml(locationLabel(ticket))}`)}
          ${meta(
            "Reported by",
            resident
              ? `${avatarHtml(resident.full_name, "resident", "avatar--sm")} ${escapeHtml(
                  resident.full_name
                )}`
              : "—"
          )}
          ${meta(
            "Technician",
            technician
              ? `${avatarHtml(technician.full_name, "technician", "avatar--sm")} ${escapeHtml(
                  technician.full_name
                )}<br /><span class="text-xs text-muted">${escapeHtml(
                  specialtyLabel(technician.specialty)
                )}</span>`
              : `<span class="text-muted">Unassigned</span>`
          )}
          ${meta("Reported", escapeHtml(formatDateTime(ticket.created_at)))}
          ${meta(
            "Target date",
            ticket.target_date
              ? `<span class="${overdue ? "overdue-text" : ""}">${escapeHtml(
                  formatDate(ticket.target_date)
                )}${overdue ? ` · ${daysOverdue(ticket)}d overdue` : ""}</span>`
              : "—"
          )}
          ${meta("Last update", escapeHtml(relativeTime(ticket.updated_at)))}
          ${meta(
            "Resolved",
            ticket.resolved_at ? escapeHtml(formatDateTime(ticket.resolved_at)) : "—"
          )}
          ${meta(
            "Closed",
            ticket.closed_at ? escapeHtml(formatDateTime(ticket.closed_at)) : "—"
          )}
          ${meta(
            "Reopened",
            ticket.reopen_count
              ? `${ticket.reopen_count} time${ticket.reopen_count === 1 ? "" : "s"}`
              : "Never"
          )}
        </div>
      </div>
    </section>
  `;
}

function contactCard(ticket) {
  const resident = ticket.resident;
  const technician = ticket.technician;
  if (!resident && !technician) return "";

  return `
    <section class="card" aria-labelledby="contact-heading">
      <div class="card__head"><h2 id="contact-heading">Contacts</h2></div>
      <div class="card__body stack-sm">
        ${
          resident
            ? `<div class="row-between">
                <span class="text-sm">${avatarHtml(
                  resident.full_name,
                  "resident",
                  "avatar--sm"
                )} ${escapeHtml(resident.full_name)}</span>
                ${
                  resident.phone
                    ? `<a class="text-sm" href="tel:${escapeHtml(
                        resident.phone
                      )}">${icon("phone")} ${escapeHtml(resident.phone)}</a>`
                    : `<span class="text-xs text-muted">No phone</span>`
                }
              </div>`
            : ""
        }
        ${
          technician
            ? `<div class="row-between">
                <span class="text-sm">${avatarHtml(
                  technician.full_name,
                  "technician",
                  "avatar--sm"
                )} ${escapeHtml(technician.full_name)}</span>
                ${
                  technician.phone
                    ? `<a class="text-sm" href="tel:${escapeHtml(
                        technician.phone
                      )}">${icon("phone")} ${escapeHtml(technician.phone)}</a>`
                    : `<span class="text-xs text-muted">No phone</span>`
                }
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function feedbackCard(ticket) {
  if (!ticket.rating && !ticket.feedback) return "";
  return `
    <section class="card" aria-labelledby="feedback-heading">
      <div class="card__head"><h2 id="feedback-heading">Resident feedback</h2></div>
      <div class="card__body stack-sm">
        ${ticket.rating ? ratingStars(ticket.rating) : ""}
        ${
          ticket.feedback
            ? `<p class="prose">${escapeHtml(ticket.feedback)}</p>`
            : `<p class="text-sm text-muted">No written feedback.</p>`
        }
      </div>
    </section>
  `;
}

function noteComposer(ticket, profile) {
  const canNote =
    profile.role === "admin" ||
    ticket.resident_id === profile.id ||
    ticket.assigned_to === profile.id;
  if (!canNote) return "";

  return `
    <section class="card" aria-labelledby="note-heading">
      <div class="card__head"><h2 id="note-heading">Add a note</h2></div>
      <div class="card__body">
        <form class="stack" data-note-form novalidate>
          <div class="field">
            <label class="field__label" for="note-message">Note</label>
            <textarea id="note-message" name="message" rows="3" maxlength="1000" required
              placeholder="Add context, access instructions or an update for everyone involved."
              aria-describedby="note-hint note-error"></textarea>
            <div class="row-between">
              <p class="field__hint" id="note-hint">Visible to the resident, technician and desk. Up to 1000 characters.</p>
              <span class="char-count" data-count>0/1000</span>
            </div>
            <p class="field__error" id="note-error" data-error role="alert" hidden></p>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn--primary" data-note-submit>${icon(
              "send"
            )} Post note</button>
          </div>
        </form>
      </div>
    </section>
  `;
}

export default async function ticketDetailPage({
  container,
  params,
  profile,
  setTitle,
  onCleanup,
}) {
  const ticketId = params.id;
  const back = backLink(profile.role);
  let ticket = null;
  let events = [];
  let photoUrls = {};
  let unsubscribe = null;
  let reloadTimer = null;
  let disposed = false;
  let notificationsMarked = false;

  container.innerHTML = `<div class="page">${loadingBlock("Opening ticket…")}</div>`;

  const isEditing = () => {
    const active = document.activeElement;
    return (
      active &&
      container.contains(active) &&
      ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)
    );
  };

  const renderMissing = () => {
    container.innerHTML = `
      <div class="page">
        <div class="row-between mb-4">
          <a class="link-btn" href="${back.href}">${icon("arrow-left")} ${escapeHtml(
            back.label
          )}</a>
        </div>
        ${errorState({
          title: "Ticket not found",
          text: "This ticket may have been removed, or your account may not have access to it.",
          actionHtml: `<a class="btn btn--primary" href="${back.href}">Go back</a>`,
        })}
      </div>
    `;
  };

  const renderFatal = (message) => {
    container.innerHTML = `
      <div class="page">
        <div class="row-between mb-4">
          <a class="link-btn" href="${back.href}">${icon("arrow-left")} ${escapeHtml(
            back.label
          )}</a>
        </div>
        ${errorState({
          title: "We could not open this ticket",
          text: message || "Check your connection and try again.",
          actionHtml:
            '<button type="button" class="btn btn--primary" data-retry>Try again</button>',
        })}
      </div>
    `;
    container.querySelector("[data-retry]")?.addEventListener("click", () => void load());
  };

  const render = () => {
    const overdue = isOverdue(ticket);
    const photoPaths = Array.isArray(ticket.photo_paths) ? ticket.photo_paths : [];
    const eventPaths = events.flatMap((event) =>
      Array.isArray(event.photo_paths) ? event.photo_paths : []
    );

    container.innerHTML = `
      <div class="page">
        <div class="row-between mb-4">
          <a class="link-btn" href="${back.href}">${icon("arrow-left")} ${escapeHtml(
            back.label
          )}</a>
          <span class="row text-xs text-muted" title="Updates appear automatically">
            <span class="live-dot" aria-hidden="true"></span> Live
          </span>
        </div>

        ${pageHeader({
          eyebrow: `Ticket ${ticket.tracking_id}`,
          title: ticket.title,
          subtitle: locationLabel(ticket),
          actions: `<button type="button" class="btn btn--secondary" data-copy-link>${icon(
            "copy"
          )} Copy link</button>`,
        })}

        <div class="ticket-card__badges mb-4">
          ${statusBadge(ticket.status)}
          ${severityBadge(ticket.severity)}
          ${categoryBadge(ticket.category)}
          ${
            overdue
              ? `<span class="badge badge--overdue">${icon("clock")}${daysOverdue(
                  ticket
                )}d overdue</span>`
              : ""
          }
        </div>

        ${ticketStepper(ticket)}

        <div class="detail-grid mt-4">
          <div class="detail-main">
            <section class="card" aria-labelledby="report-heading">
              <div class="card__head">
                <h2 id="report-heading">What was reported</h2>
                <span class="text-xs text-muted">${pluralize(
                  photoPaths.length,
                  "photo"
                )}</span>
              </div>
              <div class="card__body stack">
                <div class="meta-grid">
                  ${meta("Category", categoryBadge(ticket.category))}
                  ${meta("Priority", severityBadge(ticket.severity))}
                  ${meta(
                    "Location type",
                    ticket.location_type === "common_area" ? "Shared area" : "Private room"
                  )}
                  ${meta("Reported", escapeHtml(formatDateTime(ticket.created_at)))}
                </div>
                <div class="description-block prose">${escapeHtml(ticket.description)}</div>
                <div>
                  <h3 class="text-sm mb-2">Photos</h3>
                  ${photoGrid(photoPaths, photoUrls, "Reported photo")}
                </div>
              </div>
            </section>

            <section class="card" id="activity" aria-labelledby="activity-heading">
              <div class="card__head">
                <h2 id="activity-heading">Activity</h2>
                <span class="text-xs text-muted">${pluralize(
                  events.length,
                  "event"
                )}</span>
              </div>
              <div class="card__body">
                ${ticketTimeline(events, { photoUrls })}
              </div>
            </section>

            ${noteComposer(ticket, profile)}
          </div>

          <aside class="detail-side">
            ${actionPanel(ticket, profile)}
            ${detailCard(ticket)}
            ${contactCard(ticket)}
            ${feedbackCard(ticket)}
          </aside>
        </div>
      </div>
    `;

    setTitle(ticket.title, ticket.tracking_id);

    const noteForm = container.querySelector("[data-note-form]");
    if (noteForm) {
      const textarea = noteForm.querySelector("#note-message");
      const counter = noteForm.querySelector("[data-count]");
      const errorElement = noteForm.querySelector("[data-error]");
      textarea?.addEventListener("input", () => {
        if (counter) counter.textContent = `${textarea.value.length}/1000`;
        textarea.removeAttribute("aria-invalid");
        if (errorElement) errorElement.hidden = true;
      });
    }
  };

  const load = async ({ silent = false } = {}) => {
    if (!silent) {
      container.innerHTML = `<div class="page">${loadingBlock("Opening ticket…")}</div>`;
    }
    try {
      const [nextTicket, nextEvents] = await Promise.all([
        getTicket(ticketId),
        getTicketEvents(ticketId),
      ]);
      if (disposed) return;
      if (!nextTicket) {
        renderMissing();
        return;
      }

      ticket = nextTicket;
      events = nextEvents;

      const paths = [
        ...(Array.isArray(ticket.photo_paths) ? ticket.photo_paths : []),
        ...events.flatMap((event) =>
          Array.isArray(event.photo_paths) ? event.photo_paths : []
        ),
      ];
      try {
        photoUrls = await getSignedPhotoUrls(paths);
      } catch (photoError) {
        console.error("Could not sign photo URLs", photoError);
        photoUrls = {};
      }
      if (disposed) return;

      if (silent && isEditing()) return;

      render();

      if (!notificationsMarked) {
        notificationsMarked = true;
        void markTicketRead(ticket.id);
      }

      if (!unsubscribe) {
        try {
          unsubscribe = subscribeToTicket(ticketId, () => {
            window.clearTimeout(reloadTimer);
            reloadTimer = window.setTimeout(() => {
              void load({ silent: true });
            }, 650);
          });
        } catch (realtimeError) {
          console.error("Could not subscribe to ticket updates", realtimeError);
        }
      }
    } catch (error) {
      console.error(error);
      if (silent) {
        toast("Could not refresh this ticket. Check your connection.", "warning");
        return;
      }
      renderFatal(error.message);
    }
  };

  const handleAction = async (action, button) => {
    if (!ticket) return;

    if (action === "assign") {
      await openAssignModal({
        ticket,
        onAssigned: () => {
          void load({ silent: true });
        },
      });
      return;
    }

    if (action === "confirm") {
      openConfirmCloseModal({
        ticket,
        onDone: () => {
          void load({ silent: true });
        },
      });
      return;
    }

    if (action === "reject") {
      void openRejectModal({
        ticket,
        onDone: () => {
          void load({ silent: true });
        },
      });
      return;
    }

    if (action === "reopen") {
      void openAdminReopenModal({
        ticket,
        onDone: () => {
          void load({ silent: true });
        },
      });
      return;
    }

    if (action === "resolve") {
      openResolveModal({
        ticket,
        onDone: () => {
          void load({ silent: true });
        },
      });
      return;
    }

    if (action === "worklog") {
      openWorkLogModal({
        ticket,
        onDone: () => {
          void load({ silent: true });
        },
      });
      return;
    }

    if (action === "hold") {
      void openHoldModal({
        ticket,
        onDone: () => {
          void load({ silent: true });
        },
      });
      return;
    }

    if (action === "attach") {
      openAttachPhotosModal({
        ticket,
        onDone: () => {
          void load({ silent: true });
        },
      });
      return;
    }

    if (action === "start" || action === "resume") {
      const start = action === "start";
      const confirmed = await confirmDialog({
        title: start ? "Start this job?" : "Resume this job?",
        message: start
          ? "The resident and the maintenance desk will see that work has started."
          : "The job will move back to In progress and the hold reason will be cleared.",
        confirmLabel: start ? "Start job" : "Resume job",
      });
      if (!confirmed) return;

      button.disabled = true;
      try {
        await technicianUpdateStatus(ticket.id, "in_progress");
        toast(start ? "Job started. The resident has been notified." : "Job resumed.", "success", {
          title: start ? "Work started" : "Work resumed",
        });
        await load({ silent: true });
      } catch (error) {
        button.disabled = false;
        handleError(error, "Could not update the job status.");
      }
    }
  };

  container.addEventListener("click", (event) => {
    const photo = event.target.closest("[data-lightbox-url]");
    if (photo) {
      openLightbox(photo.dataset.lightboxUrl, photo.getAttribute("aria-label") || "Ticket photo");
      return;
    }

    const copyButton = event.target.closest("[data-copy-link]");
    if (copyButton) {
      void copyToClipboard(window.location.href);
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      event.preventDefault();
      void handleAction(actionButton.dataset.action, actionButton);
    }
  });

  container.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-note-form]");
    if (!form) return;
    event.preventDefault();
    if (!ticket) return;

    const textarea = form.querySelector("#note-message");
    const errorElement = form.querySelector("[data-error]");
    const submitButton = form.querySelector("[data-note-submit]");
    const message = textarea.value.trim();

    if (message.length < 1 || message.length > 1000) {
      textarea.setAttribute("aria-invalid", "true");
      errorElement.textContent = "Write a note between 1 and 1000 characters.";
      errorElement.hidden = false;
      textarea.focus();
      return;
    }

    setButtonBusy(submitButton, true, "Posting…");
    textarea.disabled = true;
    try {
      await addTicketNote(ticket.id, message);
      toast("Your note has been added to the ticket.", "success");
      textarea.value = "";
      await load({ silent: true });
    } catch (error) {
      setButtonBusy(submitButton, false);
      textarea.disabled = false;
      handleError(error, "Could not add the note.");
    }
  });

  onCleanup(() => {
    disposed = true;
    window.clearTimeout(reloadTimer);
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  });

  await load();
}
