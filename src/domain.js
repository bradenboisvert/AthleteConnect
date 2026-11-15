export const SPORTS = ['Baseball', 'Softball', 'Basketball', 'Football', 'Soccer', 'Volleyball', 'Golf', 'Tennis', 'Swimming', 'Track & Field', 'Other'];
export const TYPES = ['virtual', 'in-person'];
export function ensure(condition, message, status = 400) {
  if (!condition) throw Object.assign(new Error(message), { status });
}
export function clean(value, max = 200) {
  ensure(typeof value === 'string' && value.trim().length <= max, `Text must be at most ${max} characters.`);
  return value.trim();
}
export function email(value) {
  const result = clean(value, 254).toLowerCase();
  ensure(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result), 'Enter a valid email address.');
  return result;
}
export function profileInput(data, role) {
  const common = { fullName: clean(data.fullName, 100), sport: clean(data.sport, 40), location: clean(data.location, 120) };
  ensure(common.fullName.length >= 2, 'Enter your full name.');
  ensure(SPORTS.includes(common.sport), 'Choose a sport.');
  const sessionTypes = data.sessionTypes;
  ensure(Array.isArray(sessionTypes) && sessionTypes.length > 0 && sessionTypes.length <= 2 && new Set(sessionTypes).size === sessionTypes.length && sessionTypes.every(t => TYPES.includes(t)), 'Select at least one session type.');
  if (role === 'coach') {
    const hourlyRate = Number(data.hourlyRate);
    ensure(Number.isFinite(hourlyRate) && hourlyRate >= 1 && hourlyRate <= 1000 && Math.abs(hourlyRate * 100 - Math.round(hourlyRate * 100)) < 0.000001, 'Set an hourly rate between $1 and $1,000, with at most two decimal places.');
    const bio = clean(data.bio, 2000);
    const credentials = clean(data.credentials, 1000);
    ensure(bio.length >= 30 && credentials.length >= 5, 'Add a bio of at least 30 characters and your coaching credentials.');
    return { ...common, sessionTypes, hourlyRate, bio, credentials, acceptingBookings: data.acceptingBookings !== false };
  }
  const age = Number(data.age);
  ensure(Number.isInteger(age) && age >= 8 && age <= 100, 'Players must be between 8 and 100.');
  const skillLevel = clean(data.skillLevel, 30);
  ensure(['Beginner', 'Intermediate', 'Advanced'].includes(skillLevel), 'Choose a skill level.');
  const result = { ...common, age, skillLevel, sessionTypes, goalsObjectives: clean(data.goalsObjectives, 1500) };
  if (age < 18) {
    ensure(data.guardianConsent === true, 'A parent or guardian must consent and manage a minor’s account.');
    const name = clean(data.parent?.name, 100);
    const phone = clean(data.parent?.phone, 40);
    ensure(name.length >= 2 && /^[+()\d .-]{7,40}$/.test(phone), 'Enter the parent or guardian’s name and phone number.');
    result.parent = { name, email: email(data.parent?.email), phone };
    result.guardianConsent = true;
  }
  return result;
}
export function slotInput(data, now = Date.now()) {
  const startTime = new Date(data.startTime).getTime();
  const duration = Number(data.duration);
  ensure(Number.isFinite(startTime) && startTime > now + 60000 && startTime < now + 366 * 86400000, 'Choose a time at least one minute ahead and within the next year.');
  ensure([30, 60, 90, 120].includes(duration), 'Choose a 30, 60, 90, or 120 minute session.');
  ensure(TYPES.includes(data.type), 'Choose virtual or in-person.');
  const location = clean(data.location || '', 200);
  ensure(data.type !== 'in-person' || location.length >= 3, 'Add a public meeting location for in-person sessions.');
  return { startTime, endTime: startTime + duration * 60000, type: data.type, location };
}
export function overlaps(aStart, aEnd, bStart, bEnd) { return aStart < bEnd && aEnd > bStart; }
export function priceFor(hourlyRate, startTime, endTime) { return Math.round(hourlyRate * 100 * (endTime - startTime) / 3600000) / 100; }
export function meetingLink(value) {
  if (value === '') return '';
  let url;
  try { url = new URL(value); } catch { ensure(false, 'Enter a valid Google Meet URL.'); }
  ensure(url.protocol === 'https:' && url.hostname === 'meet.google.com' && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(url.pathname), 'Use a Google Meet link such as https://meet.google.com/abc-defg-hij.');
  return url.origin + url.pathname;
}
export function calendarICS(session, name = 'AthleteConnect coaching session') {
  const stamp = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const escape = s => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\r/g, '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AthleteConnect//Sessions//EN', 'BEGIN:VEVENT', `UID:${session.id}@athleteconnect`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(session.startTime)}`, `DTEND:${stamp(session.endTime)}`, `SUMMARY:${escape(name)}`, `DESCRIPTION:${escape(session.meetLink || 'See AthleteConnect for session details.')}`, `LOCATION:${escape(session.location || 'Virtual')}`, 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}
