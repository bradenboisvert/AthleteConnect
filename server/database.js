import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('player','coach','admin')), createdAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (token TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), expiresAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS profiles (userId TEXT PRIMARY KEY REFERENCES users(id), data TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', reviewedBy TEXT, reviewedAt INTEGER, rejectionReason TEXT, updatedAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS slots (id TEXT PRIMARY KEY, coachId TEXT NOT NULL REFERENCES users(id), startTime INTEGER NOT NULL, endTime INTEGER NOT NULL, type TEXT NOT NULL, location TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, coachId TEXT NOT NULL REFERENCES users(id), playerId TEXT NOT NULL REFERENCES users(id), slotId TEXT NOT NULL REFERENCES slots(id), startTime INTEGER NOT NULL, endTime INTEGER NOT NULL, type TEXT NOT NULL, location TEXT NOT NULL, price REAL NOT NULL, status TEXT NOT NULL DEFAULT 'requested', playerIsMinor INTEGER NOT NULL, meetLink TEXT NOT NULL DEFAULT '', createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, sessionId TEXT NOT NULL REFERENCES sessions(id), senderId TEXT NOT NULL REFERENCES users(id), text TEXT NOT NULL, createdAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS photos (userId TEXT PRIMARY KEY REFERENCES users(id), mime TEXT NOT NULL, bytes BLOB NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_coach_time ON sessions(coachId, startTime);
    CREATE INDEX IF NOT EXISTS sessions_player_time ON sessions(playerId, startTime);
    CREATE INDEX IF NOT EXISTS slots_coach_time ON slots(coachId, startTime);
    CREATE INDEX IF NOT EXISTS messages_session_time ON messages(sessionId, createdAt);
    CREATE INDEX IF NOT EXISTS auth_expiry ON auth_sessions(expiresAt);
  `);
  return db;
}
