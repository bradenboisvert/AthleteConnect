import { SPORTS, TYPES } from '/src/domain.js';
const $ = (selector, root = document) => root.querySelector(selector);
const app = $('#app'); const dialog = $('#modal');
const state = { user: null, coaches: [], sessions: [], people: [], route: '', conversation: null, filter: {}, authMode: 'login' };
let renderVersion = 0, toastTimer, polling = false, threadVersion = 0;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: Number(value) % 1 ? 2 : 0 }).format(value);
const date = (ms, options = {}) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', ...options }).format(new Date(ms));
const time = ms => date(ms, { month: undefined, day: undefined, hour: 'numeric', minute: '2-digit' });
const initials = name => String(name || 'A').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const selected = (a, b) => a === b ? ' selected' : '';
const checked = value => value ? ' checked' : '';
const badge = status => `<span class="badge ${['pending', 'requested'].includes(status) ? 'badge-warning' : ['approved', 'accepted', 'active', 'completed'].includes(status) ? 'badge-success' : ['rejected', 'declined'].includes(status) ? 'badge-danger' : 'badge-neutral'}">${escape(status === 'accepted' ? 'Confirmed' : status?.charAt(0).toUpperCase() + status?.slice(1))}</span>`;
const btn = (text, action, data = '', style = 'primary small') => `<button type="button" class="btn ${style}" data-action="${action}"${data ? ` data-id="${escape(data)}"` : ''}>${text}</button>`;
const empty = (title, text, action = '') => `<div class="empty-state"><span class="empty-symbol" aria-hidden="true">↗</span><h3>${escape(title)}</h3><p>${escape(text)}</p>${action}</div>`;
function notify(text) { $('#toast').textContent = text; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4500); }
async function api(path, method = 'GET', data) {
  let response;
  try { response = await fetch('/api' + path, { method, credentials: 'same-origin', headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(data || {}) }); }
  catch { throw new Error('Cannot reach AthleteConnect. Check your connection and try again.'); }
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) { state.user = null; state.sessions = []; closeModal(); location.hash = 'login'; }
    throw new Error(result.error || 'Please try again.');
  }
  return result;
}
function modal(title, content) { $('#modal-content').innerHTML = `<header class="modal-header"><h2>${escape(title)}</h2><button type="button" class="icon-btn" data-action="close-modal" aria-label="Close dialog">×</button></header><div class="modal-body">${content}</div>`; if (!dialog.open) dialog.showModal(); }
function closeModal() { dialog.close(); }
dialog.addEventListener('click', event => { if (event.target === dialog) closeModal(); });
const brand = '<a class="brand" href="#home"><span class="brandmark" aria-hidden="true">a↗</span>Athlete<span>Connect<em>.</em></span></a>';
function landing() {
  app.innerHTML = `<header class="landing-header">${brand}<nav class="links" aria-label="Main"><a href="#how-it-works">How it works</a><a href="#register" class="btn secondary" data-role="coach">Become a coach</a><a href="#login" class="btn primary">Sign in ↗</a></nav></header><main id="main" class="landing"><section class="landing-hero"><div><span class="eyebrow">A better way to train</span><h1>Your next level.<br><span>Starts with<br>the right coach.</span></h1><p>Personal coaching. Real connection. Find athletes and coaches who can help you build your game, one session at a time.</p><div class="actions"><a href="#register" class="btn primary" data-role="player">Find your coach <span aria-hidden="true">↗</span></a><a href="#register" class="btn" data-role="coach">Share your experience</a></div><div class="hero-note"><span class="dot"></span>Virtual or in-person. Built around your goals.</div></div><div class="court" aria-label="Illustration of a sports court"><span class="tag">PUT IN THE WORK. FIND YOUR EDGE.</span><span class="number">01 /</span><svg viewBox="0 0 500 400" fill="none" aria-hidden="true"><rect x="60" y="20" width="380" height="580" rx="3" stroke="#caf281" stroke-width="2"/><path d="M60 310h380M160 20v135h180V20M193 20v65h114V20" stroke="#caf281" stroke-width="2"/><circle cx="250" cy="310" r="72" stroke="#caf281" stroke-width="2"/><path d="M100 20v85a150 150 0 0 0 300 0V20" stroke="#caf281" stroke-width="2"/></svg><div class="quote">Big goals.<br>Better together.</div><span class="mini-tag" aria-hidden="true">↗</span></div></section><section class="how" id="how-it-works"><article><span class="index">01 —</span><h3>Find your fit.</h3><p>Explore reviewed coach profiles by sport, session type, and budget.</p></article><article><span class="index">02 —</span><h3>Make a game plan.</h3><p>Choose an open time and request a session. Your coach confirms the details.</p></article><article><span class="index">03 —</span><h3>Show up. Level up.</h3><p>Keep the conversation in one place and make every training session count.</p></article></section><footer class="landing-footer"><span>ATHLETECONNECT · BUILT FOR THE WORK AHEAD</span><span>Development build · No payments collected · <button class="text-link" data-action="install">iPhone setup</button></span></footer></main>`;
}
function authPage(mode) {
  state.authMode = mode;
  const register = mode === 'register';
  app.innerHTML = `<header class="landing-header">${brand}<span class="preview-tag">Development build</span></header><main id="main" class="auth-wrap"><a href="#home" class="auth-back">← Back to AthleteConnect</a><section class="panel"><span class="eyebrow">${register ? 'Your next chapter' : 'Back to the work'}</span><h1>${register ? 'Let’s build<br>your game.' : 'Welcome back.'}</h1><p class="muted">${register ? 'Create your account to get started.' : 'Sign in to your training space.'}</p><div class="tabs"><button class="${register ? '' : 'active'}" data-action="auth-login">Sign in</button><button class="${register ? 'active' : ''}" data-action="auth-register">Create account</button></div><form id="auth-form"><div class="form-grid">${register ? `<div class="full"><label for="role">I am joining as</label><select id="role" name="role"><option value="player"${selected(state.newRole || 'player', 'player')}>A player / parent or guardian</option><option value="coach"${selected(state.newRole, 'coach')}>A coach</option></select></div>` : ''}<div class="full"><label for="email">Email address</label><input id="email" type="email" name="email" autocomplete="email" required maxlength="254"></div><div class="full"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="${register ? '12' : '1'}" maxlength="128" required>${register ? '<small class="field-help">Use at least 12 characters. Parents or guardians must create and manage accounts for players under 18.</small>' : ''}</div></div><div class="alert alert-error hidden" data-error role="alert"></div><button class="btn primary full" type="submit">${register ? 'Create account ↗' : 'Sign in ↗'}</button></form><p class="legal-note">This local build uses email and password. Google sign-in, automatic Meet creation, and payment processing are not connected yet. Use test information while trying it out.</p></section></main>`;
}
const menus = {
  player: [['discover', '◈', 'Discover'], ['sessions', '▤', 'Sessions'], ['messages', '☷', 'Messages'], ['profile', '◯', 'Profile']],
  coach: [['today', '◈', 'Overview'], ['schedule', '▦', 'Schedule'], ['sessions', '▤', 'Sessions'], ['messages', '☷', 'Messages'], ['profile', '◯', 'Profile']],
  admin: [['overview', '◈', 'Overview'], ['coaches', '▤', 'Coaches'], ['players', '◯', 'Players'], ['sessions', '▦', 'Sessions']]
};
function shell(route) {
  const user = state.user, name = user.profile?.fullName || user.email;
  const nav = menus[user.role].map(([r, glyph, title]) => `<a href="#${r}" class="${route === r ? 'active' : ''}" ${route === r ? 'aria-current="page"' : ''}><span class="glyph" aria-hidden="true">${glyph}</span><span>${title}</span></a>`).join('');
  app.innerHTML = `<div class="app-layout"><aside class="sidebar">${brand}<div class="sidebar-label">Your training space</div><nav class="nav" aria-label="Account">${nav}</nav><div class="sidebar-bottom"><div class="sidebar-note"><strong>Built around your goals.</strong>Keep showing up. The small sessions add up.<br><button class="text-link" data-action="install">Add to your iPhone ↗</button></div><div class="account-mini"><span class="avatar">${escape(initials(name))}</span><div class="details"><strong>${escape(name)}</strong><small>${escape(user.role)} account</small></div><button class="icon-btn" data-action="logout" aria-label="Sign out">↪</button></div></div></aside><div class="workspace"><header class="topbar"><span class="breadcrumb">My space <span aria-hidden="true"> / </span> ${escape(menus[user.role].find(m => m[0] === route)?.[2] || 'Profile')}</span><div class="mobile-brand">${brand}</div><div class="topbar-right"><span class="today">${escape(date(Date.now(), { weekday: 'short' }))}</span><span class="preview-tag">Local build</span><button class="avatar" data-action="account" aria-label="Account options">${escape(initials(name))}</button></div></header>${navigator.onLine ? '' : '<div class="offline-indicator">You are offline. Current bookings and messages need a connection.</div>'}<main id="main"><div class="loading" role="status">Loading your space…</div></main></div></div>`;
}
const heading = (eyebrow, title, text = '', action = '') => `<div class="page-head"><div><span class="eyebrow">${escape(eyebrow)}</span><h1>${escape(title)}</h1>${text ? `<p>${escape(text)}</p>` : ''}</div>${action}</div>`;
const stats = rows => `<div class="stats-summary">${rows.map(([title, value]) => `<div class="stat-card"><span>${escape(title)}</span><strong>${escape(value)}</strong></div>`).join('')}</div>`;
function photo(coach, index) { return `<div class="coach-art tone-${index % 3}"><span class="monogram">${escape(initials(coach.fullName))}</span><img src="/api/photos/${escape(coach.uid)}?v=${coach.updatedAt}" alt="${escape(coach.fullName)}" loading="lazy"><span class="sport-tag">${escape(coach.sport)}</span></div>`; }
function wirePhotoErrors() { document.querySelectorAll('.coach-art img, img.optional-photo').forEach(img => { img.addEventListener('error', () => img.remove(), { once: true }); if (img.complete && img.naturalWidth === 0) img.remove(); }); }
function coachCard(coach, i) { return `<article class="coach-card">${photo(coach, i)}<div class="coach-card-body"><h3>${escape(coach.fullName)}</h3><div class="credential">${escape(coach.credentials)}</div><div class="location">⌖ ${escape(coach.location || 'Location not added')}</div><div class="pills">${coach.sessionTypes.map(t => `<span class="pill">${t === 'virtual' ? 'Virtual' : 'In-person'}</span>`).join('')}</div><div class="coach-card-bottom"><div class="price"><strong>${money(coach.hourlyRate)}</strong><small> / hr</small></div>${btn('View coach ↗', 'view-coach', coach.uid)}</div></div></article>`; }
function filterCoaches() {
  const f = state.filter;
  const coaches = state.coaches.filter(c => (!f.query || `${c.fullName} ${c.bio} ${c.credentials}`.toLowerCase().includes(f.query.toLowerCase())) && (!f.sport || c.sport === f.sport) && (!f.type || c.sessionTypes.includes(f.type)) && (!f.price || c.hourlyRate <= Number(f.price)) && (!f.location || c.location.toLowerCase().includes(f.location.toLowerCase())));
  $('#coach-results').innerHTML = coaches.length ? `<div class="coach-grid">${coaches.map(coachCard).join('')}</div>` : empty(state.coaches.length ? 'No matches just yet.' : 'The roster is getting started.', state.coaches.length ? 'Try another sport, location, or budget.' : 'Approved coach profiles will appear here. A coach can apply from a separate account.');
  $('#coach-count').textContent = `${coaches.length} ${coaches.length === 1 ? 'coach' : 'coaches'}`;
  wirePhotoErrors();
}
function discover() {
  const name = state.user.profile.fullName.split(' ')[0]; const f = state.filter;
  $('#main').innerHTML = heading('Make your next move', `Let’s get better, ${name}.`, 'Find the right person to help you take the next step.') + `<section class="banner"><div><span class="eyebrow">Progress is personal</span><h2>Your game. Your goals.<br>A coach in your corner.</h2><p>Browse reviewed profiles and request a time that works for you.</p></div><span class="banner-graphic" aria-hidden="true">↗</span></section><div class="section-head"><h2>Find your coach</h2><small id="coach-count"></small></div><form id="filters" class="filters" role="search"><input name="query" aria-label="Search coaches" placeholder="Search name or experience" value="${escape(f.query || '')}"><select name="sport" aria-label="Filter sport"><option value="">All sports</option>${SPORTS.map(s => `<option${selected(f.sport, s)}>${escape(s)}</option>`).join('')}</select><select name="type" aria-label="Filter session type"><option value="">Any session</option><option value="virtual"${selected(f.type, 'virtual')}>Virtual</option><option value="in-person"${selected(f.type, 'in-person')}>In-person</option></select><input name="price" type="number" min="1" max="1000" placeholder="Max $ / hr" aria-label="Maximum hourly rate" value="${escape(f.price || '')}"><input name="location" placeholder="City or area" aria-label="Filter location" value="${escape(f.location || '')}"></form><div id="coach-results"></div><p class="legal-note">Review means an administrator approved the profile. It does not indicate a background check or credentials verification. Prices are session quotes; checkout is not enabled.</p>`;
  filterCoaches();
}
function sessionCard(s) {
  const mine = state.user.role; const future = s.startTime > Date.now();
  const partner = mine === 'coach' ? s.playerName : mine === 'admin' ? `${s.playerName} with ${s.coachName}` : s.coachName;
  let actions = '';
  if (mine === 'coach' && s.status === 'requested' && future) actions += btn('Accept request', 'accept', s.id) + btn('Decline', 'decline', s.id, 'small');
  if (mine !== 'admin' && ['requested', 'accepted'].includes(s.status) && future) actions += btn('Cancel', 'cancel', s.id, 'small danger');
  if (mine === 'coach' && s.status === 'accepted' && s.endTime <= Date.now()) actions += btn('Mark completed', 'complete', s.id);
  if (mine !== 'admin') actions += btn('Message', 'message', s.id, 'small secondary');
  if (s.status === 'accepted' || s.status === 'completed') actions += `<a class="btn small" href="/api/sessions/${escape(s.id)}/calendar">Add to calendar</a>`;
  if (s.meetLink && s.status === 'accepted') actions += `<a class="btn small primary" href="${escape(s.meetLink)}" target="_blank" rel="noopener noreferrer">Open Meet ↗</a>`;
  if (mine === 'coach' && s.type === 'virtual' && s.status === 'accepted') actions += btn(s.meetLink ? 'Edit Meet link' : 'Add Meet link', 'meeting', s.id, 'small');
  return `<article class="session-card"><div class="date-block"><span>${escape(date(s.startTime, { month: 'short', day: undefined }))}</span><strong>${new Date(s.startTime).getDate()}</strong></div><div><h3>${escape(partner)}</h3><p>${escape(time(s.startTime))} – ${escape(time(s.endTime))} · ${s.type === 'virtual' ? 'Virtual session' : 'In-person'}</p>${s.location ? `<p>⌖ ${escape(s.location)}</p>` : ''}${s.playerIsMinor ? '<span class="pill">Guardian-managed player</span>' : ''}<div class="actions">${actions}</div></div><div class="session-price">${badge(s.status)}<strong>${money(s.price)}</strong></div></article>`;
}
function sessionsPage() {
  const upcoming = state.sessions.filter(s => s.endTime >= Date.now() && ['requested', 'accepted'].includes(s.status)).sort((a, b) => a.startTime - b.startTime);
  const rest = state.sessions.filter(s => !upcoming.includes(s));
  $('#main').innerHTML = heading('Your training calendar', 'Sessions', `All times are shown in ${zone}.`) + stats([['Confirmed ahead', upcoming.filter(s => s.status === 'accepted').length], ['Awaiting a response', upcoming.filter(s => s.status === 'requested').length], ['Completed', state.sessions.filter(s => s.status === 'completed').length]]) + `<div class="section-head"><h2>Upcoming & requested</h2><small>${upcoming.length} sessions</small></div><div class="data-list">${upcoming.length ? upcoming.map(sessionCard).join('') : empty('Your next session starts here.', state.user.role === 'player' ? 'Find a coach and request an open time.' : 'Session requests will appear here when players book your availability.', state.user.role === 'player' ? '<a class="btn primary small" href="#discover">Explore coaches ↗</a>' : '')}</div><div class="section-head"><h2>Session history</h2></div><div class="data-list">${rest.length ? rest.map(sessionCard).join('') : empty('A fresh start.', 'Past, declined, and cancelled sessions will be kept here.')}</div><p class="legal-note">No payment has been collected through AthleteConnect. Cancellation fees and refunds are not automated.</p>`;
}
function coachOverview() {
  const p = state.user.profile;
  const requests = state.sessions.filter(s => s.status === 'requested' && s.startTime > Date.now()).sort((a, b) => a.startTime - b.startTime);
  const upcoming = state.sessions.filter(s => s.status === 'accepted' && s.endTime > Date.now()).sort((a, b) => a.startTime - b.startTime);
  const completed = state.sessions.filter(s => s.status === 'completed').reduce((total, s) => total + s.price, 0);
  $('#main').innerHTML = heading('Make an impact', `Your coaching space, ${p.fullName.split(' ')[0]}.`, 'The next session could make all the difference.') + (p.status !== 'approved' ? `<div class="alert ${p.status === 'rejected' ? 'alert-error' : ''}">${badge(p.status)} ${p.status === 'pending' ? 'Your application is waiting for admin review. You can update your profile while you wait.' : `Your application needs changes. ${escape(p.rejectionReason || 'Review your profile and submit it again.')}`} <a href="#profile">View application</a></div>` : '') + stats([['Session requests', requests.length], ['Confirmed ahead', upcoming.length], ['Completed session value', money(completed)]]) + `<section class="banner"><div><span class="eyebrow">Keep the door open</span><h2>Great coaching starts<br>with showing up.</h2><p>Publish a few open times so players can find a session that fits.</p></div><a href="#schedule" class="btn lime">Set availability ↗</a></section><div class="section-head"><h2>Waiting for your response</h2><a href="#sessions" class="text-link">All sessions ↗</a></div><div class="data-list">${requests.length ? requests.map(sessionCard).join('') : empty('You’re all caught up.', 'New session requests will appear here.')}</div><div class="section-head"><h2>Up next</h2></div><div class="data-list">${upcoming.length ? upcoming.slice(0, 4).map(sessionCard).join('') : empty('Room for something good.', 'Confirmed training sessions will show up here.')}</div><p class="legal-note">Completed session value is the total quoted price of sessions marked complete. It is not collected revenue or a payout balance.</p>`;
}
function profileForm() {
  const user = state.user, p = user.profile || {}, coach = user.role === 'coach';
  const field = (label, name, type = 'text', attrs = '', value = p[name] || '') => `<div><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${escape(value)}" ${attrs}></div>`;
  $('#main').innerHTML = heading(coach ? 'Share your experience' : 'Make it personal', user.profile ? 'Your profile' : coach ? 'Your coaching application' : 'Tell us about your game.', coach ? 'Players see your profile after an administrator reviews it.' : 'Start with your goals. We will help you find the right fit.') + `<div class="profile-columns"><section class="panel"><form id="profile-form"><div class="form-grid">${field('Full name', 'fullName', 'text', 'required minlength="2" maxlength="100" autocomplete="name"')}<div><label for="sport">Primary sport</label><select id="sport" name="sport" required><option value="">Choose your sport</option>${SPORTS.map(s => `<option${selected(s, p.sport)}>${escape(s)}</option>`).join('')}</select></div>${field('City / area', 'location', 'text', 'maxlength="120" placeholder="e.g. South Jordan, UT"')}${coach ? field('Hourly rate ($)', 'hourlyRate', 'number', 'required min="1" max="1000" step=".01"', p.hourlyRate || 50) : field('Player’s age', 'age', 'number', 'required min="8" max="100"', p.age || '')}${!coach ? `<div class="full"><label for="skillLevel">Experience level</label><select id="skillLevel" name="skillLevel">${['Beginner', 'Intermediate', 'Advanced'].map(s => `<option${selected(s, p.skillLevel)}>${s}</option>`).join('')}</select></div>` : ''}<fieldset class="full"><legend>Session types</legend><div class="checkbox-group">${TYPES.map(type => `<label class="check-label"><input type="checkbox" name="sessionTypes" value="${type}"${checked((p.sessionTypes || ['virtual']).includes(type))}>${type === 'virtual' ? 'Virtual' : 'In-person'}</label>`).join('')}</div></fieldset>${coach ? `<div class="full"><label for="bio">Coaching bio</label><textarea id="bio" name="bio" required minlength="30" maxlength="2000" placeholder="Your experience, coaching approach, and who you work with">${escape(p.bio || '')}</textarea><small class="field-help">At least 30 characters. Share specific experience without adding private contact information.</small></div><div class="full"><label for="credentials">Athletic & coaching credentials</label><textarea id="credentials" name="credentials" required minlength="5" maxlength="1000" placeholder="Teams, levels played, certifications, and coaching experience">${escape(p.credentials || '')}</textarea></div><div class="full"><label class="check-label"><input type="checkbox" name="acceptingBookings"${checked(p.acceptingBookings !== false)}>Accept new session requests when approved</label></div>` : `<div class="full"><label for="goalsObjectives">What would you like to work on?</label><textarea id="goalsObjectives" name="goalsObjectives" maxlength="1500" placeholder="Tell your coach about your goals">${escape(p.goalsObjectives || '')}</textarea></div><fieldset id="guardian-fields" class="full ${p.age && p.age < 18 ? '' : 'hidden'}"><legend>Parent or guardian</legend><p class="muted">A parent or guardian must manage this account and consent to training. Keep communication on-platform and arrange adult supervision.</p><div class="form-grid">${field('Guardian’s full name', 'parentName', 'text', 'maxlength="100"', p.parent?.name || '')}${field('Guardian’s email', 'parentEmail', 'email', 'maxlength="254"', p.parent?.email || '')}${field('Guardian’s phone', 'parentPhone', 'tel', 'maxlength="40"', p.parent?.phone || '')}<label class="check-label full"><input type="checkbox" name="guardianConsent"${checked(p.guardianConsent)}>I am the parent or legal guardian. I consent to and will manage this player’s training and communication.</label></div></fieldset>`}<div class="full"><label for="photo">Profile photo (optional)</label><input id="photo" type="file" name="photo" accept="image/png,image/jpeg,image/webp"><small class="field-help">PNG, JPEG, or WebP up to 5 MB. Only approved coach photos are visible to other users.</small></div></div><div class="alert alert-error hidden" data-error role="alert"></div><div class="form-footer"><button class="btn primary" type="submit">${coach ? (!p.status || p.status === 'rejected' ? 'Submit for review ↗' : 'Save profile ↗') : 'Save profile ↗'}</button></div></form></section><aside class="panel profile-side"><span class="eyebrow">Your profile</span><h2>${escape(p.fullName || 'A little about you.')}</h2>${p.status ? badge(p.status) : ''}${p.fullName ? `<img class="photo-preview optional-photo" src="/api/photos/${escape(user.id)}?v=${p.updatedAt}" alt="Your profile photo">` : ''}<p>${coach ? 'A clear bio and specific experience help players decide who is right for them. Changes to public profile details require another review.' : 'Your age, contact information, and goals are private to you and administrators. Coaches see your name and whether guardian involvement is required.'}</p><div class="alert">${coach ? 'Profile approval is an administrator’s review, not a completed background check.' : 'Players must be at least 8. A parent or guardian must manage accounts for players under 18.'}</div><button class="text-link" data-action="logout">Sign out</button></aside></div>`;
  wirePhotoErrors(); updateGuardian();
}
function updateGuardian() {
  const age = $('#age'); if (!age) return;
  const minor = Number(age.value) >= 8 && Number(age.value) < 18;
  $('#guardian-fields').classList.toggle('hidden', !minor);
  ['parentName', 'parentEmail', 'parentPhone', 'guardianConsent'].forEach(name => { const input = $(`[name="${name}"]`); input.required = minor; input.disabled = !minor; });
}
function schedulePage(slots) {
  const approved = state.user.profile?.status === 'approved';
  $('#main').innerHTML = heading('Make room for progress', 'Your availability', `Open times are shown in ${zone}.`) + `<div class="split-panels"><section class="panel"><h2>Publish an open time</h2><p class="muted">Publish specific dates so players book the exact time you intended, including across daylight saving changes.</p>${approved ? `<form id="slot-form"><div class="form-grid"><div class="full"><label for="startTime">Date & start time (${escape(zone)})</label><input id="startTime" name="startTime" type="datetime-local" required min="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}"></div><div><label for="duration">Duration</label><select id="duration" name="duration"><option value="30">30 minutes</option><option value="60" selected>60 minutes</option><option value="90">90 minutes</option><option value="120">120 minutes</option></select></div><div><label for="type">Session type</label><select id="type" name="type">${state.user.profile.sessionTypes.map(type => `<option value="${type}">${type === 'virtual' ? 'Virtual' : 'In-person'}</option>`).join('')}</select></div><div class="full"><label for="slotLocation">Public meeting location (in-person)</label><input id="slotLocation" name="location" maxlength="200" placeholder="Field or facility name and address"></div></div><div class="alert alert-error hidden" data-error role="alert"></div><div class="form-footer"><button class="btn primary" type="submit">Publish time ↗</button></div></form>` : '<div class="alert">You can publish availability once an administrator approves your application.</div>'}</section><section class="panel"><div class="section-head"><h2>Open times</h2><small>${slots.length} available</small></div><div class="schedule-calendar">${slots.length ? slots.map(s => `<div class="slot-row"><div><strong>${escape(date(s.startTime, { weekday: 'short' }))}</strong><small>${escape(time(s.startTime))} – ${escape(time(s.endTime))} · ${s.type}</small>${s.location ? `<small>${escape(s.location)}</small>` : ''}</div>${btn('Remove', 'remove-slot', s.id, 'small')}</div>`).join('') : empty('Your schedule is open.', 'Publish a time to let players request a session.')}</div></section></div>`;
}
function messagesPage() {
  const sessions = state.sessions;
  const partner = s => state.user.role === 'coach' ? s.playerName : s.coachName;
  if (!sessions.length) { $('#main').innerHTML = heading('Stay connected', 'Messages', 'One place for your session conversations.') + empty('Start with a session.', 'Request a session with a coach to start an on-platform conversation.'); return; }
  if (!sessions.some(s => s.id === state.conversation)) state.conversation = sessions[0].id;
  const s = sessions.find(s => s.id === state.conversation);
  $('#main').innerHTML = heading('Stay connected', 'Messages', 'Session conversations update every few seconds while this page is open.') + `<div class="messages-container"><div class="contacts-list" aria-label="Session conversations">${sessions.map(row => `<button class="contact ${row.id === s.id ? 'active' : ''}" data-action="conversation" data-id="${escape(row.id)}"><strong>${escape(partner(row))}</strong><small>${escape(date(row.startTime))} · ${escape(row.type)} · ${escape(row.status)}</small></button>`).join('')}</div><section class="message-area"><header class="thread-header"><strong>${escape(partner(s))}</strong><small>${escape(date(s.startTime))} · ${escape(time(s.startTime))}${s.playerIsMinor ? ' · Guardian-managed player' : ''}</small></header><div class="message-thread" id="thread" aria-live="polite" aria-label="Messages"><div class="loading">Loading conversation…</div></div><form class="compose" id="message-form"><label class="hidden" for="messageText">Message</label><textarea id="messageText" name="text" maxlength="2000" rows="1" required placeholder="Write a message…"></textarea><button class="btn primary small" type="submit">Send ↗</button></form><div class="conversation-note">Keep session communication here. ${s.playerIsMinor ? 'A parent or guardian should supervise this conversation and the session.' : 'Do not share financial or sensitive personal information.'}<div class="alert alert-error hidden" id="message-error" role="alert"></div></div></section></div>`;
  loadThread().catch(error => { if ($('#thread')) $('#thread').innerHTML = `<div class="error-state">${escape(error.message)}</div>`; });
}
let threadSignature = '';
async function loadThread() {
  const id = state.conversation; const version = ++threadVersion;
  const { messages } = await api(`/sessions/${id}/messages`);
  if (version !== threadVersion || state.route !== 'messages' || state.conversation !== id || !$('#thread')) return;
  const signature = id + messages.map(m => m.id).join(',');
  if (signature === threadSignature && !$('#thread .loading')) return;
  threadSignature = signature;
  const thread = $('#thread'); const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 90;
  thread.innerHTML = messages.length ? messages.map(m => `<div class="bubble ${m.senderId === state.user.id ? 'mine' : ''}">${escape(m.text)}<time datetime="${new Date(m.createdAt).toISOString()}">${escape(date(m.createdAt))}, ${escape(time(m.createdAt))}</time></div>`).join('') : empty('A good conversation starts here.', 'Introduce yourself and talk about your goals for this session.');
  if (nearBottom || !messages.length) thread.scrollTop = thread.scrollHeight;
}
function adminPage(route) {
  const coaches = state.people.filter(p => p.role === 'coach'); const players = state.people.filter(p => p.role === 'player'); const pending = coaches.filter(p => p.profile?.status === 'pending');
  const cards = list => list.length ? `<div class="data-list">${list.map(person => `<article class="panel review-card"><div><h3>${escape(person.profile?.fullName || person.email)}</h3><p>${escape(person.profile?.sport || 'Profile not completed')} · ${escape(person.profile?.location || 'No location')}</p><small>${escape(person.email)}</small></div>${badge(person.profile?.status || 'setup')}<div class="actions">${btn('View profile', 'view-person', person.id, 'small')}${person.role === 'coach' && person.profile ? btn('Approve', 'review-approve', person.id) + btn('Reject', 'review-reject', person.id, 'small danger') : ''}</div></article>`).join('')}</div>` : empty('Nothing here yet.', 'New accounts and applications will appear here.');
  if (route === 'overview') $('#main').innerHTML = heading('Behind the scenes', 'Admin overview', 'Review applications and keep track of the training community.') + stats([['Pending review', pending.length], ['Coach accounts', coaches.length], ['Player accounts', players.length]]) + `<div class="section-head"><h2>Waiting for review</h2></div>${cards(pending)}<div class="alert">Minor accounts are guardian-managed by declaration. Identity, guardian consent verification, background checks, payments, and safeguarding operations must be completed before a public youth launch.</div>`;
  else $('#main').innerHTML = heading('The AthleteConnect community', route === 'coaches' ? 'Coach applications' : 'Players', route === 'coaches' ? 'Review credentials and approve profiles for discovery.' : 'Private player details are accessible only to the player and administrators.') + cards(route === 'coaches' ? coaches : players);
}
async function render() {
  const version = ++renderVersion;
  let route = location.hash.slice(1) || 'home';
  closeModal();
  if (!state.user) {
    state.route = route;
    if (['login', 'register'].includes(route)) authPage(route); else landing();
    return;
  }
  const defaultRoute = { player: 'discover', coach: 'today', admin: 'overview' }[state.user.role];
  if (!state.user.profile && state.user.role !== 'admin') route = 'profile';
  else if (!menus[state.user.role].some(m => m[0] === route)) route = defaultRoute;
  state.route = route; shell(route);
  try {
    if (route === 'profile') { profileForm(); return; }
    if (route === 'discover') { const result = await api('/coaches'); if (version !== renderVersion) return; state.coaches = result.coaches; discover(); }
    else if (route === 'schedule') { const result = await api('/slots'); if (version !== renderVersion) return; schedulePage(result.slots); }
    else if (['sessions', 'today', 'messages'].includes(route)) { const result = await api('/sessions'); if (version !== renderVersion) return; state.sessions = result.sessions; if (route === 'sessions') sessionsPage(); else if (route === 'today') coachOverview(); else messagesPage(); }
    else { const result = await api('/admin/people'); if (version !== renderVersion) return; state.people = result.people; adminPage(route); }
  } catch (error) { if (version === renderVersion && $('#main')) $('#main').innerHTML = `<div class="error-state"><h3>We could not load this page.</h3><p>${escape(error.message)}</p>${btn('Try again', 'retry', '', 'primary small')}</div>`; }
}
async function refreshUser() { state.user = (await api('/me')).user; }
async function viewCoach(id) {
  const coach = state.coaches.find(c => c.uid === id); if (!coach) return;
  modal(coach.fullName, '<div class="loading">Loading open times…</div>');
  const { slots } = await api(`/slots?coachId=${encodeURIComponent(id)}`);
  if (!dialog.open) return;
  modal(coach.fullName, `<span class="pill">${escape(coach.sport)}</span> <span class="pill">Reviewed profile</span><h3>${money(coach.hourlyRate)} / hour</h3><p class="muted">${escape(coach.location)}</p><p class="bio">${escape(coach.bio)}</p><h3>Experience & credentials</h3><p class="bio">${escape(coach.credentials)}</p><h3>Request an open time</h3><small>Times in ${escape(zone)}. Your request is confirmed only when the coach accepts.</small>${!coach.acceptingBookings ? '<div class="alert">This coach has paused new requests.</div>' : slots.length ? slots.filter(s => coach.sessionTypes.includes(s.type)).map(s => `<div class="slot-row"><div><strong>${escape(date(s.startTime, { weekday: 'short' }))}</strong><small>${escape(time(s.startTime))} – ${escape(time(s.endTime))} · ${escape(s.type)}</small><small>${money(coach.hourlyRate * (s.endTime - s.startTime) / 3600000)} total${s.location ? ` · ${escape(s.location)}` : ''}</small></div>${btn('Request', 'request-slot', s.id)}</div>`).join('') : '<div class="alert">No open times have been published yet.</div>'}<p class="legal-note">No payment will be collected when you request. ${state.user.profile.age < 18 ? 'A parent or guardian must arrange and supervise this session and keep communication on-platform.' : 'Use session messages to agree on your training goals.'}</p>`);
}
document.addEventListener('error', event => { if (event.target.matches?.('.coach-art img, img.optional-photo')) event.target.remove(); }, true);
document.addEventListener('input', event => {
  if (event.target.id === 'age') updateGuardian();
  if (event.target.closest('#filters')) { state.filter = Object.fromEntries(new FormData($('#filters'))); filterCoaches(); }
});
document.addEventListener('change', event => { if (event.target.closest('#filters')) { state.filter = Object.fromEntries(new FormData($('#filters'))); filterCoaches(); } });
document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action], [data-role]'); if (!target) return;
  if (target.dataset.role) { state.newRole = target.dataset.role; return; }
  const action = target.dataset.action, id = target.dataset.id;
  if (action === 'close-modal') return closeModal();
  if (action === 'auth-login' || action === 'auth-register') { location.hash = action === 'auth-login' ? 'login' : 'register'; return; }
  target.disabled = true;
  try {
    if (action === 'install') modal('Use AthleteConnect on iPhone', '<p>Once this app is hosted on an HTTPS address, open it in Safari, tap <strong>Share → Add to Home Screen</strong>, and choose <strong>Open as Web App</strong> if shown.</p><p>The icon opens AthleteConnect in its own window. Accounts, messages, and bookings need a connection to the server.</p><div class="alert">The current localhost address runs on this computer. Your iPhone cannot open the computer’s localhost address. A hosted HTTPS address is needed for installation and reliable phone use.</div>');
    else if (action === 'account') modal('Your account', `<p>${escape(state.user.email)}</p><p>${escape(state.user.role)} account</p>${btn('Sign out', 'logout', '', 'primary')}`);
    else if (action === 'logout') { await api('/auth/logout', 'POST'); state.user = null; state.sessions = []; state.conversation = null; threadSignature = ''; location.hash = 'login'; await render(); }
    else if (action === 'retry') await render();
    else if (action === 'view-coach') await viewCoach(id);
    else if (action === 'request-slot') { const result = await api('/sessions', 'POST', { slotId: id }); state.conversation = result.id; closeModal(); notify('Request sent. Your coach will confirm the session.'); location.hash = 'sessions'; }
    else if (action === 'message') { state.conversation = id; location.hash = 'messages'; }
    else if (action === 'conversation') { state.conversation = id; threadSignature = ''; messagesPage(); }
    else if (action === 'meeting') modal('Add a Google Meet link', `<p>Create a meeting in Google Meet, then copy the link into this session. Both participants will see the saved link.</p><a class="btn secondary" href="https://meet.google.com/new" target="_blank" rel="noopener noreferrer">Create a meeting in Google Meet ↗</a><form id="meeting-form" data-id="${escape(id)}"><label for="meetLink">Google Meet link</label><input id="meetLink" name="meetLink" type="url" required value="${escape(state.sessions.find(s => s.id === id)?.meetLink || '')}" placeholder="https://meet.google.com/abc-defg-hij"><div class="alert alert-error hidden" data-error role="alert"></div><div class="form-footer"><button type="submit" class="btn primary">Save link</button></div></form><p class="legal-note">Meet creation is manual in this build. Automatic Calendar invitations and meeting creation are not connected.</p>`);
    else if (['accept', 'decline', 'complete'].includes(action)) { await api(`/sessions/${id}/${action}`, 'POST'); notify(action === 'accept' ? 'Session confirmed.' : action === 'decline' ? 'Request declined.' : 'Session marked complete.'); await render(); }
    else if (action === 'cancel') modal('Cancel this session?', `<p>This will notify the other person through the session’s updated status. There are no automatic charges or refunds in this build.</p>${btn('Cancel session', 'confirm-cancel', id, 'danger')}`);
    else if (action === 'confirm-cancel') { await api(`/sessions/${id}/cancel`, 'POST'); closeModal(); notify('Session cancelled.'); await render(); }
    else if (action === 'remove-slot') { await api(`/slots/${id}`, 'DELETE'); notify('Open time removed.'); await render(); }
    else if (action === 'review-approve') { await api(`/admin/coaches/${id}`, 'POST', { status: 'approved' }); notify('Coach approved.'); await render(); }
    else if (action === 'review-reject') modal('Return application for changes', `<form id="review-form" data-id="${escape(id)}"><label for="rejectionReason">Reason / changes requested (optional)</label><textarea id="rejectionReason" name="rejectionReason" maxlength="1000"></textarea><div class="alert alert-error hidden" data-error role="alert"></div><div class="form-footer"><button type="submit" class="btn danger">Reject application</button></div></form>`);
    else if (action === 'view-person') {
      const person = state.people.find(p => p.id === id); const p = person?.profile;
      modal(p?.fullName || 'Profile', p ? `<p>${escape(person.email)}</p>${badge(p.status)}<h3>${escape(p.sport)} · ${escape(p.location)}</h3>${person.role === 'coach' ? `<p class="bio">${escape(p.bio)}</p><h3>Credentials</h3><p class="bio">${escape(p.credentials)}</p><p>${money(p.hourlyRate)} / hour · ${escape(p.sessionTypes.join(', '))}</p>` : `<p>Age: ${escape(p.age)} · ${escape(p.skillLevel)}</p><p class="bio">${escape(p.goalsObjectives)}</p>${p.parent ? `<h3>Guardian information</h3><p>${escape(p.parent.name)}<br>${escape(p.parent.email)}<br>${escape(p.parent.phone)}</p><p>Guardian consent declared: ${p.guardianConsent ? 'Yes' : 'No'}</p>` : ''}`}<small>Updated ${escape(date(p.updatedAt))}</small>` : '<p>This account has not completed a profile.</p>');
    }
  } catch (error) { notify(error.message); }
  finally { target.disabled = false; }
});
document.addEventListener('submit', async event => {
  const form = event.target; if (form.id === 'filters') { event.preventDefault(); return; }
  if (!['auth-form', 'profile-form', 'slot-form', 'message-form', 'meeting-form', 'review-form'].includes(form.id)) return;
  event.preventDefault(); const submit = $('[type="submit"]', form); submit.disabled = true;
  const errorBox = $('[data-error]', form) || (form.id === 'message-form' ? $('#message-error') : null);
  errorBox?.classList.add('hidden'); const data = Object.fromEntries(new FormData(form));
  try {
    if (form.id === 'auth-form') { await api(`/auth/${state.authMode}`, 'POST', data); await refreshUser(); location.hash = state.user.profile || state.user.role === 'admin' ? 'home' : 'profile'; await render(); }
    else if (form.id === 'profile-form') {
      data.sessionTypes = new FormData(form).getAll('sessionTypes'); data.acceptingBookings = new FormData(form).has('acceptingBookings');
      data.parent = { name: data.parentName || '', email: data.parentEmail || '', phone: data.parentPhone || '' }; data.guardianConsent = new FormData(form).has('guardianConsent');
      const file = $('#photo').files[0];
      if (file) { if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Choose a PNG, JPEG, or WebP photo under 5 MB.'); }
      const saved = await api('/profile', 'PUT', data); state.user.profile = saved.profile;
      if (file) {
        try { const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); }); await api('/photo', 'PUT', { mime: file.type, base64 }); }
        catch (error) { throw new Error(`Profile saved, but the photo could not be uploaded. ${error.message}`); }
      }
      notify(state.user.role === 'coach' && saved.profile.status === 'pending' ? 'Application submitted for review.' : 'Profile saved.');
      location.hash = state.user.role === 'coach' ? 'today' : 'discover'; await render();
    }
    else if (form.id === 'slot-form') { data.startTime = new Date(data.startTime).toISOString(); await api('/slots', 'POST', data); notify('Open time published.'); await render(); }
    else if (form.id === 'message-form') { await api(`/sessions/${state.conversation}/messages`, 'POST', data); form.reset(); await loadThread(); $('#thread')?.scrollTo({ top: $('#thread').scrollHeight, behavior: 'smooth' }); }
    else if (form.id === 'meeting-form') { await api(`/sessions/${form.dataset.id}/meeting`, 'POST', data); closeModal(); notify('Meet link saved for both participants.'); await render(); }
    else if (form.id === 'review-form') { await api(`/admin/coaches/${form.dataset.id}`, 'POST', { status: 'rejected', rejectionReason: data.rejectionReason }); closeModal(); notify('Application returned for changes.'); await render(); }
  } catch (error) { if (errorBox) { errorBox.textContent = error.message; errorBox.classList.remove('hidden'); errorBox.scrollIntoView({ block: 'nearest' }); } else notify(error.message); }
  finally { submit.disabled = false; }
});
window.addEventListener('hashchange', render);
window.addEventListener('online', () => notify('You are back online.'));
window.addEventListener('offline', () => notify('You are offline. Messages and bookings need a connection.'));
setInterval(async () => {
  if (document.hidden || polling || !state.user || dialog.open) return;
  polling = true;
  try {
    if (state.route === 'messages') await loadThread();
    else if (['sessions', 'today'].includes(state.route)) {
      const role = state.user.role; const route = state.route; const userId = state.user.id;
      const next = (await api('/sessions')).sessions;
      if (state.route !== route || state.user?.id !== userId) return;
      if (JSON.stringify(next) !== JSON.stringify(state.sessions)) { state.sessions = next; if (route === 'sessions') sessionsPage(); else if (role === 'coach') coachOverview(); }
    }
  } catch { /* Keep the current view and unsent drafts intact during temporary outages. */ }
  finally { polling = false; }
}, 4000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
try { await refreshUser(); await render(); }
catch (error) { app.innerHTML = `<main id="main" class="boot"><span class="brandmark">a↗</span><h1>Let’s reconnect.</h1><p>${escape(error.message)}</p>${btn('Try again', 'reload', '', 'primary')}</main>`; document.addEventListener('click', event => { if (event.target.closest('[data-action="reload"]')) location.reload(); }); }
