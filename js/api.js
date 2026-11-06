import { readData, saveData, currentUser, canAccess, watchData } from './localData.js';
import { uid, todayISO, SEVERITY_RANK } from './utils.js';

const OPEN = ['reported', 'assigned', 'in_progress', 'on_hold', 'reopened'];
const CATEGORIES = ['plumbing', 'electrical', 'carpentry_structure'];
const SEVERITIES = ['low', 'medium', 'high', 'emergency'];
const now = () => new Date().toISOString();
const check = (condition, message) => { if (!condition) throw new Error(message); };
const text = (value, min, max, label) => {
  const clean = String(value ?? '').trim();
  check(clean.length >= min && clean.length <= max, `${label} must contain ${min}–${max} characters.`);
  return clean;
};
function context(ticketId) {
  const data = readData(), actor = currentUser(data);
  const ticket = ticketId ? data.tickets.find(item => item.id === ticketId) : null;
  if (ticketId) check(ticket && canAccess(ticket, actor), 'Ticket not found or access denied.');
  return { data, actor, ticket };
}
function enrich(ticket, data) {
  return { ...structuredClone(ticket), resident: data.profiles.find(person => person.id === ticket.resident_id) ?? null, technician: data.profiles.find(person => person.id === ticket.assigned_to) ?? null };
}
function event(data, ticket, actor, type, message, extra = {}) {
  const entry = { id: uid(), ticket_id: ticket.id, actor_id: actor.id, event_type: type, from_status: null, to_status: null, message, parts_used: null, photo_paths: [], created_at: now(), ...extra };
  data.ticket_events.push(entry);
  ticket.updated_at = now();
  return entry;
}
function notify(data, userId, ticket, title, body) {
  if (!userId || !data.profiles.some(person => person.id === userId && person.is_active)) return;
  data.notifications.push({ id: uid(), user_id: userId, ticket_id: ticket.id, title: `${title}: ${ticket.tracking_id}`, body, is_read: false, created_at: now() });
}
function notifyAdmins(data, ticket, title, body) {
  data.profiles.filter(person => person.role === 'admin' && person.is_active).forEach(person => notify(data, person.id, ticket, title, body));
}
function photoPaths(data, ticketId, actor, paths) {
  check(Array.isArray(paths) && paths.length <= 3, 'Attach at most 3 photos.');
  for (const path of paths) check(data.photos.some(photo => photo.path === path && photo.ticket_id === ticketId && photo.owner_id === actor.id), 'Invalid photo attachment.');
  return paths;
}
function finish(data, ticket) { saveData(data); return enrich(ticket, data); }
function visibleTickets(filters = {}) {
  const { data, actor } = context();
  let rows = data.tickets.filter(ticket => canAccess(ticket, actor));
  for (const [filter, field] of [['status', 'status'], ['category', 'category'], ['severity', 'severity'], ['block', 'block'], ['technicianId', 'assigned_to'], ['residentId', 'resident_id']]) {
    if (filters[filter] && filters[filter] !== 'all') rows = rows.filter(ticket => ticket[field] === filters[filter]);
  }
  if (filters.statuses?.length) rows = rows.filter(ticket => filters.statuses.includes(ticket.status));
  if (filters.unassigned) rows = rows.filter(ticket => !ticket.assigned_to);
  if (filters.overdue) rows = rows.filter(ticket => ticket.target_date && ticket.target_date < todayISO() && OPEN.includes(ticket.status));
  if (filters.from) rows = rows.filter(ticket => ticket.created_at.slice(0, 10) >= filters.from);
  if (filters.to) rows = rows.filter(ticket => ticket.created_at.slice(0, 10) <= filters.to);
  const search = String(filters.search || '').trim().toLowerCase();
  if (search) rows = rows.filter(ticket => [ticket.tracking_id, ticket.title, ticket.description].some(value => value.toLowerCase().includes(search)));
  const sorts = { newest: ['created_at', -1], oldest: ['created_at', 1], severity: ['severity', -1], target: ['target_date', 1], updated: ['updated_at', -1], status: ['status', 1] };
  const [field, direction] = sorts[filters.sort] || sorts.newest;
  rows.sort((a, b) => {
    if (!a[field]) return b[field] ? 1 : 0;
    if (!b[field]) return -1;
    const result = field === 'severity' ? SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] : String(a[field]).localeCompare(String(b[field]));
    return result * direction || b.created_at.localeCompare(a.created_at);
  });
  return rows.map(ticket => enrich(ticket, data));
}
export async function getTicket(ticketId) {
  const { data, actor } = context();
  const ticket = data.tickets.find(item => item.id === ticketId);
  return ticket && canAccess(ticket, actor) ? enrich(ticket, data) : null;
}
export async function getTicketEvents(ticketId) {
  const { data } = context(ticketId);
  return data.ticket_events.filter(entry => entry.ticket_id === ticketId).sort((a, b) => a.created_at.localeCompare(b.created_at)).map(entry => ({ ...entry, actor: data.profiles.find(person => person.id === entry.actor_id) ?? null }));
}
export async function getTickets(filters = {}) {
  const rows = visibleTickets(filters), pageSize = Math.min(1000, Math.max(1, Number(filters.pageSize) || 20)), page = Math.max(0, Number(filters.page) || 0);
  return { data: rows.slice(page * pageSize, (page + 1) * pageSize), count: rows.length, pageSize, page };
}
export async function countTickets(filters = {}) { return visibleTickets(filters).length; }
export async function getAllTicketsForExport(filters = {}) { return visibleTickets(filters); }
export async function getOpenTickets(limit = 500) { return visibleTickets({ statuses: OPEN, sort: 'oldest' }).slice(0, limit); }
export async function getRecentTicketsForResident(residentId, limit = 8) { return visibleTickets({ residentId, sort: 'updated' }).slice(0, limit); }
export async function getAllTicketsForResident(residentId, limit = 500) { return visibleTickets({ residentId }).slice(0, limit); }
export async function getTicketsForTechnician(technicianId, limit = 500) { return visibleTickets({ technicianId }).slice(0, limit); }
export async function createTicket(payload) {
  const { data, actor } = context();
  check(actor.role === 'resident', 'Only residents can report issues.');
  check(CATEGORIES.includes(payload.category) && SEVERITIES.includes(payload.severity), 'Choose a valid category and severity.');
  check(['room', 'common_area'].includes(payload.locationType), 'Choose a valid location type.');
  const ticket = { id: uid(), tracking_id: `HMT-${new Date().getFullYear()}-${String(data.next_tracking_number++).padStart(6, '0')}`, resident_id: actor.id, block: text(payload.block, 1, 20, 'Block'), floor: text(payload.floor, 1, 10, 'Floor'), room_number: text(payload.roomNumber, 1, 10, 'Room or area'), location_type: payload.locationType, category: payload.category, severity: payload.severity, title: text(payload.title, 5, 120, 'Title'), description: text(payload.description, 10, 2000, 'Description'), status: 'reported', assigned_to: null, assigned_by: null, target_date: null, hold_reason: null, resolved_at: null, closed_at: null, rating: null, feedback: null, reopen_count: 0, photo_paths: [], created_at: now(), updated_at: now() };
  data.tickets.push(ticket);
  event(data, ticket, actor, 'created', 'Issue reported by resident.', { to_status: 'reported' });
  notifyAdmins(data, ticket, ticket.severity === 'emergency' ? 'EMERGENCY reported' : 'New ticket', ticket.title);
  return finish(data, ticket);
}
export async function attachTicketPhotos(ticketId, paths) {
  const { data, actor, ticket } = context(ticketId);
  check(actor.role === 'resident' && ticket.resident_id === actor.id && ticket.status !== 'closed', 'Only the reporting resident can add photos to an open ticket.');
  photoPaths(data, ticketId, actor, paths);
  check(paths.length > 0 && ticket.photo_paths.length + paths.length <= 3, 'A ticket can have at most 3 photos.');
  ticket.photo_paths.push(...paths);
  event(data, ticket, actor, 'note', 'Resident added photos.', { photo_paths: paths });
  return finish(data, ticket);
}
export async function assignTicket(ticketId, technicianId, targetDate) {
  const { data, actor, ticket } = context(ticketId);
  check(actor.role === 'admin', 'Only administrators can assign tickets.');
  check(['reported', 'reopened', 'assigned'].includes(ticket.status), 'Reopen this ticket before assigning it.');
  const tech = data.profiles.find(person => person.id === technicianId && person.role === 'technician' && person.is_active);
  check(tech, 'Choose an active technician.');
  check(!targetDate || /^\d{4}-\d{2}-\d{2}$/.test(targetDate) && targetDate >= todayISO(), 'Choose a target date today or later.');
  const old = ticket.status;
  Object.assign(ticket, { assigned_to: technicianId, assigned_by: actor.id, target_date: targetDate || null, status: 'assigned', hold_reason: null });
  event(data, ticket, actor, old === 'assigned' ? 'reassigned' : 'assigned', `Assigned to ${tech.full_name}${targetDate ? ` · target ${targetDate}` : ''}.`, { from_status: old, to_status: 'assigned' });
  notify(data, technicianId, ticket, 'New job assigned', ticket.title);
  notify(data, ticket.resident_id, ticket, 'Your ticket is assigned', `${tech.full_name} will work on your repair.`);
  return finish(data, ticket);
}
export async function technicianUpdateStatus(ticketId, newStatus, { note = null, partsUsed = null, photoPaths: paths = [] } = {}) {
  const { data, actor, ticket } = context(ticketId);
  check(actor.role === 'technician' && ticket.assigned_to === actor.id, 'Only the assigned technician can update this job.');
  const transitions = { assigned: ['in_progress'], reopened: ['in_progress'], in_progress: ['on_hold', 'resolved'], on_hold: ['in_progress'] };
  check(transitions[ticket.status]?.includes(newStatus), `Invalid transition from ${ticket.status} to ${newStatus}.`);
  note = text(note, newStatus === 'resolved' ? 10 : newStatus === 'on_hold' ? 3 : 0, newStatus === 'on_hold' ? 500 : 2000, 'Work note');
  partsUsed = text(partsUsed, 0, 500, 'Parts used');
  photoPaths(data, ticketId, actor, paths);
  const old = ticket.status;
  ticket.status = newStatus;
  ticket.hold_reason = newStatus === 'on_hold' ? note : null;
  if (newStatus === 'resolved') ticket.resolved_at = now();
  event(data, ticket, actor, newStatus === 'resolved' ? 'work_log' : 'status_change', note || null, { from_status: old, to_status: newStatus, parts_used: partsUsed || null, photo_paths: paths });
  if (newStatus === 'resolved') notify(data, ticket.resident_id, ticket, 'Work completed', 'The work has been finished. Please confirm and close, or report incomplete work.');
  if (newStatus === 'on_hold') notifyAdmins(data, ticket, 'Job on hold', note);
  return finish(data, ticket);
}
export async function addWorkLog(ticketId, { note, partsUsed = null, photoPaths: paths = [] }) {
  const { data, actor, ticket } = context(ticketId);
  check(actor.role === 'admin' || actor.role === 'technician' && ticket.assigned_to === actor.id, 'Only the assigned technician or admin can add work logs.');
  photoPaths(data, ticketId, actor, paths);
  const entry = event(data, ticket, actor, 'work_log', text(note, 3, 2000, 'Work log'), { parts_used: text(partsUsed, 0, 500, 'Parts used') || null, photo_paths: paths });
  saveData(data); return entry;
}
export async function addTicketNote(ticketId, message) {
  const { data, actor, ticket } = context(ticketId);
  const entry = event(data, ticket, actor, 'note', text(message, 1, 1000, 'Note'));
  for (const id of new Set([ticket.resident_id, ticket.assigned_to, ...data.profiles.filter(person => person.role === 'admin').map(person => person.id)])) {
    if (id !== actor.id) notify(data, id, ticket, 'New ticket note', entry.message);
  }
  saveData(data); return entry;
}
export async function residentConfirmClose(ticketId, rating = null, feedback = null) {
  const { data, actor, ticket } = context(ticketId);
  check(actor.role === 'resident' && ticket.resident_id === actor.id && ticket.status === 'resolved', 'Only the resident can confirm a resolved ticket.');
  check(rating === null || Number.isInteger(Number(rating)) && Number(rating) >= 1 && Number(rating) <= 5, 'Choose a rating from 1 to 5.');
  Object.assign(ticket, { status: 'closed', closed_at: now(), rating: rating === null ? null : Number(rating), feedback: text(feedback, 0, 1000, 'Feedback') || null });
  event(data, ticket, actor, 'status_change', 'Resident confirmed the repair and closed the ticket.', { from_status: 'resolved', to_status: 'closed' });
  if (rating !== null) event(data, ticket, actor, 'rating', `Rated ${rating}/5${feedback ? ` · ${feedback}` : ''}`);
  notifyAdmins(data, ticket, 'Ticket closed', ticket.title);
  notify(data, ticket.assigned_to, ticket, 'Repair confirmed', ticket.title);
  return finish(data, ticket);
}
function reopen(ticketId, reason, admin) {
  const { data, actor, ticket } = context(ticketId);
  check(admin ? actor.role === 'admin' && ['resolved', 'closed'].includes(ticket.status) : actor.role === 'resident' && ticket.resident_id === actor.id && ticket.status === 'resolved', 'This account cannot reopen this ticket in its current status.');
  reason = text(reason, 5, 500, 'Reason');
  const old = ticket.status;
  Object.assign(ticket, { status: 'reopened', reopen_count: ticket.reopen_count + 1, resolved_at: null, closed_at: null, rating: null, feedback: null, hold_reason: null });
  event(data, ticket, actor, 'reopened', `${admin ? 'Admin reopened the ticket' : 'Resident reported incomplete work'}: ${reason}`, { from_status: old, to_status: 'reopened' });
  notify(data, ticket.assigned_to, ticket, 'Ticket reopened', reason);
  if (admin) notify(data, ticket.resident_id, ticket, 'Ticket reopened', reason);
  else notifyAdmins(data, ticket, 'Ticket reopened', reason);
  return finish(data, ticket);
}
export async function residentReject(ticketId, reason) { return reopen(ticketId, reason, false); }
export async function adminReopen(ticketId, reason) { return reopen(ticketId, reason, true); }
export async function getTechnicians() {
  const { data, actor } = context(); check(actor.role === 'admin', 'Only administrators can view technician workloads.');
  return data.profiles.filter(person => person.role === 'technician' && person.is_active).map(person => ({ ...person, open_tickets: data.tickets.filter(ticket => ticket.assigned_to === person.id && OPEN.includes(ticket.status)).length }));
}
export async function getProfiles() { const { data, actor } = context(); check(actor.role === 'admin', 'Only administrators can manage people.'); return data.profiles; }
export async function updateMyProfile(userId, fields) {
  const { data, actor } = context(); check(actor.id === userId, 'You can only edit your own profile.');
  Object.assign(actor, { full_name: text(fields.full_name, 2, 80, 'Name'), phone: text(fields.phone, 0, 20, 'Phone') || null, block: text(fields.block, 0, 20, 'Block') || null, room_number: text(fields.room_number, 0, 10, 'Room') || null });
  saveData(data); return actor;
}
export async function adminUpdateUser(userId, fields) {
  const { data, actor } = context(); check(actor.role === 'admin', 'Only administrators can manage people.');
  const profile = data.profiles.find(person => person.id === userId); check(profile, 'User not found.');
  const role = fields.role ?? profile.role, active = fields.is_active ?? profile.is_active, specialty = fields.specialty ?? profile.specialty;
  check(['resident', 'technician', 'admin'].includes(role), 'Choose a valid role.');
  check(actor.id !== userId || role === 'admin' && active, 'You cannot demote or deactivate yourself.');
  check(role !== 'technician' || [...CATEGORIES, 'general'].includes(specialty), 'Choose a technician specialty.');
  Object.assign(profile, { role, is_active: Boolean(active), specialty: role === 'technician' ? specialty : null });
  saveData(data); return profile;
}
export async function getNotifications({ limit = 60, unreadOnly = false } = {}) { const { data, actor } = context(); return data.notifications.filter(item => item.user_id === actor.id && (!unreadOnly || !item.is_read)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit); }
export async function getUnreadCount(userId) { const { data, actor } = context(); check(actor.id === userId, 'Access denied.'); return data.notifications.filter(item => item.user_id === actor.id && !item.is_read).length; }
async function markNotifications(predicate) { const { data, actor } = context(); data.notifications.filter(item => item.user_id === actor.id && predicate(item)).forEach(item => { item.is_read = true; }); saveData(data); }
export async function markNotificationRead(id) { return markNotifications(item => item.id === id); }
export async function markAllNotificationsRead(userId) { check(currentUser().id === userId, 'Access denied.'); return markNotifications(() => true); }
export async function markTicketNotificationsRead(ticketId, userId) { check(currentUser().id === userId, 'Access denied.'); return markNotifications(item => item.ticket_id === ticketId); }
export function subscribeToTicket(ticketId, onChange) { return watchData(onChange); }
export function subscribeToTickets(onChange) { return watchData(onChange); }

// Photos live in IndexedDB so they do not exhaust the smaller localStorage quota.
function photoDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('hostelcare-photos', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('photos');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Browser photo storage is unavailable.'));
  });
}
async function photoOperation(mode, run) {
  const database = await photoDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('photos', mode), result = run(transaction.objectStore('photos'));
      transaction.oncomplete = () => resolve(result?.result);
      transaction.onerror = transaction.onabort = () => reject(new Error('The photo could not be saved. Check browser storage space.'));
    });
  } finally { database.close(); }
}
export async function uploadTicketPhotos(ticketId, blobs) {
  const { actor } = context(ticketId);
  check(blobs.length <= 3 && blobs.every(blob => blob.type === 'image/jpeg' && blob.size <= 5 * 1024 * 1024), 'Choose up to 3 JPEG photos, each smaller than 5 MB.');
  const paths = blobs.map(() => `${ticketId}/${uid()}.jpg`);
  await photoOperation('readwrite', storage => { blobs.forEach((blob, index) => storage.put(blob, paths[index])); });
  try {
    const { data } = context(ticketId);
    paths.forEach(path => data.photos.push({ path, ticket_id: ticketId, owner_id: actor.id }));
    saveData(data);
  } catch (error) {
    await photoOperation('readwrite', storage => paths.forEach(path => storage.delete(path)));
    throw error;
  }
  return paths;
}
export async function removeTicketPhotos(paths) {
  const { data, actor } = context();
  const removable = paths.filter(path => data.photos.some(photo => photo.path === path && photo.owner_id === actor.id) && !data.tickets.some(ticket => ticket.photo_paths.includes(path)) && !data.ticket_events.some(entry => entry.photo_paths.includes(path)));
  await photoOperation('readwrite', storage => removable.forEach(path => storage.delete(path)));
  data.photos = data.photos.filter(photo => !removable.includes(photo.path)); saveData(data);
}
const photoUrls = new Map();
export async function getSignedPhotoUrls(paths) {
  const { data, actor } = context(); const result = {};
  for (const path of new Set(paths || [])) {
    const photo = data.photos.find(item => item.path === path), ticket = photo && data.tickets.find(item => item.id === photo.ticket_id);
    if (!ticket || !canAccess(ticket, actor)) continue;
    if (!photoUrls.has(path)) {
      const blob = await photoOperation('readonly', storage => storage.get(path));
      if (blob) photoUrls.set(path, URL.createObjectURL(blob));
    }
    if (photoUrls.has(path)) result[path] = photoUrls.get(path);
  }
  return result;
}
export async function getAdminReports(from = null, to = null) {
  const { data, actor } = context(); check(actor.role === 'admin', 'Only administrators can view reports.');
  check(!from || !to || from <= to, 'Start date must be before the end date.');
  const rows = visibleTickets({ from, to }), average = values => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100) / 100 : null;
  const hours = ticket => (new Date(ticket.resolved_at) - new Date(ticket.created_at)) / 3600000;
  const groups = field => Object.entries(rows.reduce((counts, ticket) => { counts[ticket[field]] = (counts[ticket[field]] || 0) + 1; return counts; }, {})).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  const assignmentHours = rows.flatMap(ticket => { const entry = data.ticket_events.filter(entry => entry.ticket_id === ticket.id && ['assigned', 'reassigned'].includes(entry.event_type)).sort((a, b) => a.created_at.localeCompare(b.created_at))[0]; return entry ? [(new Date(entry.created_at) - new Date(ticket.created_at)) / 3600000] : []; });
  const overdue = rows.filter(ticket => ticket.target_date && ticket.target_date < todayISO() && OPEN.includes(ticket.status)).sort((a, b) => a.target_date.localeCompare(b.target_date));
  const weeks = {};
  for (const ticket of rows) { const day = new Date(ticket.created_at); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - (day.getDay() + 6) % 7); const week = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`; weeks[week] = (weeks[week] || 0) + 1; }
  const weekKeys = Object.keys(weeks).sort();
  if (weekKeys.length) { const cursor = new Date(`${weekKeys[0]}T12:00:00`), end = new Date(`${weekKeys.at(-1)}T12:00:00`); while (cursor <= end) { const key = `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-${String(cursor.getDate()).padStart(2,'0')}`; weeks[key] ??= 0; cursor.setDate(cursor.getDate()+7); } }
  return { range: { from, to }, totals: { total: rows.length, open: rows.filter(ticket => OPEN.includes(ticket.status)).length, unassigned: rows.filter(ticket => !ticket.assigned_to && ['reported', 'reopened'].includes(ticket.status)).length, overdue: overdue.length, avg_resolution_hours: average(rows.filter(ticket => ticket.resolved_at).map(hours)), avg_assign_hours: average(assignmentHours) }, by_status: groups('status'), by_category: groups('category'), by_severity: groups('severity'), by_block: groups('block'), per_week: Object.entries(weeks).sort(([a], [b]) => a.localeCompare(b)).map(([week, count]) => ({ week, count })), technicians: data.profiles.filter(person => person.role === 'technician').map(person => { const jobs = rows.filter(ticket => ticket.assigned_to === person.id); return { ...person, assigned_count: jobs.length, resolved_count: jobs.filter(ticket => ticket.resolved_at).length, avg_resolution_hours: average(jobs.filter(ticket => ticket.resolved_at).map(hours)), avg_rating: average(jobs.filter(ticket => ticket.rating !== null).map(ticket => ticket.rating)), reopen_rate: jobs.length ? Math.round(jobs.filter(ticket => ticket.reopen_count > 0).length / jobs.length * 1000) / 10 : 0 }; }), overdue: overdue.slice(0, 50).map(ticket => ({ ...ticket, days_overdue: Math.floor((new Date(`${todayISO()}T12:00:00`) - new Date(`${ticket.target_date}T12:00:00`)) / 86400000), technician_name: ticket.technician?.full_name || 'Unassigned' })) };
}
