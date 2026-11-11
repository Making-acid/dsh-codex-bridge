import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
const host = '127.0.0.1';
const port = 43771;
const keyFile = join(process.env.LOCALAPPDATA, 'DSH-Codex-Bridge', 'client.key');

async function callWorker(mode) {
  const key = await readFile(keyFile, 'utf8');
  const request = mode === 'submit'
    ? { method: 'POST', body: await readFile(process.argv[3], 'utf8') }
    : { method: 'GET' };
  const response = await fetch('http://' + host + ':' + port + (mode === 'submit' ? '/batch' : '/health'), {
    ...request,
    redirect: 'error',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(510_000),
  });
  const result = await response.json();
  console.log(JSON.stringify(result, null, 2));
  if (!response.ok || result.results?.some(item => !item.ok)) process.exitCode = 1;
}

try {
  const mode = process.argv[2];
  if (mode !== 'submit' && mode !== 'health') throw new Error('Usage: client.mjs health | submit tasks.json');
  await callWorker(mode);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}