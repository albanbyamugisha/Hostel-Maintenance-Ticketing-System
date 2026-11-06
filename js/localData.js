import { DEMO_DATA } from './demoData.js';
import { INITIAL_ACCOUNTS } from './accounts.js';

export const DATA_KEY = 'hostelcare-local-v1';
export const SESSION_KEY = 'hostelcare-session-v1';
const CHANGE_EVENT = 'hostelcare-data-change';
let initializing;

export function readData() {
  const raw = localStorage.getItem(DATA_KEY);
  if (!raw) throw new Error('Account data is unavailable. Reload and try again.');
  try { return JSON.parse(raw); }
  catch { throw new Error('Saved data could not be read. Contact the system administrator.'); }
}

export function saveData(data) {
  try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); }
  catch { throw new Error('This browser could not save your changes. Free some browser storage or allow site storage, then try again.'); }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function watchData(callback) {
  const listener = () => callback();
  const storageListener = event => { if (event.key === DATA_KEY || event.key === null) callback(); };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', storageListener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', storageListener);
  };
}

export async function passwordRecord(password, salt = crypto.randomUUID()) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return { salt, hash: Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('') };
}

export function initializeData() {
  if (initializing) return initializing;
  initializing = (async () => {
    if (localStorage.getItem(DATA_KEY)) {
      const data = readData();
      if (data.account_revision !== 2) {
        for (const account of INITIAL_ACCOUNTS) {
          const { credential, legacy_name, ...identity } = account;
          let profile = data.profiles.find(person => person.id === identity.id);
          if (profile) Object.assign(profile, identity, { phone: null, is_active: true });
          else data.profiles.push({ ...identity, phone: null, block: null, room_number: null, is_active: true, created_at: new Date().toISOString() });
          data.credentials[identity.id] = structuredClone(credential);
          if (legacy_name) for (const row of [...data.ticket_events, ...data.notifications]) {
            for (const field of ['message', 'body']) if (row[field]) row[field] = row[field].replaceAll(legacy_name, identity.full_name);
          }
        }
        data.account_revision = 2;
        saveData(data);
      }
      return;
    }
    const data = structuredClone(DEMO_DATA);
    const offset = Date.now() - new Date(data.seeded_at).getTime();
    for (const rows of [data.profiles, data.tickets, data.ticket_events, data.notifications]) {
      for (const row of rows) {
        for (const field of ['created_at', 'updated_at', 'resolved_at', 'closed_at', 'target_date']) {
          if (row[field]) {
            const shifted = new Date(new Date(row[field]).getTime() + offset).toISOString();
            row[field] = field === 'target_date' ? shifted.slice(0, 10) : shifted;
          }
        }
      }
    }
    data.credentials = {};
    for (const account of INITIAL_ACCOUNTS) data.credentials[account.id] = structuredClone(account.credential);
    data.account_revision = 2;
    data.next_tracking_number = 101;
    data.photos = [];
    data.version = 1;
    // Another tab may have finished initialization while passwords were hashed.
    if (!localStorage.getItem(DATA_KEY)) saveData(data);
  })().catch(error => { initializing = null; throw error; });
  return initializing;
}

export function sessionUserId() { return sessionStorage.getItem(SESSION_KEY); }
export function currentUser(data = readData()) {
  const profile = data.profiles.find(person => person.id === sessionUserId());
  if (!profile?.is_active) throw new Error('Sign in with an active account to continue.');
  return profile;
}
export function canAccess(ticket, actor) {
  return actor.role === 'admin' || (actor.role === 'resident' && ticket.resident_id === actor.id) ||
    (actor.role === 'technician' && ticket.assigned_to === actor.id);
}
export function publicProfile(profile) { return profile ? structuredClone(profile) : null; }
