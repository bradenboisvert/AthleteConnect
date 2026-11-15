import { SandboxStore } from './store.js';
import { PERSONAS, actorFor, canReadPhoto, changeSandbox, readSandbox } from './sandbox.js';
import { ensure } from '../src/domain.js';

const HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};
const json = (status, data, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });
const personaCookie = (id, age) => `ac_test_persona=${id}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
async function body(request, max = 64000) {
  ensure(request.headers.get('Content-Type')?.startsWith('application/json'), 'JSON is required.', 415);
  const reader = request.body?.getReader(); if (!reader) return {};
  const decoder = new TextDecoder(); let bytes = 0, result = '';
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    bytes += value.byteLength;
    if (bytes > max) { await reader.cancel(); ensure(false, 'Request is too large.', 413); }
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  try { const parsed = JSON.parse(result); ensure(parsed && typeof parsed === 'object' && !Array.isArray(parsed), 'Invalid JSON.'); return parsed; }
  catch { ensure(false, 'Invalid JSON.'); }
}
function photoBytes(input) {
  ensure(['image/png', 'image/jpeg', 'image/webp'].includes(input.mime) && typeof input.base64 === 'string', 'Use a PNG, JPEG, or WebP photo.');
  let bytes; try { bytes = Uint8Array.from(atob(input.base64), c => c.charCodeAt(0)); } catch { ensure(false, 'Invalid image encoding.'); }
  ensure(bytes.length > 12 && bytes.length <= 5 * 1024 * 1024, 'Photos must be under 5 MB.');
  const ascii = (a, b) => String.fromCharCode(...bytes.slice(a, b));
  const valid = input.mime === 'image/png' ? [137,80,78,71,13,10,26,10].every((byte, i) => bytes[i] === byte) : input.mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  ensure(valid, 'The photo does not match its image type.'); return bytes;
}
export function createPhoneWorker(assets = {}) {
  return {
    async fetch(request, env) {
      try {
        const url = new URL(request.url);
        // These trusted headers are injected by Sites dispatch, after owner-private access
        // checks. Do not deploy this Worker directly to a public origin that accepts them.
        const owner = request.headers.get('oai-authenticated-user-id');
        if (!owner) {
          if (url.pathname.startsWith('/api/')) return json(401, { error: 'Sign in with ChatGPT to open your private test.' });
          return Response.redirect(new URL('/signin-with-chatgpt?return_to=%2F', url.origin), 302);
        }
        if (!url.pathname.startsWith('/api/')) {
          ensure(['GET', 'HEAD'].includes(request.method), 'Method not allowed.', 405);
          const asset = assets[url.pathname]; ensure(asset, 'File not found.', 404);
          const bytes = asset.base64 ? Uint8Array.from(atob(asset.body), c => c.charCodeAt(0)) : asset.body;
          return new Response(request.method === 'HEAD' ? null : bytes, { headers: { ...HEADERS, 'Content-Type': asset.mime, 'Cache-Control': 'no-cache' } });
        }
        ensure(env.DB?.prepare, 'Shared storage is not connected yet.', 503);
        const store = new SandboxStore(env.DB);
        const path = url.pathname.slice(4), method = request.method;
        ensure(['GET', 'POST', 'PUT', 'DELETE'].includes(method), 'Method not allowed.', 405);
        if (method !== 'GET') ensure(request.headers.get('Origin') === url.origin, 'Request origin was rejected.', 403);
        const persona = request.headers.get('Cookie')?.split(';').map(c => c.trim()).find(c => c.startsWith('ac_test_persona='))?.slice('ac_test_persona='.length) || '';
        if (path === '/auth/login' && method === 'POST') {
          const input = await body(request); const id = PERSONAS[input.email];
          ensure(id, 'Choose one of the fictional test roles.');
          await store.read(owner);
          // This cookie selects a fictional role inside the authenticated owner's sandbox.
          // It grants no access to another owner's records and is not an auth credential.
          return json(200, { ok: true, hostedPrivateTest: true }, { 'Set-Cookie': personaCookie(id, 30 * 86400) });
        }
        if (path === '/auth/logout' && method === 'POST') { await body(request); return json(200, { ok: true }, { 'Set-Cookie': personaCookie('', 0) }); }
        if (path.startsWith('/auth/')) return json(405, { error: 'This private phone test uses fictional roles. Account registration is available in the local app.' });
        const snapshot = (await store.read(owner)).data;
        if (path === '/me' && method === 'GET') return json(200, readSandbox(snapshot, persona, path));
        const user = actorFor(snapshot, persona); ensure(user, 'Choose a private test role to continue.', 401);
        const photo = path.match(/^\/photos\/([\w-]+)$/);
        if (photo && method === 'GET') {
          ensure(canReadPhoto(snapshot, user, photo[1]), 'Photo not found.', 404);
          ensure(env.BUCKET, 'Photo storage is not connected yet.', 503);
          const saved = await env.BUCKET.get(`${encodeURIComponent(owner)}/${photo[1]}`); ensure(saved, 'Photo not found.', 404);
          return new Response(saved.body, { headers: { ...HEADERS, 'Content-Type': saved.httpMetadata?.contentType || 'image/png', 'Cache-Control': 'private, no-store' } });
        }
        if (path === '/photo' && method === 'PUT') {
          ensure(user.role !== 'admin' && user.profile, 'Complete your profile first.', 403);
          ensure(env.BUCKET, 'Photo storage is not connected yet.', 503);
          const input = await body(request, 7100000); const bytes = photoBytes(input);
          await env.BUCKET.put(`${encodeURIComponent(owner)}/${user.id}`, bytes, { httpMetadata: { contentType: input.mime } });
          await store.change(owner, data => { data.photos[user.id] = { updatedAt: Date.now() }; return { ok: true }; });
          return json(200, { ok: true });
        }
        if (method === 'GET') {
          const result = readSandbox(snapshot, persona, path, url.searchParams);
          if (result.calendar) return new Response(result.calendar, { headers: { ...HEADERS, 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="athleteconnect-session.ics"', 'Cache-Control': 'no-store' } });
          return json(200, result);
        }
        const input = await body(request);
        const result = await store.change(owner, data => changeSandbox(data, persona, path, method, input));
        const status = method === 'POST' && ['/slots', '/sessions'].includes(path) || (method === 'POST' && path.endsWith('/messages')) ? 201 : 200;
        return json(status, result);
      } catch (error) {
        const status = error.status || 500;
        if (status === 500) console.error('Private test request failed:', error.message);
        return json(status, { error: status === 500 ? 'The private test could not complete that request. Please try again.' : error.message });
      }
    }
  };
}
