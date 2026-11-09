// vibe://ws/<path> serves workspace files to the app: library modules, brand, media (with Range for video).
import { protocol } from 'electron';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import { parseRange } from './range';
import { resolveInside } from './workspace';

const MIME: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.webm': 'video/webm',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

export function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'vibe', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  ]);
}

export function handleProtocol(root: string) {
  protocol.handle('vibe', (req) => {
    let abs: string;
    try { abs = resolveInside(root, decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '')); }
    catch { return new Response('forbidden', { status: 403 }); }
    if (!existsSync(abs) || !statSync(abs).isFile()) return new Response('not found', { status: 404 });
    const size = statSync(abs).size, type = MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream';
    const headers: Record<string, string> = { 'Content-Type': type, 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
    const range = parseRange(req.headers.get('range'), size);
    if (range === 'unsatisfiable') return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    if (range) {
      const { start, end } = range;
      return new Response(Readable.toWeb(createReadStream(abs, { start, end })) as ReadableStream, {
        status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
      });
    }
    return new Response(Readable.toWeb(createReadStream(abs)) as ReadableStream, { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
  });
}
