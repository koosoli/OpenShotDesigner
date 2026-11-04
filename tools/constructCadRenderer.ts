import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

export function constructCadRenderer(root: string): Plugin {
  const binary = resolve(root, 'tools/constructcad-render/target/debug',
    process.platform === 'win32' ? 'cineplan-constructcad-render.exe' : 'cineplan-constructcad-render');
  return {
    name: 'constructcad-renderer',
    apply: 'serve',
    configureServer(server) {
      let worker: ChildProcessWithoutNullStreams | undefined;
      let finish: ((pixels?: Buffer) => void) | undefined;

      function startWorker() {
        const child = spawn(binary, [], { windowsHide: true });
        worker = child;
        let length: number | undefined;
        child.stdout.on('readable', () => {
          if (worker !== child) return;
          if (length === undefined) {
            const header: Buffer | null = child.stdout.read(4);
            if (!header) return;
            length = header.readUInt32LE(0);
            if (length > 960 * 960 * 4) {
              child.kill();
              return;
            }
          }
          const pixels: Buffer | null = length ? child.stdout.read(length) : Buffer.alloc(0);
          if (!pixels) return;
          length = undefined;
          finish?.(pixels);
        });
        child.stderr.on('data', (chunk: Buffer) => server.config.logger.warn(String(chunk).trim()));
        child.stdin.on('error', () => { if (worker === child) finish?.(); });
        const dispose = () => {
          if (worker !== child) return;
          worker = undefined;
          finish?.();
        };
        child.on('error', dispose);
        child.on('exit', dispose);
        return child;
      }

      server.httpServer?.once('close', () => worker?.kill());
      server.middlewares.use('/__cineplan_constructcad_frame', async (request, response) => {
        const peer = request.socket.remoteAddress;
        const local = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
        const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(request.headers.host ?? '');
        if (!local || !localHost || request.method !== 'POST' || request.headers['content-type'] !== 'application/json' ||
          (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`)) {
          response.statusCode = 403;
          response.end();
          return;
        }
        if (!existsSync(binary)) {
          response.statusCode = 503;
          response.end();
          return;
        }
        let body = '';
        try {
          for await (const chunk of request) {
            body += String(chunk);
            if (body.length > 8_000_000) {
              response.statusCode = 413;
              response.end();
              return;
            }
          }
        } catch {
          return;
        }
        if (finish) {
          response.statusCode = 429;
          response.end();
          return;
        }
        const starting = !worker;
        const child = worker ?? startWorker();
        const result = await new Promise<Buffer | undefined>((done) => {
          const timeout = setTimeout(() => {
            child.kill();
            finish?.();
          }, starting ? 30_000 : 12_000);
          finish = (pixels) => {
            clearTimeout(timeout);
            finish = undefined;
            done(pixels);
          };
          // One JSON object per line. Normalize whitespace to prevent framing errors.
          try {
            child.stdin.write(JSON.stringify(JSON.parse(body)) + '\n');
          } catch {
            finish();
          }
        });
        response.statusCode = result ? (result.length ? 200 : 409) : 502;
        response.setHeader('Content-Type', 'application/octet-stream');
        response.setHeader('Cache-Control', 'no-store');
        response.end(result);
      });
    },
  };
}
