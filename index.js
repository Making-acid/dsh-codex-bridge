import { mkdir } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { startWorker } from './worker.js';

export const name = 'dsh-codex-bridge';

export async function apply(ctx, config = {}) {
  if (process.platform !== 'win32') throw new Error('DSH Codex Bridge currently supports Windows');
  for (const field of ['workspace', 'cliPath', 'modelPatch', 'nodePath']) {
    if (config[field] !== undefined && !isAbsolute(config[field])) {
      throw new Error(field + ' must be an absolute path');
    }
  }
  const cwd = config.workspace ?? join(process.env.LOCALAPPDATA, 'DSH-Codex-Bridge', 'workspace');
  await mkdir(cwd, { recursive: true });
  const server = await startWorker({ ...config, cwd });
  ctx.on('dispose', () => server.close());
}
