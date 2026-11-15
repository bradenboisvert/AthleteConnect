import { ensure } from '../src/domain.js';
import { seedSandbox } from './sandbox.js';

// The private test keeps one small, owner-scoped aggregate. A revision compare-and-swap
// serializes booking decisions across devices without unsupported D1 BEGIN statements.
// This adapter is for the owner-only phone test, not a public marketplace database.
export class SandboxStore {
  constructor(database) { this.db = database; }
  async read(owner) {
    let row = await this.db.prepare('SELECT revision,data FROM phone_sandboxes WHERE owner_id=?').bind(owner).first();
    if (!row) {
      await this.db.prepare('INSERT INTO phone_sandboxes (owner_id,revision,data,updated_at) VALUES (?,0,?,?) ON CONFLICT(owner_id) DO NOTHING').bind(owner, JSON.stringify(seedSandbox()), Date.now()).run();
      row = await this.db.prepare('SELECT revision,data FROM phone_sandboxes WHERE owner_id=?').bind(owner).first();
    }
    ensure(row, 'The private test database is unavailable.', 503);
    return { revision: row.revision, data: JSON.parse(row.data) };
  }
  async change(owner, update) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const { revision, data } = await this.read(owner);
      const result = update(data); // Must be synchronous and have no external side effects.
      ensure(!(result instanceof Promise), 'Invalid asynchronous database change.', 500);
      const encoded = JSON.stringify(data);
      ensure(new TextEncoder().encode(encoded).length <= 750000, 'This private test is full. Export or archive its data before adding more.', 413);
      const changed = await this.db.prepare('UPDATE phone_sandboxes SET data=?,revision=revision+1,updated_at=? WHERE owner_id=? AND revision=? RETURNING revision').bind(encoded, Date.now(), owner, revision).first();
      if (changed) return result;
    }
    ensure(false, 'Another device is updating this test. Please try again.', 409);
  }
}
