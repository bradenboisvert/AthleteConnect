import { openDatabase } from '../server/database.js';
import { createApp, hashPassword } from '../server/index.js';
import { generateIcons } from './icons.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databasePath = resolve(root, 'data/demo.sqlite');
const db = openDatabase(databasePath);
const password = 'TrainTogether!2026';
if (!db.prepare('SELECT id FROM users LIMIT 1').get()) {
  const hash = await hashPassword(password); const now = Date.now();
  const coaches = [
    ['demo-coach', 'Jordan Hayes', 'Baseball', 'South Jordan, UT', 65, 'Pitching, throwing mechanics, and a repeatable approach to training. This is a fictional coach profile for testing AthleteConnect.', 'Fictional demo: college pitcher and youth coaching experience.'],
    ['demo-coach-2', 'Alex Morgan', 'Soccer', 'Salt Lake City, UT', 55, 'Build confident first touches and sharper decisions through focused individual sessions. This is a fictional demonstration profile.', 'Fictional demo: club soccer and individual skills instruction.'],
    ['demo-coach-3', 'Sam Rivera', 'Golf', 'Draper, UT', 80, 'Start with a reliable setup, develop a practice routine, and build confidence around the green. This is a fictional demonstration profile.', 'Fictional demo: collegiate golf and beginner coaching.']
  ];
  const add = (id, email, role) => db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(id, email, hash, role, now);
  const addProfile = (id, data, status) => db.prepare('INSERT INTO profiles (userId,data,status,updatedAt) VALUES (?,?,?,?)').run(id, JSON.stringify(data), status, now);
  add('demo-player', 'player@example.test', 'player');
  addProfile('demo-player', { fullName: 'Taylor Brooks', age: 22, sport: 'Baseball', location: 'South Jordan, UT', skillLevel: 'Intermediate', goalsObjectives: 'Build a consistent pitching routine.', sessionTypes: ['virtual', 'in-person'] }, 'active');
  add('demo-admin', 'admin@example.test', 'admin');
  for (const [i, c] of coaches.entries()) {
    const [id, fullName, sport, location, hourlyRate, bio, credentials] = c;
    add(id, i ? `coach${i + 1}@example.test` : 'coach@example.test', 'coach');
    addProfile(id, { fullName, sport, location, hourlyRate, bio, credentials, sessionTypes: ['virtual', 'in-person'], acceptingBookings: true }, 'approved');
    for (let day = 1; day <= 6; day++) {
      const start = new Date(); start.setDate(start.getDate() + day); start.setHours(16 + i, 0, 0, 0);
      db.prepare('INSERT INTO slots VALUES (?,?,?,?,?,?)').run(`${id}-slot-${day}`, id, start.getTime(), start.getTime() + 3600000, day % 2 ? 'virtual' : 'in-person', day % 2 ? '' : 'Demo sports facility — confirm venue in messages');
    }
  }
  add('demo-pending', 'applicant@example.test', 'coach');
  addProfile('demo-pending', { fullName: 'Casey Lee', sport: 'Basketball', location: 'Salt Lake City, UT', hourlyRate: 45, bio: 'A fictional demo application for practicing the coach approval workflow. Focused on shooting fundamentals and confidence.', credentials: 'Fictional demo: high school coaching experience.', sessionTypes: ['virtual'], acceptingBookings: true }, 'pending');
}
db.close(); generateIcons(root);
const { server } = createApp({ databasePath });
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Port 4173 is already in use. Close the other AthleteConnect window, or set PORT to a different number.' : error.message); process.exitCode = 1; });
server.listen(Number(process.env.PORT || 4173), process.env.HOST || '127.0.0.1', () => {
  const url = `http://${process.env.HOST || '127.0.0.1'}:${server.address().port}`;
  console.log(`AthleteConnect demo: ${url}\nFictional accounts: player@example.test | coach@example.test | admin@example.test | applicant@example.test\nDemo-only password for all four: ${password}\nDemo records are kept separately in data/demo.sqlite. No payments or real invitations are sent.`);
  if (process.argv.includes('--open') && process.platform === 'win32') spawn('cmd.exe', ['/d', '/c', 'start', '', url], { stdio: 'ignore', windowsHide: true }).unref();
});
