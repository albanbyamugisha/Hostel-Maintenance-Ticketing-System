// Run: node --experimental-vm-modules tests/local.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..');
function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
const window = new EventTarget();
Object.assign(window, { setTimeout, clearTimeout });
const photoStorage = process.env.FAKE_INDEXEDDB_MODULE ? require(process.env.FAKE_INDEXEDDB_MODULE).indexedDB : undefined;
const context = vm.createContext({ indexedDB: photoStorage, console, window, Event, crypto: webcrypto, localStorage: memoryStorage(), sessionStorage: memoryStorage(), structuredClone, TextEncoder, URL, Blob });
const modules = new Map();
function moduleFor(file) {
  if (!modules.has(file)) modules.set(file, new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file }));
  return modules.get(file);
}
(async () => {
  const entry = new vm.SourceTextModule(`import * as auth from './js/auth.js'; import * as api from './js/api.js'; import * as local from './js/localData.js'; export {auth,api,local};`, { context, identifier: path.join(root, 'test-entry.js') });
  await entry.link((specifier, parent) => moduleFor(path.resolve(path.dirname(parent.identifier), specifier)));
  await entry.evaluate();
  const { auth, api, local } = entry.namespace;
  await auth.initAuth();
  let checks = 0;
  async function pass(fn) { checks++; return await fn(); }
  async function denied(fn) { checks++; await assert.rejects(fn); }
  const passwords = { 'derrick@hostel.com': 'derrick55', 'ataho@hostel.com': 'ataho55', 'annibow@hostel.com': 'annibow55', 'racheal@hostel.com': 'racheal55', 'cyril@hostel.con': 'cyril55', 'alison@hostel.com': 'alison55', 'collins@hostel.com': 'collins55', 'janepher@hostel.com': 'janepher55', 'mark@hostel.com': 'mark55' };
  const login = (email, password = passwords[email]) => auth.signIn(email, password);
  for (const email of Object.keys(passwords)) {
    await pass(() => login(email));
    assert.equal(local.currentUser().email, email);
    await auth.signOut();
  }
  await denied(() => auth.signIn('derrick@hostel.com', 'WrongPassword'));
  await login('racheal@hostel.com');
  const ticket = await pass(() => api.createTicket({ block: 'Block A', floor: '2', roomNumber: '201', locationType: 'room', category: 'plumbing', severity: 'high', title: 'Leaking bathroom tap', description: 'Water leaks from the tap even when it is fully closed.' }));
  if (photoStorage) {
    const paths = await pass(() => api.uploadTicketPhotos(ticket.id, [new Blob(['photo bytes'], { type: 'image/jpeg' })]));
    await pass(() => api.attachTicketPhotos(ticket.id, paths));
    const urls = await pass(() => api.getSignedPhotoUrls(paths));
    assert.ok(urls[paths[0]].startsWith('blob:'));
    await pass(() => api.removeTicketPhotos(paths));
    assert.ok(local.readData().photos.some(photo => photo.path === paths[0]));
    const unused = await pass(() => api.uploadTicketPhotos(ticket.id, [new Blob(['photo bytes'], { type: 'image/jpeg' })]));
    await pass(() => api.removeTicketPhotos(unused));
    assert.ok(!local.readData().photos.some(photo => photo.path === unused[0]));
  }
  await denied(() => api.assignTicket(ticket.id, '22222222-2222-4222-8222-222222222222', null));
  await denied(() => api.residentConfirmClose(ticket.id));
  await denied(() => api.adminUpdateUser(local.currentUser().id, { role: 'admin' }));
  await login('cyril@hostel.con');
  assert.equal(await pass(() => api.getTicket(ticket.id)), null);
  await denied(() => api.addTicketNote(ticket.id, 'An unrelated person'));
  await login('derrick@hostel.com');
  await denied(() => api.adminUpdateUser(local.currentUser().id, { is_active: false }));
  await pass(() => api.assignTicket(ticket.id, '22222222-2222-4222-8222-222222222222', null));
  await login('annibow@hostel.com');
  await denied(() => api.technicianUpdateStatus(ticket.id, 'in_progress'));
  await login('ataho@hostel.com');
  await denied(() => api.technicianUpdateStatus(ticket.id, 'resolved', { note: 'Fixed the leaking tap.' }));
  await pass(() => api.technicianUpdateStatus(ticket.id, 'in_progress'));
  await denied(() => api.technicianUpdateStatus(ticket.id, 'on_hold'));
  await pass(() => api.technicianUpdateStatus(ticket.id, 'on_hold', { note: 'Waiting for a replacement washer.' }));
  await pass(() => api.technicianUpdateStatus(ticket.id, 'in_progress'));
  await denied(() => api.technicianUpdateStatus(ticket.id, 'resolved', { note: 'Done' }));
  await pass(() => api.technicianUpdateStatus(ticket.id, 'resolved', { note: 'Replaced the washer and tested for leaks.', partsUsed: '1 washer' }));
  await login('racheal@hostel.com');
  await pass(() => api.residentReject(ticket.id, 'The tap is still dripping.'));
  await login('ataho@hostel.com');
  await pass(() => api.technicianUpdateStatus(ticket.id, 'in_progress'));
  await pass(() => api.technicianUpdateStatus(ticket.id, 'resolved', { note: 'Replaced the cartridge and confirmed the leak stopped.' }));
  await login('racheal@hostel.com');
  await pass(() => api.residentConfirmClose(ticket.id, 5, 'Working properly now.'));
  assert.equal((await api.getTicket(ticket.id)).status, 'closed');
  assert.ok((await api.getTicketEvents(ticket.id)).length >= 10);
  const notifications = await pass(() => api.getNotifications());
  assert.ok(notifications.length > 0);
  await pass(() => api.markAllNotificationsRead(local.currentUser().id));
  assert.equal(await api.getUnreadCount(local.currentUser().id), 0);
  await login('derrick@hostel.com');
  const technician = await pass(() => auth.adminCreateTechnician({fullName: 'Test Technician', email: 'new-tech@example.test', password: 'NewTech#55', specialty: 'general'}));
  await denied(() => auth.adminCreateTechnician({fullName: 'Duplicate Technician', email: 'new-tech@example.test', password: 'NewTech#55', specialty: 'general'}));
  assert.equal(local.currentUser().email, 'derrick@hostel.com');
  assert.ok((await api.getTechnicians()).some(person => person.id === technician.id));
  await pass(() => auth.signIn('new-tech@example.test', 'NewTech#55'));
  assert.equal(local.currentUser().role, 'technician');
  await denied(() => auth.adminCreateTechnician({fullName: 'Not Allowed', email: 'bad@example.test', password: 'NotAllowed55', specialty: 'general'}));
  await login('derrick@hostel.com');
  const reports = await pass(() => api.getAdminReports());
  assert.equal(reports.totals.total, 16);
  await pass(() => api.adminReopen(ticket.id, 'Resident reported another leak.'));
  await pass(() => auth.adminResetPassword('55555555-5555-4555-8555-555555555555', 'Replacement#123'));
  await denied(() => login('cyril@hostel.con'));
  await pass(() => auth.signIn('cyril@hostel.con', 'Replacement#123'));
  await login('derrick@hostel.com');
  await pass(() => api.adminUpdateUser('55555555-5555-4555-8555-555555555555', { is_active: false }));
  await denied(() => auth.signIn('cyril@hostel.con', 'Replacement#123'));
  await pass(() => auth.signUp({ fullName: 'New Resident', email: 'new@example.test', password: 'NewResident#123', phone: '', block: 'Block B', roomNumber: '12' }));
  assert.equal(local.currentUser().role, 'resident');
  await pass(() => auth.updatePassword('ChangedResident#123'));
  await auth.signOut();
  await denied(() => auth.signIn('new@example.test', 'NewResident#123'));
  await pass(() => auth.signIn('new@example.test', 'ChangedResident#123'));
  assert.equal(local.readData().tickets.length, 16);
  // A new module graph simulates reopening the app with a previous dataset.
  const beforeMigration = local.readData();
  const customResident = beforeMigration.profiles.find(person => person.email === 'new@example.test');
  delete beforeMigration.account_revision;
  beforeMigration.profiles.find(person => person.id === '11111111-1111-4111-8111-111111111111').email = 'admin@hostel.test';
  local.saveData(beforeMigration);
  modules.clear();
  const reopened = new vm.SourceTextModule("import * as auth from './js/auth.js'; import * as local from './js/localData.js'; export {auth,local};", {context,identifier:path.join(root,'reopen.js')});
  await reopened.link((specifier,parent) => moduleFor(path.resolve(path.dirname(parent.identifier),specifier)));
  await reopened.evaluate();
  await pass(() => reopened.namespace.auth.initAuth());
  assert.equal(reopened.namespace.local.readData().tickets.length,16);
  assert.ok(reopened.namespace.local.readData().profiles.some(person => person.id === customResident.id));
  await pass(() => reopened.namespace.auth.signIn('derrick@hostel.com','derrick55'));
  await pass(() => reopened.namespace.auth.signIn('new@example.test','ChangedResident#123'));
  console.log(`Passed ${checks} local login, lifecycle, role and persistence checks.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
