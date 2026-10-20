import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { RenderError } from './errors';

const execFileP = promisify(execFile);

export interface ProbeInfo {
  formatName: string;
  durationSec: number;
  sizeBytes: number;
  video?: { codec: string; width: number; height: number; pixFmt: string; fps: number; frames?: number };
  audio?: { codec: string; sampleRate: number; channels: number };
}

function parseRate(r: string | undefined): number {
  if (!r) return 0;
  const [n, d] = r.split('/').map(Number);
  return d ? (n ?? 0) / d : (n ?? 0);
}

export async function probe(ffprobe: string, file: string): Promise<ProbeInfo> {
  const { stdout } = await execFileP(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], {
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  const data = JSON.parse(stdout) as { format?: Record<string, string>; streams?: Record<string, string | number>[] };
  const v = data.streams?.find((s) => s.codec_type === 'video');
  const a = data.streams?.find((s) => s.codec_type === 'audio');
  return {
    formatName: data.format?.format_name ?? '',
    durationSec: Number(data.format?.duration ?? 0),
    sizeBytes: Number(data.format?.size ?? 0),
    ...(v
      ? {
          video: {
            codec: String(v.codec_name),
            width: Number(v.width),
            height: Number(v.height),
            pixFmt: String(v.pix_fmt),
            fps: parseRate(String(v.avg_frame_rate)),
            ...(v.nb_frames ? { frames: Number(v.nb_frames) } : {}),
          },
        }
      : {}),
    ...(a ? { audio: { codec: String(a.codec_name), sampleRate: Number(a.sample_rate), channels: Number(a.channels) } } : {}),
  };
}

export interface Verification {
  ok: boolean;
  issues: string[];
  info: ProbeInfo;
}

export interface VerifyExpectation {
  width: number;
  height: number;
  fps: number;
  frames: number;
  durationMs: number;
  hasAudio: boolean;
}

/** Checks that an encoded file is the video we asked for, and (optionally) that it decodes without errors. */
export async function verifyOutput(
  ffmpeg: string,
  ffprobe: string,
  file: string,
  expect: VerifyExpectation,
  deepDecode: boolean,
): Promise<Verification> {
  const issues: string[] = [];
  let info: ProbeInfo;
  try {
    info = await probe(ffprobe, file);
  } catch (e) {
    throw new RenderError('VERIFY_FAILED', 'The output file could not be read back as a media file.', (e as Error).message);
  }
  if (!info.formatName.includes('mp4')) issues.push(`Container is "${info.formatName}", expected MP4.`);
  if (info.sizeBytes <= 0) issues.push('Output file is empty.');
  if (!info.video) issues.push('No video stream.');
  else {
    if (info.video.codec !== 'h264') issues.push(`Video codec is ${info.video.codec}, expected h264.`);
    if (info.video.pixFmt !== 'yuv420p') issues.push(`Pixel format is ${info.video.pixFmt}, expected yuv420p.`);
    if (info.video.width !== expect.width || info.video.height !== expect.height)
      issues.push(`Size is ${info.video.width}x${info.video.height}, expected ${expect.width}x${expect.height}.`);
    if (Math.abs(info.video.fps - expect.fps) > 0.01) issues.push(`Frame rate is ${info.video.fps}, expected ${expect.fps}.`);
    if (info.video.frames !== undefined && Math.abs(info.video.frames - expect.frames) > 1)
      issues.push(`Frame count is ${info.video.frames}, expected ${expect.frames}.`);
  }
  const tolerance = Math.max(0.25, 2000 / expect.fps / 1000);
  if (Math.abs(info.durationSec - expect.durationMs / 1000) > tolerance)
    issues.push(`Duration is ${info.durationSec.toFixed(2)}s, expected ${(expect.durationMs / 1000).toFixed(2)}s.`);
  if (expect.hasAudio && !info.audio) issues.push('Audio was expected but the output has no audio stream.');
  if (expect.hasAudio && info.audio && info.audio.codec !== 'aac') issues.push(`Audio codec is ${info.audio.codec}, expected aac.`);

  if (deepDecode && issues.length === 0) {
    const err = await new Promise<string>((resolve) => {
      const p = spawn(ffmpeg, ['-v', 'error', '-nostdin', '-i', file, '-f', 'null', '-'], {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let out = '';
      p.stderr.on('data', (d: Buffer) => {
        if (out.length < 2000) out += d.toString();
      });
      p.on('close', (code) => resolve(code === 0 ? out.trim() : `${out.trim()} (exit ${code})`));
      p.on('error', (e) => resolve(e.message));
    });
    if (err) issues.push(`Decode check reported: ${err.slice(0, 300)}`);
  }
  return { ok: issues.length === 0, issues, info };
}
