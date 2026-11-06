import { adminCreateTechnician } from '../auth.js';
import { openModal, setButtonBusy } from '../ui.js';
import { toast } from '../toast.js';

export function openCreateTechnicianModal({ onCreated }) {
  let submitting = false;
  return openModal({
    title: 'Add technician',
    subtitle: 'Create a technician account and choose the type of repairs they handle.',
    body: `<form class="stack" id="create-technician-form">
      <div class="field"><label class="field__label" for="technician-name">Full name</label><input id="technician-name" name="fullName" required minlength="2" maxlength="80" autocomplete="name" data-autofocus /></div>
      <div class="field"><label class="field__label" for="technician-email">Email address</label><input id="technician-email" name="email" type="email" required maxlength="254" autocomplete="off" /></div>
      <div class="field"><label class="field__label" for="technician-password">Initial password</label><input id="technician-password" name="password" type="password" required minlength="6" autocomplete="new-password" /><p class="field__hint">At least 6 characters. Give this password to the technician so they can sign in.</p></div>
      <div class="field"><label class="field__label" for="technician-specialty">Specialty</label><select id="technician-specialty" name="specialty" required><option value="general">General maintenance</option><option value="plumbing">Plumbing</option><option value="electrical">Electrical</option><option value="carpentry_structure">Carpentry &amp; structure</option></select></div>
      <div class="field"><label class="field__label" for="technician-phone">Phone (optional)</label><input id="technician-phone" name="phone" type="tel" maxlength="20" autocomplete="tel" /></div>
      <p class="field__error" data-create-error role="alert" hidden></p>
    </form>`,
    footer: '<button type="button" class="btn btn--secondary" data-cancel>Cancel</button><button type="submit" form="create-technician-form" class="btn btn--primary">Create technician</button>',
    onMount(dialog, close) {
      const form = dialog.querySelector('form');
      const button = dialog.querySelector('[type="submit"]');
      const error = dialog.querySelector('[data-create-error]');
      dialog.querySelector('[data-cancel]').addEventListener('click', () => { if (!submitting) close(); });
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (submitting || !form.reportValidity()) return;
        submitting = true;
        error.hidden = true;
        setButtonBusy(button, true, 'Creating…');
        try {
          const profile = await adminCreateTechnician(Object.fromEntries(new FormData(form)));
          toast(`${profile.full_name}'s technician account has been created.`, 'success');
          close('created');
          onCreated?.(profile);
        } catch (caught) {
          error.textContent = caught.message || 'The account could not be created.';
          error.hidden = false;
          submitting = false;
          setButtonBusy(button, false);
        }
      });
    },
  });
}
