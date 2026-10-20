/**
 * Render worker: runs in its own Node process, separate from the Electron main process.
 * It accepts exactly three message types over the IPC channel and never executes project data.
 */
import { promises as fs } from 'node:fs';
import { prepareJobFromArchive } from './job';
import { RenderError } from './errors';
import { renderProject } from './render';
import { checkCapabilities } from './tools';

interface StartMessage {
  type: 'start';
  archivePath: string;
  outputPath: string;
  overwrite: boolean;
  scale?: number;
}

const send = (m: unknown) => process.send?.(m);
let ctl: AbortController | null = null;

process.on('message', async (raw: unknown) => {
  const m = raw as { type?: string };
  if (m?.type === 'cancel') {
    ctl?.abort();
    return;
  }
  if (m?.type === 'capabilities') {
    send({ type: 'capabilities', value: await checkCapabilities() });
    return;
  }
  if (m?.type !== 'start' || ctl) return;
  const msg = raw as StartMessage;
  ctl = new AbortController();
  let job;
  try {
    job = await prepareJobFromArchive(new Uint8Array(await fs.readFile(msg.archivePath)));
    if (typeof msg.scale === 'number' && msg.scale >= 0.25 && msg.scale <= 1) job.project.renderSettings.scale = msg.scale;
    const res = await renderProject({
      project: job.project,
      assetPaths: job.assetPaths,
      outputPath: msg.outputPath,
      overwrite: msg.overwrite,
      signal: ctl.signal,
      onProgress: (p) => send({ type: 'progress', value: p }),
    });
    send({ type: 'done', value: { ...res, warnings: [...job.warnings, ...res.warnings] } });
  } catch (e) {
    const err = e instanceof RenderError ? e : new RenderError('ENCODE_FAILED', (e as Error).message);
    send({ type: 'error', code: err.code, message: err.message, details: err.details });
  } finally {
    await job?.cleanup();
    process.exit(0);
  }
});
send({ type: 'ready' });
