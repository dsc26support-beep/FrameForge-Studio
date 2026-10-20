export type RenderErrorCode =
  | 'INVALID_PROJECT'
  | 'MISSING_ASSETS'
  | 'FFMPEG_MISSING'
  | 'CHROMIUM_MISSING'
  | 'OUTPUT_EXISTS'
  | 'OUTPUT_INVALID'
  | 'CANCELLED'
  | 'CAPTURE_FAILED'
  | 'ENCODE_FAILED'
  | 'VERIFY_FAILED'
  | 'LIMIT_EXCEEDED';

export class RenderError extends Error {
  readonly code: RenderErrorCode;
  readonly details?: string;
  constructor(code: RenderErrorCode, message: string, details?: string) {
    super(message);
    this.name = 'RenderError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
