import { openDatabase } from '../server/database.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const address = process.argv[2]?.trim().toLowerCase();
if (!address || !address.includes('@')) { console.error('Usage: npm run admin -- your-registered-email@example.com'); process.exit(1); }
const db = openDatabase(process.env.DATABASE_PATH || resolve(root, 'data/athleteconnect.sqlite'));
const user = db.prepare('SELECT id,role FROM users WHERE email=?').get(address);
if (!user) { console.error('Register this account in the app first. No changes made.'); db.close(); process.exit(1); }
if (user.role !== 'admin') {
  if (db.prepare('SELECT id FROM sessions WHERE playerId=? OR coachId=? LIMIT 1').get(user.id, user.id)) { console.error('Use a dedicated admin account without bookings. No changes made.'); db.close(); process.exit(1); }
  db.prepare("UPDATE users SET role='admin' WHERE id=?").run(user.id);
}
db.close(); console.log('Admin access granted. Sign out and back in to refresh the interface.');
