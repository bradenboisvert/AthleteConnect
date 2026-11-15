import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createPhoneWorker } from '../hosted/worker.js';
import { SandboxStore } from '../hosted/store.js';
import { changeSandbox } from '../hosted/sandbox.js';

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../hosted/migrations/0000_phone_sandboxes.sql', import.meta.url), 'utf8'));
  t.after(() => sqlite.close());
  const db = { prepare(sql) { return { bind(...params) { return { async first() { await Promise.resolve(); return sqlite.prepare(sql).get(...params) || null; }, async run() { await Promise.resolve(); return sqlite.prepare(sql).run(...params); } }; } }; } };
  return { db, store: new SandboxStore(db), worker: createPhoneWorker({ '/': { body: '<h1>Private phone test</h1>', mime: 'text/html' } }) };
}
const origin = 'https://athleteconnect.example.test';
async function call(worker, db, path, { owner = 'owner-a', persona = '', method = 'GET', data, requestOrigin = origin } = {}) {
  const headers = { Origin: requestOrigin, 'Content-Type': 'application/json' };
  if (owner) headers['oai-authenticated-user-id'] = owner;
  if (persona) headers.Cookie = `ac_test_persona=${persona}`;
  return worker.fetch(new Request(origin + path, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(data || {}) }), { DB: db });
}
test('private hosted access requires platform identity and selects test roles without creating credentials', async t => {
  const { db, worker } = fixture(t);
  assert.equal((await call(worker, db, '/api/me', { owner: '' })).status, 401);
  const anonymous = await call(worker, db, '/', { owner: '' }); assert.equal(anonymous.status, 302); assert.match(anonymous.headers.get('location'), /signin-with-chatgpt/);
  const signedIn = await call(worker, db, '/'); assert.equal(signedIn.status, 200);
  const login = await call(worker, db, '/api/auth/login', { method: 'POST', data: { email: 'player@example.test' } });
  assert.equal(login.status, 200); assert.match(login.headers.get('set-cookie'), /Secure; SameSite=Strict/);
  const me = await call(worker, db, '/api/me', { persona: 'demo-player' }); assert.equal((await me.json()).user.profile.age, 12);
  const unknown = await call(worker, db, '/api/auth/login', { method: 'POST', data: { email: 'intruder@example.test' } }); assert.equal(unknown.status, 400);
  const csrf = await call(worker, db, '/api/auth/logout', { method: 'POST', requestOrigin: 'https://evil.test' }); assert.equal(csrf.status, 403);
  const absentDb = await worker.fetch(new Request(origin + '/api/me', { headers: { 'oai-authenticated-user-id': 'owner-a' } }), {}); assert.equal(absentDb.status, 503);
});
test('hosted booking, messaging, calendar, and approvals persist and stay owner-scoped', async t => {
  const { db, worker, store } = fixture(t);
  const request = await call(worker, db, '/api/sessions', { method: 'POST', persona: 'demo-player', data: { slotId: 'demo-slot-0', price: 0, playerIsMinor: false } });
  assert.equal(request.status, 201); const { id } = await request.json();
  const accepted = await call(worker, db, `/api/sessions/${id}/accept`, { method: 'POST', persona: 'demo-coach' }); assert.equal(accepted.status, 200);
  const secondDevice = await call(createPhoneWorker(), db, '/api/sessions', { persona: 'demo-player' });
  const session = (await secondDevice.json()).sessions[0]; assert.equal(session.status, 'accepted'); assert.equal(session.price, 65); assert.equal(session.playerIsMinor, true);
  const otherOwner = await call(worker, db, '/api/sessions', { owner: 'owner-b', persona: 'demo-player' }); assert.deepEqual((await otherOwner.json()).sessions, []);
  assert.equal((await call(worker, db, `/api/sessions/${id}/messages`, { owner: 'owner-b', persona: 'demo-coach' })).status, 404);
  assert.equal((await call(worker, db, `/api/sessions/${id}/messages`, { persona: 'demo-admin' })).status, 404);
  const sent = await call(worker, db, `/api/sessions/${id}/messages`, { method: 'POST', persona: 'demo-player', data: { text: 'Hello from my phone.' } }); assert.equal(sent.status, 201);
  const inbox = await call(worker, db, `/api/sessions/${id}/messages`, { persona: 'demo-coach' }); assert.equal((await inbox.json()).messages[0].text, 'Hello from my phone.');
  const calendar = await call(worker, db, `/api/sessions/${id}/calendar`, { persona: 'demo-player' }); assert.match(await calendar.text(), /BEGIN:VCALENDAR/); assert.equal(calendar.headers.get('cache-control'), 'no-store');
  assert.equal((await call(worker, db, '/api/admin/people', { persona: 'demo-player' })).status, 403);
  const rejected = await call(worker, db, '/api/admin/coaches/demo-applicant', { method: 'POST', persona: 'demo-admin', data: { status: 'rejected', rejectionReason: 'Add credentials.' } }); assert.equal(rejected.status, 200);
  const snapshot = (await store.read('owner-a')).data;
  const applicant = snapshot.profiles['demo-applicant'];
  assert.equal(applicant.rejectionReason, 'Add credentials.');
  const resubmitted = await call(worker, db, '/api/profile', { method: 'PUT', persona: 'demo-applicant', data: { ...applicant, credentials: 'Updated fictional college coaching credentials.' } });
  assert.equal((await resubmitted.json()).profile.status, 'pending');
  assert.equal((await call(worker, db, '/api/admin/coaches/demo-applicant', { method: 'POST', persona: 'demo-admin', data: { status: 'approved' } })).status, 200);
  const roster = await call(worker, db, '/api/coaches', { persona: 'demo-player' }); assert.equal((await roster.json()).coaches.length, 2);
});
test('shared storage retries concurrent changes and permits only one conflicting confirmation', async t => {
  const { store } = fixture(t);
  await store.read('owner-a');
  await Promise.all(Array.from({ length: 4 }, (_, i) => store.change('owner-a', data => { data.messages.push({ id: `parallel-${i}`, text: `change ${i}` }); return { ok: true }; })));
  assert.equal((await store.read('owner-a')).data.messages.length, 4);
  await store.change('owner-a', data => {
    data.users.push({ id: 'second-player', role: 'player', email: 'second@example.test' });
    data.profiles['second-player'] = { ...data.profiles['demo-player'], uid: 'second-player', age: 22 };
    return {};
  });
  const a = await store.change('owner-a', data => changeSandbox(data, 'demo-player', '/sessions', 'POST', { slotId: 'demo-slot-0' }));
  const b = await store.change('owner-a', data => changeSandbox(data, 'second-player', '/sessions', 'POST', { slotId: 'demo-slot-0' }));
  const results = await Promise.allSettled([a.id, b.id].map(id => store.change('owner-a', data => changeSandbox(data, 'demo-coach', `/sessions/${id}/accept`, 'POST'))));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rows = (await store.read('owner-a')).data.sessions;
  assert.equal(rows.filter(s => s.status === 'accepted').length, 1); assert.equal(rows.filter(s => s.status === 'declined').length, 1);
});
