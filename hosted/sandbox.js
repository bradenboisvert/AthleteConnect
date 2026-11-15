import { ensure, clean, profileInput, slotInput, priceFor, meetingLink, calendarICS, overlaps } from '../src/domain.js';

export const PERSONAS = Object.freeze({
  'player@example.test': 'demo-player',
  'coach@example.test': 'demo-coach',
  'admin@example.test': 'demo-admin',
  'applicant@example.test': 'demo-applicant'
});
export function seedSandbox(now = Date.now()) {
  const users = [
    { id: 'demo-player', email: 'player@example.test', role: 'player' },
    { id: 'demo-coach', email: 'coach@example.test', role: 'coach' },
    { id: 'demo-admin', email: 'admin@example.test', role: 'admin' },
    { id: 'demo-applicant', email: 'applicant@example.test', role: 'coach' }
  ];
  const profiles = {
    'demo-player': { uid: 'demo-player', fullName: 'Taylor Brooks', age: 12, sport: 'Baseball', location: 'South Jordan, UT', skillLevel: 'Beginner', goalsObjectives: 'Build a consistent pitching routine.', sessionTypes: ['virtual'], guardianConsent: true, parent: { name: 'Demo Parent', email: 'guardian@example.test', phone: '555-555-1212' }, status: 'active', updatedAt: now },
    'demo-coach': { uid: 'demo-coach', fullName: 'Jordan Hayes', sport: 'Baseball', location: 'South Jordan, UT', bio: 'A fictional demonstration coach for testing pitching sessions, repeatable mechanics, and a consistent approach to practice.', credentials: 'Fictional test profile: collegiate pitching and youth coaching experience.', hourlyRate: 65, sessionTypes: ['virtual', 'in-person'], acceptingBookings: true, status: 'approved', updatedAt: now },
    'demo-applicant': { uid: 'demo-applicant', fullName: 'Casey Lee', sport: 'Basketball', location: 'Salt Lake City, UT', bio: 'A fictional demonstration application used to test the approval process and personalized basketball skills training.', credentials: 'Fictional test profile: school basketball coaching.', hourlyRate: 45, sessionTypes: ['virtual'], acceptingBookings: true, status: 'pending', updatedAt: now }
  };
  const slots = Array.from({ length: 6 }, (_, i) => {
    const startTime = now + (i + 1) * 86400000;
    return { id: `demo-slot-${i}`, coachId: 'demo-coach', startTime, endTime: startTime + 3600000, type: i % 2 ? 'in-person' : 'virtual', location: i % 2 ? 'Fictional sports facility — confirm the test venue in messages' : '' };
  });
  return { users, profiles, slots, sessions: [], messages: [], photos: {} };
}
export function actorFor(data, id) {
  const row = data.users.find(user => user.id === id);
  return row ? { ...row, profile: data.profiles[id] || null } : null;
}
function sessionFor(data, user, id, adminRead = false) {
  const session = data.sessions.find(s => s.id === id);
  ensure(session && (session.playerId === user.id || session.coachId === user.id || (adminRead && user.role === 'admin')), 'Session not found.', 404);
  return session;
}
function enrich(data, session) { return { ...session, coachName: data.profiles[session.coachId]?.fullName || 'Coach', playerName: data.profiles[session.playerId]?.fullName || 'Player' }; }
const approved = (data, id) => data.users.some(u => u.id === id && u.role === 'coach') && data.profiles[id]?.status === 'approved';
export function canReadPhoto(data, user, id) { return id === user.id || user.role === 'admin' || approved(data, id); }
export function readSandbox(data, userId, path, search = new URLSearchParams(), now = Date.now()) {
  const user = actorFor(data, userId);
  if (path === '/me') return { user, hostedPrivateTest: true };
  ensure(user, 'Choose a private test role to continue.', 401);
  if (path === '/coaches') return { coaches: data.users.filter(u => approved(data, u.id)).map(u => data.profiles[u.id]) };
  if (path === '/slots') {
    const id = search.get('coachId') || user.id;
    ensure(id === user.id || user.role === 'admin' || approved(data, id), 'Coach not found.', 404);
    return { slots: data.slots.filter(s => s.coachId === id && s.startTime > now && !data.sessions.some(t => t.slotId === s.id && ['accepted', 'completed'].includes(t.status))).sort((a, b) => a.startTime - b.startTime) };
  }
  if (path === '/sessions') return { sessions: data.sessions.filter(s => user.role === 'admin' || s.playerId === user.id || s.coachId === user.id).sort((a, b) => b.startTime - a.startTime).map(s => enrich(data, s)) };
  if (path === '/admin/people') {
    ensure(user.role === 'admin', 'Admin access required.', 403);
    return { people: data.users.filter(u => u.role !== 'admin').map(u => ({ ...u, profile: data.profiles[u.id] || null })) };
  }
  const match = path.match(/^\/sessions\/([\w-]+)\/(messages|calendar)$/);
  if (match) {
    const s = sessionFor(data, user, match[1], match[2] === 'calendar');
    if (match[2] === 'messages') return { messages: data.messages.filter(m => m.sessionId === s.id).slice(-200) };
    ensure(['accepted', 'completed'].includes(s.status), 'Only confirmed sessions can be added to your calendar.');
    return { calendar: calendarICS(s) };
  }
  ensure(false, 'API route not found.', 404);
}
export function changeSandbox(data, userId, path, method, input = {}, { now = Date.now(), uuid = () => crypto.randomUUID() } = {}) {
  const user = actorFor(data, userId); ensure(user, 'Choose a private test role to continue.', 401);
  if (path === '/profile' && method === 'PUT') {
    ensure(user.role !== 'admin', 'Admin accounts do not have a coaching profile.', 403);
    const existing = user.profile; const p = profileInput(input, user.role);
    const reviewedFields = ['fullName', 'sport', 'location', 'bio', 'credentials', 'hourlyRate', 'sessionTypes'];
    const changed = existing && reviewedFields.some(k => JSON.stringify(existing[k]) !== JSON.stringify(p[k]));
    const status = user.role === 'player' ? 'active' : (!existing || changed || existing.status === 'rejected' ? 'pending' : existing.status);
    data.profiles[user.id] = { ...p, uid: user.id, status, updatedAt: now, ...(status !== 'pending' && existing ? { reviewedAt: existing.reviewedAt, reviewedBy: existing.reviewedBy, rejectionReason: existing.rejectionReason } : {}) };
    return { profile: data.profiles[user.id] };
  }
  if (path === '/slots' && method === 'POST') {
    ensure(user.role === 'coach' && user.profile?.status === 'approved', 'Only approved coaches can publish availability.', 403);
    const slot = slotInput(input, now);
    ensure(user.profile.sessionTypes.includes(slot.type), 'This session type is not on your profile.');
    ensure(!data.slots.some(s => s.coachId === user.id && overlaps(s.startTime, s.endTime, slot.startTime, slot.endTime)), 'That time overlaps an existing slot.', 409);
    data.slots.push({ ...slot, id: uuid(), coachId: user.id }); return { ok: true };
  }
  const remove = path.match(/^\/slots\/([\w-]+)$/);
  if (remove && method === 'DELETE') {
    ensure(data.slots.some(s => s.id === remove[1] && s.coachId === user.id), 'Slot not found.', 404);
    ensure(!data.sessions.some(s => s.slotId === remove[1]), 'This slot has session history. Decline or cancel its request instead.', 409);
    data.slots = data.slots.filter(s => s.id !== remove[1]); return { ok: true };
  }
  if (path === '/sessions' && method === 'POST') {
    ensure(user.role === 'player' && user.profile, 'Complete a player profile first.', 403);
    const slot = data.slots.find(s => s.id === input.slotId); ensure(slot && slot.startTime > now + 60000, 'This time is no longer available.', 409);
    const coach = data.profiles[slot.coachId]; ensure(approved(data, slot.coachId) && coach.acceptingBookings && coach.sessionTypes.includes(slot.type), 'This coach is not accepting this session type.', 409);
    ensure(!data.sessions.some(s => s.slotId === slot.id && (['accepted', 'completed'].includes(s.status) || (s.playerId === user.id && s.status === 'requested'))), 'This time is booked or you have already requested it.', 409);
    const id = uuid(); data.sessions.push({ ...slot, slotId: slot.id, id, playerId: user.id, price: priceFor(coach.hourlyRate, slot.startTime, slot.endTime), playerIsMinor: user.profile.age < 18, status: 'requested', meetLink: '', createdAt: now, updatedAt: now }); return { id };
  }
  const action = path.match(/^\/sessions\/([\w-]+)\/(accept|decline|cancel|complete|meeting|messages)$/);
  if (action && method === 'POST') {
    const [, id, kind] = action; const s = sessionFor(data, user, id);
    if (kind === 'messages') {
      const text = clean(input.text, 2000); ensure(text, 'Write a message first.');
      ensure(data.messages.filter(m => m.senderId === user.id && m.createdAt > now - 60000).length < 30, 'Please wait before sending another message.', 429);
      data.messages.push({ id: uuid(), sessionId: id, senderId: user.id, text, createdAt: now }); return { ok: true };
    }
    if (kind === 'meeting') {
      ensure(s.coachId === user.id && s.type === 'virtual' && s.status === 'accepted', 'Only the coach can set the link for a confirmed virtual session.', 403);
      s.meetLink = meetingLink(clean(input.meetLink, 200)); s.updatedAt = now; return { ok: true };
    }
    if (kind === 'cancel') ensure(['requested', 'accepted'].includes(s.status) && s.startTime > now, 'This session can no longer be cancelled.');
    else {
      ensure(s.coachId === user.id && user.role === 'coach', 'Only the session coach can do this.', 403);
      if (kind === 'complete') ensure(s.status === 'accepted' && s.endTime <= now, 'A session can be completed after it ends.');
      else ensure(s.status === 'requested' && s.startTime > now, 'This request is no longer pending.');
      if (kind === 'accept') {
        ensure(approved(data, user.id), 'Coach approval is required.', 403);
        ensure(!data.sessions.some(t => t.id !== s.id && ['accepted', 'completed'].includes(t.status) && (t.coachId === s.coachId || t.playerId === s.playerId) && overlaps(t.startTime, t.endTime, s.startTime, s.endTime)), 'This session overlaps a confirmed booking.', 409);
      }
    }
    s.status = { accept: 'accepted', decline: 'declined', cancel: 'cancelled', complete: 'completed' }[kind]; s.updatedAt = now;
    if (kind === 'accept') for (const other of data.sessions) if (other.id !== s.id && other.status === 'requested' && (other.coachId === s.coachId || other.playerId === s.playerId) && overlaps(other.startTime, other.endTime, s.startTime, s.endTime)) { other.status = 'declined'; other.updatedAt = now; }
    return { ok: true };
  }
  const review = path.match(/^\/admin\/coaches\/([\w-]+)$/);
  if (review && method === 'POST') {
    ensure(user.role === 'admin', 'Admin access required.', 403);
    const coach = data.profiles[review[1]];
    ensure(coach && data.users.some(u => u.id === review[1] && u.role === 'coach'), 'Coach not found.', 404);
    ensure(['approved', 'rejected'].includes(input.status), 'Choose approve or reject.');
    Object.assign(coach, { status: input.status, reviewedBy: user.id, reviewedAt: now, updatedAt: now, rejectionReason: input.status === 'rejected' ? clean(input.rejectionReason || '', 1000) : null }); return { ok: true };
  }
  ensure(false, 'API route not found.', 404);
}
