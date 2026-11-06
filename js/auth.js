import { initializeData, readData, saveData, currentUser, passwordRecord, SESSION_KEY, watchData } from './localData.js';
import { setStore, resetStore, store } from './store.js';

function applyLocalSession() {
  try {
    const profile = currentUser();
    const session = { user: { id: profile.id, email: profile.email } };
    setStore({ ready: true, session, profile });
    return { session, user: session.user };
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    resetStore();
    return { session: null, user: null };
  }
}

export async function initAuth() {
  await initializeData();
  applyLocalSession();
  watchData(applyLocalSession);
}
export async function refreshProfile() { applyLocalSession(); return store.profile; }
export async function signIn(email, password) {
  await initializeData();
  const data = readData();
  const profile = data.profiles.find(person => person.email.toLowerCase() === String(email).trim().toLowerCase());
  const record = profile && data.credentials[profile.id];
  if (!record || (await passwordRecord(password, record.salt)).hash !== record.hash) throw new Error('Email or password is incorrect.');
  if (!profile.is_active) throw new Error('This account has been deactivated. Sign in as an administrator to reactivate it.');
  sessionStorage.setItem(SESSION_KEY, profile.id);
  return applyLocalSession();
}
export async function signUp({ fullName, email, password, phone, block, roomNumber }) {
  await initializeData();
  email = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  if (password.length < 6) throw new Error('Use at least 6 characters for your password.');
  fullName = String(fullName).trim();
  if (fullName.length < 2 || fullName.length > 80) throw new Error('Name must contain 2–80 characters.');
  const record = await passwordRecord(password);
  const data = readData();
  if (data.profiles.some(person => person.email.toLowerCase() === email)) throw new Error('An account already exists for this email.');
  const id = crypto.randomUUID();
  data.profiles.push({ id, email, full_name: fullName, phone: phone || null, block: block || null, room_number: roomNumber || null, role: 'resident', specialty: null, is_active: true, created_at: new Date().toISOString() });
  data.credentials[id] = record;
  saveData(data);
  sessionStorage.setItem(SESSION_KEY, id);
  return applyLocalSession();
}

export async function updatePassword(password) {
  if (password.length < 6) throw new Error('Use at least 6 characters.');
  const actor = currentUser();
  const record = await passwordRecord(password);
  const data = readData();
  currentUser(data);
  data.credentials[actor.id] = record;
  saveData(data);
  setStore({ recoveryMode: false });
}
export async function adminResetPassword(userId, password) {
  if (password.length < 6) throw new Error('Use at least 6 characters.');
  if (currentUser().role !== 'admin') throw new Error('Only administrators can reset passwords.');
  const record = await passwordRecord(password);
  const data = readData();
  if (currentUser(data).role !== 'admin') throw new Error('Only administrators can reset passwords.');
  if (!data.profiles.some(person => person.id === userId)) throw new Error('Account not found.');
  data.credentials[userId] = record;
  saveData(data);
}
export async function signOut() {
  sessionStorage.removeItem(SESSION_KEY);
  resetStore();
}

export async function adminCreateTechnician({ fullName, email, password, specialty, phone = '' }) {
  if (currentUser().role !== 'admin') throw new Error('Only administrators can add technicians.');
  fullName = String(fullName).trim();
  email = String(email).trim().toLowerCase();
  phone = String(phone).trim();
  if (fullName.length < 2 || fullName.length > 80) throw new Error('Name must contain 2–80 characters.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Enter a valid email address.');
  if (password.length < 6) throw new Error('Use at least 6 characters for the password.');
  if (!['plumbing', 'electrical', 'carpentry_structure', 'general'].includes(specialty)) throw new Error('Choose a valid specialty.');
  if (phone && !/^\+?[\d\s()-]{7,20}$/.test(phone)) throw new Error('Enter a valid phone number.');
  const credential = await passwordRecord(password);
  const data = readData();
  if (currentUser(data).role !== 'admin') throw new Error('Only administrators can add technicians.');
  if (data.profiles.some(person => person.email.toLowerCase() === email)) throw new Error('An account already exists for this email.');
  const profile = { id: crypto.randomUUID(), full_name: fullName, email, phone: phone || null, role: 'technician', specialty, block: null, room_number: null, is_active: true, created_at: new Date().toISOString() };
  data.profiles.push(profile);
  data.credentials[profile.id] = credential;
  saveData(data);
  return profile;
}
