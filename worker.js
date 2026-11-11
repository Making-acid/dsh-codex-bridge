import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { join } from 'node:path';


const host = '127.0.0.1';
const port = 43771;
const stateDir = join(process.env.LOCALAPPDATA, 'DSH-Codex-Bridge');
const keyFile = join(stateDir, 'client.key');

const cli = join(process.env.ProgramFiles, 'DSH NEXT', 'resources', 'app',
  'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');

const maxBody = 128 * 1024;

async function serverKey() {
  await mkdir(stateDir, { recursive: true });
  try {
    await writeFile(keyFile, randomBytes(32).toString('hex'), { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const key = await readFile(keyFile, 'utf8');
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid bridge key file');
  return key;
}

function runTask(prompt, { cwd, cliPath, modelPatch, nodePath }) {
  return new Promise((done) => {
    const child = spawn(nodePath,
      [cliPath, '--profile', 'headless', ...(modelPatch ? ['--patch', modelPatch] : []), '--json', '-'],
      { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let output = '';
    let failure;
    const timeout = setTimeout(() => {
      failure = 'timeout';
      child.kill();
    }, 120_000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (failure) return;
      output += chunk;
      if (output.length > 2_000_000) {
        failure = 'output_limit';
        child.kill();
      }
    });
    child.on('error', () => { failure = 'spawn_failed'; });
    child.stdin.on('error', () => {});
    child.stdin.end(prompt, 'utf8');
    child.on('close', (exitCode) => {
      clearTimeout(timeout);
      let sessionId;
      let answer;
      for (const line of output.split('\n')) {
        try {
          const event = JSON.parse(line);
          if (event.type === 'session') sessionId = event.sessionId;
          if (event.type === 'final') answer = event.text;
        } catch {
          // The CLI can emit non-JSON startup notices.
        }
      }
      if (failure || exitCode !== 0 || typeof answer !== 'string') {
        done({ ok: false, sessionId, error: failure ?? 'dsh_failed', exitCode });
      } else {
        done({ ok: true, sessionId, answer });
      }
    });
  });
}

export async function startWorker({ cwd, cliPath = cli, modelPatch, nodePath = 'node' }) {
  if (modelPatch) await readFile(modelPatch);
  const key = Buffer.from(await serverKey());
  let busy = false;
  const server = http.createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const auth = Buffer.from(req.headers.authorization?.slice(7) ?? '');
    if (!req.headers.authorization?.startsWith('Bearer ') ||
        auth.length !== key.length || !timingSafeEqual(auth, key)) {
      send(401, { error: 'unauthorized' });
      return;
    }
    if (req.method === 'GET' && req.url === '/health') {
      send(200, { ok: true, busy });
      return;
    }
    if (req.method !== 'POST' || req.url !== '/batch') {
      send(404, { error: 'unknown_route' });
      return;
    }
    let tasks;
    try {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes <= maxBody) chunks.push(chunk);
      }
      if (bytes > maxBody) {
        send(413, { error: 'request_too_large' });
        return;
      }
      ({ tasks } = JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '')));
      if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 8 ||
          tasks.some(task => typeof task !== 'string' || !task.trim() || task.length > 8000)) {
        throw new Error('invalid tasks');
      }
    } catch {
      send(400, { error: 'invalid_tasks' });
      return;
    }
    if (busy) {
      send(409, { error: 'batch_in_progress' });
      return;
    }
    busy = true;
    const batchId = randomBytes(12).toString('hex');

    try {
      await appendFile(join(stateDir, 'audit.jsonl'), JSON.stringify({ at: new Date().toISOString(), event: 'accepted', source: 'codex-client-key', batchId, count: tasks.length }) + '\n');
      const results = [];
      for (let i = 0; i < tasks.length; i += 2) {
        results.push(...await Promise.all(tasks.slice(i, i + 2).map(prompt => runTask(prompt, { cwd, cliPath, modelPatch, nodePath }))));
      }
      send(200, { batchId, results });
    } catch {
      send(500, { batchId, error: 'worker_failed' });
    } finally {
      busy = false;
    }
  });
  server.requestTimeout = 15_000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  return server;
}
