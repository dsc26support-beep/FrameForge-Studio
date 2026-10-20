import type { ExportSettings } from '@frameforge/project-schema';

export interface ResolvedAudioInput {
  path: string;
  /** Position on the video timeline. */
  startMs: number;
  trimStartMs: number;
  /** Length of audio used (already clamped to the available source and the video end). */
  durationMs: number;
  volume: number;
  fadeInMs: number;
  fadeOutMs: number;
}

export interface EncodeArgsInput {
  fps: number;
  outWidth: number;
  outHeight: number;
  totalMs: number;
  captureCodec: 'mjpeg' | 'png';
  settings: ExportSettings;
  audio: ResolvedAudioInput[];
  outputPath: string;
  lowResource: boolean;
}

const sec = (ms: number): string => (Math.max(0, ms) / 1000).toFixed(3);

/**
 * Builds the FFmpeg argument vector. Arguments are passed to `spawn` as an array (never through a
 * shell) and contain only numbers, enum values and paths that the application itself resolved.
 */
export function buildEncodeArgs(i: EncodeArgsInput): string[] {
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-f',
    'image2pipe',
    '-framerate',
    String(i.fps),
    '-c:v',
    i.captureCodec,
    '-i',
    'pipe:0',
  ];
  for (const a of i.audio) args.push('-i', a.path);

  if (i.audio.length > 0) {
    const chains: string[] = [];
    i.audio.forEach((a, idx) => {
      const n = idx + 1;
      const parts = [
        `atrim=start=${sec(a.trimStartMs)}:duration=${sec(a.durationMs)}`,
        'asetpts=PTS-STARTPTS',
        'aresample=48000',
        'aformat=channel_layouts=stereo',
        `volume=${a.volume.toFixed(3)}`,
      ];
      if (a.fadeInMs > 0) parts.push(`afade=t=in:st=0:d=${sec(Math.min(a.fadeInMs, a.durationMs))}`);
      if (a.fadeOutMs > 0) {
        const d = Math.min(a.fadeOutMs, a.durationMs);
        parts.push(`afade=t=out:st=${sec(a.durationMs - d)}:d=${sec(d)}`);
      }
      const delay = Math.round(a.startMs);
      if (delay > 0) parts.push(`adelay=${delay}|${delay}`);
      chains.push(`[${n}:a]${parts.join(',')}[a${n}]`);
    });
    const labels = i.audio.map((_, idx) => `[a${idx + 1}]`).join('');
    chains.push(
      i.audio.length === 1 ? `${labels}anull[aout]` : `${labels}amix=inputs=${i.audio.length}:normalize=0:duration=longest[aout]`,
    );
    args.push('-filter_complex', chains.join(';'), '-map', '0:v:0', '-map', '[aout]');
  } else {
    args.push('-map', '0:v:0', '-an');
  }

  args.push(
    '-vf',
    `scale=${i.outWidth}:${i.outHeight}:flags=bicubic,format=yuv420p`,
    '-r',
    String(i.fps),
    '-c:v',
    'libx264',
    '-preset',
    i.settings.encoderPreset,
    '-crf',
    String(i.settings.crf),
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
  );
  if (i.lowResource) args.push('-threads', '2');
  if (i.audio.length > 0) args.push('-c:a', 'aac', '-b:a', `${i.settings.audioBitrateKbps}k`, '-ar', '48000');
  args.push('-t', sec(i.totalMs), '-f', 'mp4', i.outputPath);
  return args;
}
