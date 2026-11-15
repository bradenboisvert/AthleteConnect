import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { openDatabase } from './database.js';
import { clean, email, ensure, profileInput, slotInput, priceFor, meetingLink, calendarICS } from '../src/domain.js';
const scrypt = promisify(scryptCallback);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return salt + ':' + hash.toString('hex');
}
async function passwordMatches(password, stored) {
  const [salt, expected] = stored.split(':');
  const actual = await scrypt(password, salt, 64);
  return timingSafeEqual(Buffer.from(expected, 'hex'), actual);
}
const digest = text => createHash('sha256').update(text).digest('hex');
export function createApp({ databasePath = process.env.DATABASE_PATH || resolve(ROOT, 'data/athleteconnect.sqlite'), secureCookies = process.env.SECURE_COOKIES === '1' } = {}) {
  const db = openDatabase(databasePath);
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const transaction = fn => { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } };
  const rates = new Map();
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  const profile = id => { const row = get('SELECT * FROM profiles WHERE userId=?', id); return row ? { ...JSON.parse(row.data), uid: id, status: row.status, rejectionReason: row.rejectionReason, reviewedAt: row.reviewedAt, updatedAt: row.updatedAt } : null; };
  const publicCoach = id => { const p = profile(id); if (!p) return null; return { uid: id, fullName: p.fullName, sport: p.sport, location: p.location, bio: p.bio, credentials: p.credentials, hourlyRate: p.hourlyRate, sessionTypes: p.sessionTypes, acceptingBookings: p.acceptingBookings, status: p.status, updatedAt: p.updatedAt }; };
  const cookie = (token, age) => `ac_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secureCookies ? '; Secure' : ''}`;
  async function body(req, limit = 64000) {
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; ensure(size <= limit, 'Request is too large.', 413); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { ensure(false, 'Invalid JSON.'); }
  }
  function requireSession(user, id, adminRead = false) {
    const s = get('SELECT * FROM sessions WHERE id=?', id);
    ensure(s && (s.playerId === user.id || s.coachId === user.id || (adminRead && user.role === 'admin')), 'Session not found.', 404);
    return s;
  }
  function enrich(s) { return { ...s, playerIsMinor: Boolean(s.playerIsMinor), coachName: profile(s.coachId)?.fullName || 'Coach', playerName: profile(s.playerId)?.fullName || 'Player' }; }
  function limit(req, bucket, max) {
    const key = `${req.socket.remoteAddress}:${bucket}`;
    const now = Date.now();
    if (rates.size > 5000) for (const [k, v] of rates) if (v.expires <= now) rates.delete(k);
    let item = rates.get(key);
    if (!item || item.expires < now) { item = { count: 0, expires: now + 15 * 60000 }; rates.set(key, item); }
    ensure(++item.count <= max, 'Too many attempts. Try again in 15 minutes.', 429);
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      const method = req.method;
      if (path.startsWith('/api/')) {
        ensure(['GET', 'POST', 'PUT', 'DELETE'].includes(method), 'Method not allowed.', 405);
        if (method !== 'GET') {
          ensure(req.headers['content-type']?.startsWith('application/json'), 'JSON is required.', 415);
          // Browsers must prove same-origin. No permissive CORS and no reliance on a stored role.
          const origin = req.headers.origin;
          ensure(origin && new URL(origin).host === req.headers.host && ['http:', 'https:'].includes(new URL(origin).protocol), 'Request origin was rejected.', 403);
          limit(req, 'writes', 250);
        }
        if (path === '/api/auth/register' && method === 'POST') {
          limit(req, 'auth', 30);
          const data = await body(req);
          const address = email(data.email);
          ensure(typeof data.password === 'string' && data.password.length >= 12 && data.password.length <= 128, 'Use a password between 12 and 128 characters.');
          ensure(['player', 'coach'].includes(data.role), 'Choose player or coach.');
          ensure(!get('SELECT id FROM users WHERE email=?', address), 'An account with that email already exists.', 409);
          const id = randomUUID(); const hash = await hashPassword(data.password);
          try { run('INSERT INTO users VALUES (?,?,?,?,?)', id, address, hash, data.role, Date.now()); } catch { ensure(false, 'An account with that email already exists.', 409); }
          const token = randomBytes(32).toString('base64url');
          run('INSERT INTO auth_sessions VALUES (?,?,?)', digest(token), id, Date.now() + 7 * 86400000);
          res.setHeader('Set-Cookie', cookie(token, 7 * 86400));
          return json(res, 201, { ok: true });
        }
        if (path === '/api/auth/login' && method === 'POST') {
          limit(req, 'auth', 30);
          const data = await body(req); const address = email(data.email);
          ensure(typeof data.password === 'string' && data.password.length <= 128, 'Invalid email or password.', 401);
          const row = get('SELECT * FROM users WHERE email=?', address);
          // Always perform the expensive hash, including unknown addresses.
          const fallback = '00000000000000000000000000000000:' + '00'.repeat(64);
          const matches = await passwordMatches(data.password, row?.password || fallback);
          ensure(row && matches, 'Invalid email or password.', 401);
          const token = randomBytes(32).toString('base64url');
          run('DELETE FROM auth_sessions WHERE expiresAt<?', Date.now());
          run('INSERT INTO auth_sessions VALUES (?,?,?)', digest(token), row.id, Date.now() + 7 * 86400000);
          res.setHeader('Set-Cookie', cookie(token, 7 * 86400));
          return json(res, 200, { ok: true });
        }
        const token = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith('ac_session='))?.slice(11) || '';
        const user = get('SELECT u.* FROM users u JOIN auth_sessions s ON s.userId=u.id WHERE s.token=? AND s.expiresAt>?', digest(token), Date.now());
        if (path === '/api/me' && method === 'GET') return json(res, 200, { user: user ? { id: user.id, email: user.email, role: user.role, profile: profile(user.id) } : null });
        ensure(user, 'Sign in to continue.', 401);
        if (path === '/api/auth/logout' && method === 'POST') { run('DELETE FROM auth_sessions WHERE token=?', digest(token)); res.setHeader('Set-Cookie', cookie('', 0)); return json(res, 200, { ok: true }); }
        if (path === '/api/profile' && method === 'PUT') {
          ensure(user.role !== 'admin', 'Admin accounts do not have a player or coach profile.', 403);
          const p = profileInput(await body(req), user.role);
          const existing = profile(user.id);
          // Editing credentials or rates requires a new review; availability alone does not.
          const reviewedFields = ['fullName', 'sport', 'location', 'bio', 'credentials', 'hourlyRate', 'sessionTypes'];
          const changed = user.role === 'coach' && existing && reviewedFields.some(k => JSON.stringify(existing[k]) !== JSON.stringify(p[k]));
          const status = user.role === 'player' ? 'active' : (!existing || changed || existing.status === 'rejected' ? 'pending' : existing.status);
          run('INSERT INTO profiles (userId,data,status,updatedAt) VALUES (?,?,?,?) ON CONFLICT(userId) DO UPDATE SET data=excluded.data,status=excluded.status,updatedAt=excluded.updatedAt', user.id, JSON.stringify(p), status, Date.now());
          if (status === 'pending') run('UPDATE profiles SET reviewedBy=NULL,reviewedAt=NULL,rejectionReason=NULL WHERE userId=?', user.id);
          return json(res, 200, { profile: profile(user.id) });
        }
        if (path === '/api/photo' && method === 'PUT') {
          ensure(user.role !== 'admin' && profile(user.id), 'Complete your profile first.', 403);
          const data = await body(req, 7100000);
          ensure(['image/png', 'image/jpeg', 'image/webp'].includes(data.mime) && typeof data.base64 === 'string', 'Use a PNG, JPEG, or WebP image.');
          const bytes = Buffer.from(data.base64, 'base64');
          ensure(bytes.length > 12 && bytes.length <= 5 * 1024 * 1024, 'Photos must be under 5 MB.');
          const valid = data.mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : data.mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
          ensure(valid, 'The photo does not match its image type.');
          run('INSERT INTO photos VALUES (?,?,?) ON CONFLICT(userId) DO UPDATE SET mime=excluded.mime,bytes=excluded.bytes', user.id, data.mime, bytes);
          return json(res, 200, { ok: true });
        }
        const photoMatch = path.match(/^\/api\/photos\/([\w-]+)$/);
        if (photoMatch && method === 'GET') {
          const id = photoMatch[1]; const p = profile(id);
          ensure(id === user.id || user.role === 'admin' || (get('SELECT role FROM users WHERE id=?', id)?.role === 'coach' && p?.status === 'approved'), 'Photo not found.', 404);
          const photo = get('SELECT * FROM photos WHERE userId=?', id); ensure(photo, 'Photo not found.', 404);
          res.writeHead(200, { 'Content-Type': photo.mime, 'Cache-Control': 'private, no-store' }); return res.end(photo.bytes);
        }
        if (path === '/api/coaches' && method === 'GET') {
          return json(res, 200, { coaches: all("SELECT p.userId FROM profiles p JOIN users u ON u.id=p.userId WHERE u.role='coach' AND p.status='approved'").map(c => publicCoach(c.userId)) });
        }
        if (path === '/api/slots' && method === 'GET') {
          const id = url.searchParams.get('coachId') || user.id;
          ensure(id === user.id || user.role === 'admin' || profile(id)?.status === 'approved', 'Coach not found.', 404);
          return json(res, 200, { slots: all("SELECT * FROM slots WHERE coachId=? AND startTime>? AND NOT EXISTS(SELECT 1 FROM sessions WHERE sessions.slotId=slots.id AND status IN ('accepted','completed')) ORDER BY startTime LIMIT 200", id, Date.now()) });
        }
        if (path === '/api/slots' && method === 'POST') {
          ensure(user.role === 'coach' && profile(user.id)?.status === 'approved', 'Only approved coaches can publish availability.', 403);
          const slot = slotInput(await body(req));
          transaction(() => {
            ensure(!get('SELECT id FROM slots WHERE coachId=? AND startTime<? AND endTime>?', user.id, slot.endTime, slot.startTime), 'That time overlaps an existing slot.', 409);
            run('INSERT INTO slots VALUES (?,?,?,?,?,?)', randomUUID(), user.id, slot.startTime, slot.endTime, slot.type, slot.location);
          });
          return json(res, 201, { ok: true });
        }
        const slotDelete = path.match(/^\/api\/slots\/([\w-]+)$/);
        if (slotDelete && method === 'DELETE') {
          transaction(() => {
            ensure(get('SELECT id FROM slots WHERE id=? AND coachId=?', slotDelete[1], user.id), 'Slot not found.', 404);
            ensure(!get('SELECT id FROM sessions WHERE slotId=?', slotDelete[1]), 'This slot has session history. Decline or cancel its request instead.', 409);
            run('DELETE FROM slots WHERE id=? AND coachId=?', slotDelete[1], user.id);
          }); return json(res, 200, { ok: true });
        }
        if (path === '/api/sessions' && method === 'GET') {
          const rows = user.role === 'admin' ? all('SELECT * FROM sessions ORDER BY startTime DESC LIMIT 300') : all('SELECT * FROM sessions WHERE coachId=? OR playerId=? ORDER BY startTime DESC LIMIT 300', user.id, user.id);
          return json(res, 200, { sessions: rows.map(enrich) });
        }
        if (path === '/api/sessions' && method === 'POST') {
          const data = await body(req); const player = profile(user.id);
          ensure(user.role === 'player' && player, 'Complete a player profile first.', 403);
          let id;
          transaction(() => {
            const slot = get('SELECT * FROM slots WHERE id=?', String(data.slotId)); ensure(slot && slot.startTime > Date.now() + 60000, 'This time is no longer available.', 409);
            const coach = profile(slot.coachId);
            ensure(coach?.status === 'approved' && coach.acceptingBookings && coach.sessionTypes.includes(slot.type), 'This coach is not accepting this session type.', 409);
            ensure(!get("SELECT id FROM sessions WHERE slotId=? AND (status IN ('accepted','completed') OR (playerId=? AND status='requested'))", slot.id, user.id), 'This time is booked or you have already requested it.', 409);
            id = randomUUID(); const now = Date.now();
            run('INSERT INTO sessions (id,coachId,playerId,slotId,startTime,endTime,type,location,price,playerIsMinor,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', id, slot.coachId, user.id, slot.id, slot.startTime, slot.endTime, slot.type, slot.location, priceFor(coach.hourlyRate, slot.startTime, slot.endTime), player.age < 18 ? 1 : 0, now, now);
          }); return json(res, 201, { id });
        }
        const sessionAction = path.match(/^\/api\/sessions\/([\w-]+)\/(accept|decline|cancel|complete|meeting|calendar|messages)$/);
        if (sessionAction) {
          const [, id, action] = sessionAction;
          const session = requireSession(user, id, action === 'calendar');
          if (action === 'calendar' && method === 'GET') {
            ensure(session.status === 'accepted' || session.status === 'completed', 'Only confirmed sessions can be added to your calendar.');
            res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="athleteconnect-session.ics"', 'Cache-Control': 'no-store' }); return res.end(calendarICS(session));
          }
          if (action === 'messages' && method === 'GET') return json(res, 200, { messages: all('SELECT * FROM (SELECT * FROM messages WHERE sessionId=? ORDER BY createdAt DESC,rowid DESC LIMIT 200) ORDER BY createdAt', id) });
          if (action === 'messages' && method === 'POST') {
            limit(req, 'messages', 100);
            const data = await body(req); const text = clean(data.text, 2000); ensure(text.length > 0, 'Write a message first.');
            run('INSERT INTO messages VALUES (?,?,?,?,?)', randomUUID(), id, user.id, text, Date.now()); return json(res, 201, { ok: true });
          }
          ensure(method === 'POST', 'Method not allowed.', 405);
          const data = await body(req);
          transaction(() => {
            const current = requireSession(user, id);
            if (action === 'meeting') {
              ensure(current.coachId === user.id && current.type === 'virtual' && current.status === 'accepted', 'Only the coach can set the link for an accepted virtual session.', 403);
              run('UPDATE sessions SET meetLink=?,updatedAt=? WHERE id=?', meetingLink(clean(data.meetLink, 200)), Date.now(), id); return;
            }
            if (action === 'cancel') {
              ensure(['requested', 'accepted'].includes(current.status) && current.startTime > Date.now(), 'This session can no longer be cancelled.');
            } else {
              ensure(current.coachId === user.id && user.role === 'coach', 'Only the session coach can do this.', 403);
              if (action === 'complete') ensure(current.status === 'accepted' && current.endTime <= Date.now(), 'A session can be completed after it ends.');
              else ensure(current.status === 'requested' && current.startTime > Date.now(), 'This request is no longer pending.');
              if (action === 'accept') {
                ensure(profile(user.id)?.status === 'approved', 'Coach approval is required.', 403);
                ensure(!get("SELECT id FROM sessions WHERE id!=? AND status IN ('accepted','completed') AND (coachId=? OR playerId=?) AND startTime<? AND endTime>?", id, user.id, current.playerId, current.endTime, current.startTime), 'This session overlaps a confirmed booking.', 409);
              }
            }
            const status = { accept: 'accepted', decline: 'declined', cancel: 'cancelled', complete: 'completed' }[action];
            ensure(status, 'Unknown session action.');
            run('UPDATE sessions SET status=?,updatedAt=? WHERE id=?', status, Date.now(), id);
            if (action === 'accept') run("UPDATE sessions SET status='declined',updatedAt=? WHERE id!=? AND status='requested' AND (coachId=? OR playerId=?) AND startTime<? AND endTime>?", Date.now(), id, current.coachId, current.playerId, current.endTime, current.startTime);
          }); return json(res, 200, { ok: true });
        }
        if (path === '/api/admin/people' && method === 'GET') {
          ensure(user.role === 'admin', 'Admin access required.', 403);
          return json(res, 200, { people: all("SELECT id,email,role,createdAt FROM users WHERE role!='admin' ORDER BY createdAt DESC LIMIT 500").map(u => ({ ...u, profile: profile(u.id) })) });
        }
        const review = path.match(/^\/api\/admin\/coaches\/([\w-]+)$/);
        if (review && method === 'POST') {
          ensure(user.role === 'admin', 'Admin access required.', 403);
          const data = await body(req); ensure(['approved', 'rejected'].includes(data.status), 'Choose approve or reject.');
          ensure(get("SELECT id FROM users WHERE id=? AND role='coach'", review[1]) && profile(review[1]), 'Coach application not found.', 404);
          const reason = clean(data.rejectionReason || '', 1000);
          run('UPDATE profiles SET status=?,reviewedBy=?,reviewedAt=?,rejectionReason=?,updatedAt=? WHERE userId=?', data.status, user.id, Date.now(), data.status === 'rejected' ? reason : null, Date.now(), review[1]);
          return json(res, 200, { ok: true });
        }
        return json(res, 404, { error: 'API route not found.' });
      }
      ensure(method === 'GET' || method === 'HEAD', 'Method not allowed.', 405);
      const relative = path === '/' ? 'index.html' : decodeURIComponent(path).slice(1);
      const base = path.startsWith('/src/') ? ROOT : resolve(ROOT, 'public');
      const file = resolve(base, relative);
      ensure(file.startsWith(base + sep) && (base !== ROOT || file.startsWith(resolve(ROOT, 'src') + sep)), 'File not found.', 404);
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
      ensure(types[extname(file)], 'File not found.', 404);
      const content = await readFile(file).catch(() => { throw Object.assign(new Error('File not found.'), { status: 404 }); });
      res.writeHead(200, { 'Content-Type': types[extname(file)], 'Cache-Control': 'no-cache' }); res.end(method === 'HEAD' ? undefined : content);
    } catch (error) {
      const status = error.status || 500;
      if (status === 500) console.error('Request failed:', error.message);
      if (!res.headersSent) json(res, status, { error: status === 500 ? 'Something went wrong. Please try again.' : error.message });
      else res.end();
    }
  });
  server.on('close', () => db.close());
  return { server, db };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || '127.0.0.1'; const port = Number(process.env.PORT || 4173);
  const { server } = createApp();
  server.listen(port, host, () => console.log(`AthleteConnect is running at http://${host}:${port}`));
}
