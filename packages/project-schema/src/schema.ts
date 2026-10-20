import { z } from 'zod';
import { LIMITS, SCHEMA_VERSION } from './limits';

export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid id');
/** Only hex colours are accepted so no CSS can be injected through colour fields. */
export const colorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Expected a hex colour such as #1a2b3c');
const pct = (min = -200, max = 300) => z.number().min(min).max(max);
const nameSchema = z.string().trim().min(1).max(LIMITS.maxNameLength);

export const EASINGS = ['linear', 'ease', 'easeIn', 'easeOut', 'easeInOut', 'overshoot'] as const;
export const ENTER_PRESETS = [
  'none',
  'fadeIn',
  'slideUp',
  'slideDown',
  'slideLeft',
  'slideRight',
  'zoomIn',
  'zoomOut',
  'pop',
  'reveal',
  'growUp',
  'growRight',
  'pulse',
  'float',
] as const;
export const EXIT_PRESETS = ['none', 'fadeOut', 'slideDown', 'zoomOut'] as const;
export const TRANSITIONS = ['none', 'fade', 'slideLeft', 'slideRight', 'slideUp', 'wipe'] as const;
export const FONT_FAMILIES = ['sans', 'serif', 'mono', 'display'] as const;

export const animationSchema = z.object({
  preset: z.enum(ENTER_PRESETS).default('none'),
  delayMs: z.number().int().min(0).max(LIMITS.maxSceneMs).default(0),
  durationMs: z.number().int().min(0).max(60_000).default(600),
  easing: z.enum(EASINGS).default('easeOut'),
  exit: z.enum(EXIT_PRESETS).default('none'),
  exitMs: z.number().int().min(0).max(10_000).default(400),
});

const elementBase = {
  id: idSchema,
  name: z.string().max(LIMITS.maxNameLength).default(''),
  x: pct().default(50),
  y: pct().default(50),
  w: z.number().min(0).max(300).default(60),
  h: z.number().min(0).max(300).default(20),
  scale: z.number().min(0.05).max(10).default(1),
  rotation: z.number().min(-360).max(360).default(0),
  opacity: z.number().min(0).max(1).default(1),
  animation: animationSchema.prefault({}),
};

export const textElementSchema = z.object({
  ...elementBase,
  type: z.literal('text'),
  text: z.string().max(LIMITS.maxTextLength).default('Your text'),
  fontSize: z.number().min(0.5).max(60).default(7),
  fontWeight: z.number().int().min(100).max(900).default(700),
  fontFamily: z.enum(FONT_FAMILIES).default('sans'),
  color: colorSchema.default('#ffffff'),
  align: z.enum(['left', 'center', 'right']).default('center'),
  lineHeight: z.number().min(0.8).max(3).default(1.2),
  letterSpacing: z.number().min(-0.2).max(1).default(0),
});

export const shapeElementSchema = z.object({
  ...elementBase,
  type: z.literal('shape'),
  shape: z.enum(['rect', 'ellipse']).default('rect'),
  fill: colorSchema.default('#4f7cff'),
  stroke: colorSchema.nullable().default(null),
  strokeWidth: z.number().min(0).max(50).default(0),
  radius: z.number().min(0).max(50).default(0),
});

export const imageElementSchema = z.object({
  ...elementBase,
  type: z.literal('image'),
  assetId: idSchema,
  fit: z.enum(['cover', 'contain']).default('contain'),
  radius: z.number().min(0).max(50).default(0),
});

export const elementSchema = z.discriminatedUnion('type', [textElementSchema, shapeElementSchema, imageElementSchema]);

export const backgroundSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('color'), color: colorSchema.default('#101828') }),
  z.object({
    type: z.literal('gradient'),
    from: colorSchema.default('#101828'),
    to: colorSchema.default('#3b2a8c'),
    angle: z.number().min(0).max(360).default(135),
  }),
  z.object({
    type: z.literal('image'),
    assetId: idSchema,
    fit: z.enum(['cover', 'contain']).default('cover'),
    tint: colorSchema.nullable().default(null),
  }),
]);

export const transitionSchema = z.object({
  type: z.enum(TRANSITIONS).default('none'),
  durationMs: z.number().int().min(0).max(5000).default(500),
});

export const sceneSchema = z.object({
  id: idSchema,
  name: nameSchema.default('Scene'),
  durationMs: z.number().int().min(LIMITS.minSceneMs).max(LIMITS.maxSceneMs).default(3000),
  background: backgroundSchema.default({ type: 'color', color: '#101828' }),
  mode: z.enum(['structured', 'html']).default('structured'),
  elements: z.array(elementSchema).max(LIMITS.maxElementsPerScene).default([]),
  html: z.string().max(LIMITS.maxCustomHtmlChars).default(''),
  transition: transitionSchema.prefault({}),
});

export const assetSchema = z.object({
  id: idSchema,
  kind: z.enum(['image', 'audio', 'video']),
  name: z.string().min(1).max(160),
  mime: z
    .string()
    .regex(/^[a-z]+\/[a-z0-9.+-]+$/i)
    .max(80),
  size: z.number().int().min(0).max(LIMITS.maxAssetBytes),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
  durationMs: z
    .number()
    .int()
    .min(0)
    .max(24 * 3600 * 1000)
    .optional(),
});

export const audioTrackSchema = z.object({
  id: idSchema,
  name: z.string().max(LIMITS.maxNameLength).default('Audio'),
  assetId: idSchema,
  startMs: z.number().int().min(0).max(LIMITS.maxTotalMs).default(0),
  trimStartMs: z.number().int().min(0).default(0),
  durationMs: z.number().int().min(1).nullable().default(null),
  volume: z.number().min(0).max(2).default(1),
  fadeInMs: z.number().int().min(0).max(30_000).default(0),
  fadeOutMs: z.number().int().min(0).max(30_000).default(0),
  muted: z.boolean().default(false),
});

export const captionItemSchema = z.object({
  id: idSchema,
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(1),
  text: z.string().max(500),
});

export const captionsSchema = z.object({
  enabled: z.boolean().default(false),
  position: z.enum(['top', 'center', 'bottom']).default('bottom'),
  fontSize: z.number().min(1).max(20).default(4),
  color: colorSchema.default('#ffffff'),
  background: colorSchema.default('#000000aa'),
  items: z.array(captionItemSchema).max(LIMITS.maxCaptions).default([]),
});

export const brandSchema = z.object({
  name: z.string().max(LIMITS.maxNameLength).default(''),
  primary: colorSchema.default('#4f7cff'),
  secondary: colorSchema.default('#ff7a59'),
  background: colorSchema.default('#101828'),
  text: colorSchema.default('#ffffff'),
  fontFamily: z.enum(FONT_FAMILIES).default('sans'),
  logoAssetId: idSchema.nullable().default(null),
});

export const EXPORT_PRESETS = ['480p', '720p', '1080p'] as const;
export const ASPECTS = ['16:9', '9:16', '1:1'] as const;
export const FPS_VALUES = [24, 25, 30, 50, 60] as const;
export const ENCODER_PRESETS = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium'] as const;

export const exportSettingsSchema = z.object({
  format: z.literal('mp4').default('mp4'),
  preset: z.enum(EXPORT_PRESETS).default('720p'),
  aspect: z.enum(ASPECTS).default('16:9'),
  videoCodec: z.literal('h264').default('h264'),
  audioCodec: z.literal('aac').default('aac'),
  crf: z.number().int().min(14).max(35).default(23),
  encoderPreset: z.enum(ENCODER_PRESETS).default('veryfast'),
  audioBitrateKbps: z.number().int().min(64).max(320).default(160),
  fileName: z.string().min(1).max(100).default('video'),
});

export const renderSettingsSchema = z.object({
  lowResourceMode: z.boolean().default(false),
  /** Output scale applied to the canvas for adaptive quality (0.25 - 1). */
  scale: z.number().min(0.25).max(1).default(1),
  captureFormat: z.enum(['jpeg', 'png']).default('jpeg'),
  jpegQuality: z.number().int().min(60).max(100).default(92),
});

export const canvasSchema = z.object({
  width: z.number().int().min(LIMITS.minCanvas).max(LIMITS.maxCanvas).default(1280),
  height: z.number().int().min(LIMITS.minCanvas).max(LIMITS.maxCanvas).default(720),
});

export const projectSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: idSchema,
  name: nameSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  canvas: canvasSchema.prefault({}),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)]).default(30),
  scenes: z.array(sceneSchema).max(LIMITS.maxScenes).default([]),
  assets: z.array(assetSchema).max(LIMITS.maxAssets).default([]),
  audioTracks: z.array(audioTrackSchema).max(LIMITS.maxAudioTracks).default([]),
  captions: captionsSchema.prefault({}),
  brand: brandSchema.prefault({}),
  exportSettings: exportSettingsSchema.prefault({}),
  renderSettings: renderSettingsSchema.prefault({}),
});

export type Project = z.infer<typeof projectSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type SceneElement = z.infer<typeof elementSchema>;
export type TextElement = z.infer<typeof textElementSchema>;
export type ShapeElement = z.infer<typeof shapeElementSchema>;
export type ImageElement = z.infer<typeof imageElementSchema>;
export type Background = z.infer<typeof backgroundSchema>;
export type Animation = z.infer<typeof animationSchema>;
export type Transition = z.infer<typeof transitionSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type AudioTrack = z.infer<typeof audioTrackSchema>;
export type CaptionItem = z.infer<typeof captionItemSchema>;
export type ExportSettings = z.infer<typeof exportSettingsSchema>;
export type RenderSettings = z.infer<typeof renderSettingsSchema>;
export type Brand = z.infer<typeof brandSchema>;
