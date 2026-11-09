import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';

export async function isPortOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(400);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

export async function checkUrlAlive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(1500) });
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  }
}

export async function waitForServer(
  urlGetter: () => string,
  timeoutMs = 30000
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const currentUrl = urlGetter();
    if (await checkUrlAlive(currentUrl)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

export function createStaticServer(
  rootDir: string,
  port = 0
): Promise<{ server: http.Server; port: number; url: string; close: () => Promise<void> }> {
  const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2'
  };

  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    let reqPath = decodeURIComponent(parsedUrl.pathname);
    if (reqPath.endsWith('/')) {
      reqPath += 'index.html';
    }

    let filePath = path.join(rootDir, reqPath);
    if (!fs.existsSync(filePath) && fs.existsSync(`${filePath}.html`)) {
      filePath = `${filePath}.html`;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      const fallback404 = path.join(rootDir, '404.html');
      if (fs.existsSync(fallback404)) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(fallback404).pipe(res);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo;
      resolve({
        server,
        port: addr.port,
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise<void>((res) => server.close(() => res()))
      });
    });
    server.on('error', reject);
  });
}

export async function startPreviewServer({
  projectRoot,
  previewCommand,
  previewUrl,
  defaultPort = 4173,
  outputDir = 'dist',
  env = {},
  timeoutMs = 25000
}: {
  projectRoot: string;
  previewCommand?: string | null;
  previewUrl?: string | null;
  defaultPort?: number;
  outputDir?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}): Promise<{ url: string; attached: boolean; stop: () => Promise<void> }> {
  const targetUrl = previewUrl || `http://127.0.0.1:${defaultPort}`;

  // 1. Check if server is already running on the targetUrl
  if (await checkUrlAlive(targetUrl)) {
    return {
      url: targetUrl,
      attached: true,
      stop: async () => {} // Do not kill user's already running server
    };
  }

  // 2. If no command specified, check if static output exists
  if (!previewCommand) {
    const fullOutputDir = path.isAbsolute(outputDir) ? outputDir : path.join(projectRoot, outputDir);
    if (fs.existsSync(fullOutputDir) && fs.existsSync(path.join(fullOutputDir, 'index.html'))) {
      const staticServer = await createStaticServer(fullOutputDir);
      return {
        url: staticServer.url,
        attached: false,
        stop: async () => {
          await staticServer.close();
        }
      };
    }
    if (fs.existsSync(path.join(projectRoot, 'index.html'))) {
      const staticServer = await createStaticServer(projectRoot);
      return {
        url: staticServer.url,
        attached: false,
        stop: async () => {
          await staticServer.close();
        }
      };
    }
    throw new Error('No preview command specified and no static output directory found to serve.');
  }

  // 3. Spawn preview command
  const child = spawn(previewCommand, {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: {
      ...process.env,
      PORT: String(defaultPort),
      ...env
    },
    detached: true
  });

  let serverOutput = '';
  let currentUrl = targetUrl;

  child.stdout?.on('data', (d: Buffer) => {
    const text = d.toString();
    serverOutput += text;
    // Extract dynamic port/URL if server assigned an alternative port
    const match = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)/i);
    if (match) {
      currentUrl = match[0];
    }
  });
  child.stderr?.on('data', (d: Buffer) => {
    const text = d.toString();
    serverOutput += text;
    const match = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)/i);
    if (match) {
      currentUrl = match[0];
    }
  });

  let exitError: Error | null = null;
  child.on('exit', (code: number | null) => {
    if (code !== null && code !== 0) {
      exitError = new Error(`Preview server command failed with exit code ${code}.\nOutput: ${serverOutput}`);
    }
  });

  const alive = await waitForServer(() => currentUrl, timeoutMs);
  if (!alive) {
    try {
      if (child.pid) process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
    if (exitError) {
      throw exitError;
    }
    throw new Error(`Timed out waiting for preview server at ${currentUrl}.\nOutput:\n${serverOutput}`);
  }

  return {
    url: currentUrl,
    attached: false,
    stop: async () => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    }
  };
}
