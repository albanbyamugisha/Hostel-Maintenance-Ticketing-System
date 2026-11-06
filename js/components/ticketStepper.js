import { escapeHtml, statusLabel, STATUS_META } from "../utils.js";
import { icon } from "../icons.js";

const STEPS = [
  { key: "reported", label: "Reported", icon: "flag", hint: "Issue logged" },
  { key: "assigned", label: "Assigned", icon: "user-check", hint: "Technician allocated" },
  { key: "in_progress", label: "In progress", icon: "wrench", hint: "Work under way" },
  { key: "resolved", label: "Resolved", icon: "check-circle", hint: "Awaiting confirmation" },
  { key: "closed", label: "Closed", icon: "lock", hint: "Confirmed & archived" },
];

function currentIndex(ticket) {
  switch (ticket.status) {
    case "reported":
      return 0;
    case "assigned":
      return 1;
    case "in_progress":
    case "on_hold":
      return 2;
    case "resolved":
      return 3;
    case "closed":
      return 4;
    case "reopened":
      return ticket.assigned_to ? 1 : 0;
    default:
      return 0;
  }
}

export function ticketStepper(ticket) {
  const index = currentIndex(ticket);
  const isClosed = ticket.status === "closed";
  const onHold = ticket.status === "on_hold";
  const reopened = ticket.status === "reopened";

  const steps = STEPS.map((step, position) => {
    let state = "todo";
    if (isClosed) {
      state = position === STEPS.length - 1 ? "current" : "done";
    } else if (position < index) {
      state = "done";
    } else if (position === index) {
      state = "current";
    }

    let label = step.label;
    if (position === 2 && onHold) label = "On hold";
    if (position === 0 && reopened) label = "Reopened";

    return `
      <li class="stepper__step" data-state="${state}"
        ${state === "current" ? 'aria-current="step"' : ""}>
        <span class="stepper__node">${icon(state === "done" ? "check" : step.icon)}</span>
        <span class="stepper__label">${escapeHtml(label)}</span>
        <span class="stepper__hint">${escapeHtml(
          state === "current" ? STATUS_META[ticket.status]?.label ?? step.hint : step.hint
        )}</span>
      </li>
    `;
  }).join("");

  return `
    <div class="stepper-wrap">
      <ol class="stepper" aria-label="Ticket progress">
        ${steps}
      </ol>
      ${
        onHold && ticket.hold_reason
          ? `<p class="stepper__branch stepper__branch--active">${icon(
              "pause"
            )} <span><strong>On hold:</strong> ${escapeHtml(ticket.hold_reason)}</span></p>`
          : ""
      }
      ${
        reopened
          ? `<p class="stepper__branch stepper__branch--active">${icon(
              "rotate"
            )} <span><strong>Reopened</strong> — the repair needs another look${
              ticket.reopen_count > 1 ? ` (${ticket.reopen_count} times)` : ""
            }.</span></p>`
          : ""
      }
      ${
        !reopened && ticket.reopen_count > 0
          ? `<p class="stepper__branch">${icon("rotate")} <span>This ticket has been reopened ${escapeHtml(
              String(ticket.reopen_count)
            )} time${ticket.reopen_count === 1 ? "" : "s"}.</span></p>`
          : ""
      }
    </div>
  `;
}

export function currentStatusLabel(ticket) {
  return statusLabel(ticket.status);
}
