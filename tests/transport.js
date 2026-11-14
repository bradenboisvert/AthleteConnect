import { Readable } from 'node:stream';
// Execute the HTTP server's actual request listener without needing a TCP socket.
// This keeps authorization and transaction tests runnable in network-restricted environments.
export function localFetch(server, input, options = {}) {
  const url = new URL(input);
  return new Promise((resolve, reject) => {
    const req = Readable.from(options.body ? [Buffer.from(options.body)] : []);
    req.url = url.pathname + url.search; req.method = options.method || 'GET';
    req.headers = Object.fromEntries(Object.entries({ host: url.host, ...options.headers }).map(([key, value]) => [key.toLowerCase(), value]));
    req.socket = { remoteAddress: '127.0.0.1' };
    const headers = new Map();
    const res = {
      headersSent: false,
      setHeader(name, value) { headers.set(name.toLowerCase(), value); },
      writeHead(status, values) { this.statusCode = status; for (const [k, v] of Object.entries(values || {})) this.setHeader(k, v); this.headersSent = true; },
      end(bytes) { const text = bytes == null ? '' : Buffer.from(bytes).toString('utf8'); resolve({ status: this.statusCode || 200, headers: { get: key => headers.get(key.toLowerCase()) || null }, json: async () => JSON.parse(text), text: async () => text }); }
    };
    req.on('error', reject); server.emit('request', req, res);
  });
}
