import test from 'node:test';
import assert from 'node:assert/strict';
import { profileInput, slotInput, priceFor, overlaps, meetingLink, calendarICS } from '../src/domain.js';
const player = { fullName: 'Test Player', sport: 'Baseball', location: 'Utah', age: 18, skillLevel: 'Beginner', sessionTypes: ['virtual'], goalsObjectives: '' };
test('minors need complete guardian data and explicit consent; adults do not retain guardian fields', () => {
  assert.throws(() => profileInput({ ...player, age: 17 }, 'player'), /guardian/);
  assert.throws(() => profileInput({ ...player, age: 7 }, 'player'), /between 8/);
  const minor = profileInput({ ...player, age: 8, guardianConsent: true, parent: { name: 'Parent Name', email: 'parent@example.test', phone: '555-555-1212' } }, 'player');
  assert.equal(minor.guardianConsent, true); assert.equal(minor.parent.email, 'parent@example.test');
  assert.equal(profileInput({ ...player, parent: minor.parent }, 'player').parent, undefined);
});
test('session types and prices are constrained', () => {
  assert.throws(() => profileInput({ ...player, sessionTypes: [] }, 'player'), /session type/);
  assert.throws(() => profileInput({ ...player, sessionTypes: ['other'] }, 'player'), /session type/);
  assert.equal(priceFor(65, 0, 1800000), 32.5);
  assert.equal(priceFor(49.99, 0, 5400000), 74.99);
});
test('availability validates dates, durations, and in-person location', () => {
  const now = Date.now(); const data = { startTime: now + 3600000, duration: 60, type: 'virtual' };
  assert.equal(slotInput(data, now).endTime, now + 7200000);
  assert.throws(() => slotInput({ ...data, type: 'in-person' }, now), /location/);
  assert.throws(() => slotInput({ ...data, startTime: now - 1 }, now), /ahead/);
  assert.throws(() => slotInput({ ...data, duration: 17 }, now), /minute/);
  assert.equal(overlaps(0, 10, 10, 20), false); assert.equal(overlaps(0, 11, 10, 20), true);
});
test('only real HTTPS Meet URL shapes are saved', () => {
  assert.equal(meetingLink('https://meet.google.com/abc-defg-hij?authuser=1'), 'https://meet.google.com/abc-defg-hij');
  for (const link of ['javascript:alert(1)', 'https://meet.google.com.evil.test/abc-defg-hij', 'http://meet.google.com/abc-defg-hij', 'https://meet.google.com/new']) assert.throws(() => meetingLink(link));
});
test('calendar export uses UTC and escapes injected calendar lines', () => {
  const ics = calendarICS({ id: 'test', startTime: 1795017600000, endTime: 1795021200000, location: 'Field, 1\nEND:VEVENT' }, 'Coaching; practice');
  assert.match(ics, /DTSTART:20261118T160000Z/); assert.match(ics, /Coaching\\; practice/); assert.match(ics, /Field\\, 1\\nEND:VEVENT/);
  assert.equal(ics.split('\r\n').filter(line => line === 'END:VEVENT').length, 1);
});
