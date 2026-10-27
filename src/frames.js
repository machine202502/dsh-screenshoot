import { createServer } from 'node:http';

/**
 * Small loopback server that hands captured frames to the chat UI.
 *
 * Tool results reach the client as text, so a capture stores its PNG here and
 * returns a `[shot:<id>]` marker; the tool row renders `<img src="…/shot/<id>">`.
 * Frames are kept in memory only for the newest entries — the files themselves
 * stay on disk and are not exposed.
 */
export function createFrameServer({ port = 49231, keep = 24 } = {}) {
  const frames = new Map();

  const put = (buffer, meta = {}) => {
    const id = Math.random().toString(36).slice(2, 10);
    frames.set(id, { buffer, meta, at: Date.now() });
    while (frames.size > keep) frames.delete(frames.keys().next().value);
    return id;
  };

  const sockets = new Set();

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    };
    if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();

    const [api, id] = url.pathname.split('/').filter(Boolean);
    if (api !== 'shot') return res.writeHead(404, cors).end();
    const frame = frames.get(id);
    if (!frame) return res.writeHead(404, cors).end('no frame');

    res.writeHead(200, { ...cors, 'content-type': 'image/png' });
    return res.end(frame.buffer);
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  return {
    put,
    async listen() {
      await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
      return server.address().port;
    },
    close() {
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      server.close();
    },
  };
}
