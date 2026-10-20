import type { Project, Scene, SceneElement } from '@frameforge/project-schema';
import { EASING_CSS, FONT_STACKS } from './easing';
import { resolveAssetRefs, sanitizeHtmlFragment } from './sanitize';
import { RUNTIME_SOURCE } from './runtime';
import { computeTimeline, type Timeline } from './timing';

export interface CompileOptions {
  /** Maps an asset id to a URL the page may load, or null if unavailable. */
  assetUrl: (assetId: string) => string | null;
  /** Value placed in the CSP `img-src` directive, e.g. `https://ff-assets.invalid` or `blob: data:`. */
  imgSrc: string;
  nonce?: string;
}

export interface CompileResult {
  html: string;
  warnings: string[];
  missingAssets: string[];
  timeline: Timeline;
}

const num = (v: number): string => String(Math.round(v * 10000) / 10000);
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonForScript = (v: unknown): string =>
  JSON.stringify(v)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

function safeUrl(url: string): string {
  // The URL is produced by trusted code, but make sure it cannot break out of a CSS string/attribute.
  return url.replace(/["'\\()<>\s]/g, (c) => encodeURIComponent(c));
}

export function keyframesCss(W: number, H: number): string {
  const dy = num(H * 0.08);
  const dx = num(W * 0.08);
  return `
@keyframes ff-in-fadeIn{from{opacity:0}to{opacity:1}}
@keyframes ff-in-slideUp{from{opacity:0;transform:translateY(${dy}px)}to{opacity:1;transform:translateY(0)}}
@keyframes ff-in-slideDown{from{opacity:0;transform:translateY(-${dy}px)}to{opacity:1;transform:translateY(0)}}
@keyframes ff-in-slideLeft{from{opacity:0;transform:translateX(${dx}px)}to{opacity:1;transform:translateX(0)}}
@keyframes ff-in-slideRight{from{opacity:0;transform:translateX(-${dx}px)}to{opacity:1;transform:translateX(0)}}
@keyframes ff-in-zoomIn{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@keyframes ff-in-zoomOut{from{opacity:0;transform:scale(1.4)}to{opacity:1;transform:scale(1)}}
@keyframes ff-in-pop{0%{opacity:0;transform:scale(.3)}70%{opacity:1;transform:scale(1.08)}100%{opacity:1;transform:scale(1)}}
@keyframes ff-in-reveal{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes ff-in-growUp{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes ff-in-growRight{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes ff-in-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes ff-in-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-${num(H * 0.015)}px)}}
@keyframes ff-out-fadeOut{from{opacity:1}to{opacity:0}}
@keyframes ff-out-slideDown{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(${dy}px)}}
@keyframes ff-out-zoomOut{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(.7)}}
`;
}

function animationCss(el: SceneElement, sceneMs: number): string {
  const a = el.animation;
  const names: string[] = [];
  const durs: string[] = [];
  const delays: string[] = [];
  const eases: string[] = [];
  const fills: string[] = [];
  const iters: string[] = [];
  if (a.preset !== 'none') {
    names.push(`ff-in-${a.preset}`);
    durs.push(`${Math.max(1, a.durationMs)}ms`);
    delays.push(`${a.delayMs}ms`);
    eases.push(a.preset === 'pulse' || a.preset === 'float' ? 'ease-in-out' : EASING_CSS[a.easing]);
    fills.push('both');
    iters.push(a.preset === 'pulse' || a.preset === 'float' ? 'infinite' : '1');
  }
  if (a.exit !== 'none') {
    names.push(`ff-out-${a.exit}`);
    durs.push(`${Math.max(1, a.exitMs)}ms`);
    delays.push(`${Math.max(0, sceneMs - a.exitMs)}ms`);
    eases.push('ease-in');
    fills.push('forwards');
    iters.push('1');
  }
  if (!names.length) return '';
  return `animation-name:${names.join(',')};animation-duration:${durs.join(',')};animation-delay:${delays.join(',')};animation-timing-function:${eases.join(',')};animation-fill-mode:${fills.join(',')};animation-iteration-count:${iters.join(',')};`;
}

function elementHtml(el: SceneElement, scene: Scene, W: number, H: number, opts: CompileOptions, missing: Set<string>): string {
  const minDim = Math.min(W, H);
  const isText = el.type === 'text';
  const box =
    `left:${num(el.x)}%;top:${num(el.y)}%;width:${num((el.w / 100) * W)}px;` +
    (isText ? '' : `height:${num((el.h / 100) * H)}px;`) +
    `transform:translate(-50%,-50%) rotate(${num(el.rotation)}deg) scale(${num(el.scale)});opacity:${num(el.opacity)};`;
  const anim = animationCss(el, scene.durationMs);
  let inner = '';
  let innerStyle = `${anim}`;
  switch (el.type) {
    case 'text': {
      const px = num((el.fontSize / 100) * minDim);
      innerStyle += `font:${el.fontWeight} ${px}px/${num(el.lineHeight)} ${FONT_STACKS[el.fontFamily]};color:${el.color};text-align:${el.align};letter-spacing:${num(el.letterSpacing)}em;white-space:pre-wrap;overflow-wrap:anywhere;`;
      inner = esc(el.text);
      break;
    }
    case 'shape': {
      const radius = el.shape === 'ellipse' ? '50%' : `${num(el.radius)}%`;
      innerStyle +=
        `background:${el.fill};border-radius:${radius};` +
        (el.stroke && el.strokeWidth > 0 ? `border:${num(el.strokeWidth)}px solid ${el.stroke};box-sizing:border-box;` : '');
      break;
    }
    case 'image': {
      const url = opts.assetUrl(el.assetId);
      if (!url) {
        missing.add(el.assetId);
        innerStyle += 'background:#444;';
      } else {
        inner = `<img alt="" src="${esc(safeUrl(url))}" style="width:100%;height:100%;object-fit:${el.fit};border-radius:${num(el.radius)}%;display:block">`;
      }
      break;
    }
  }
  return `<div class="ff-el" data-el="${esc(el.id)}" style="${box}"><div class="ff-anim" style="${innerStyle}">${inner}</div></div>`;
}

function backgroundHtml(scene: Scene, opts: CompileOptions, missing: Set<string>): { css: string; extra: string } {
  const bg = scene.background;
  if (bg.type === 'color') return { css: `background:${bg.color};`, extra: '' };
  if (bg.type === 'gradient') return { css: `background:linear-gradient(${num(bg.angle)}deg,${bg.from},${bg.to});`, extra: '' };
  const url = opts.assetUrl(bg.assetId);
  if (!url) {
    missing.add(bg.assetId);
    return { css: 'background:#333;', extra: '' };
  }
  const tint = bg.tint ? `<div class="ff-bg" style="background:${bg.tint}"></div>` : '';
  return {
    css: 'background:#000;',
    extra: `<div class="ff-bg" style="background-image:url('${safeUrl(url)}');background-size:${bg.fit}"></div>${tint}`,
  };
}

function sceneHtml(scene: Scene, W: number, H: number, opts: CompileOptions, missing: Set<string>, warnings: string[]): string {
  const bg = backgroundHtml(scene, opts, missing);
  let body = '';
  if (scene.mode === 'html') {
    const clean = sanitizeHtmlFragment(scene.html);
    for (const w of clean.warnings) warnings.push(`${scene.name}: ${w}`);
    const resolved = resolveAssetRefs(clean.html, opts.assetUrl, missing);
    body =
      `<div class="ff-html-host"><template shadowrootmode="open">` +
      `<style>:host{display:block;position:absolute;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;font-family:${FONT_STACKS.sans}}</style>` +
      `${resolved}</template></div>`;
  } else {
    body = scene.elements.map((el) => elementHtml(el, scene, W, H, opts, missing)).join('');
  }
  return `<section class="ff-scene" data-scene="${esc(scene.id)}" style="${bg.css}">${bg.extra}${body}</section>`;
}

export function randomNonce(): string {
  const b = new Uint8Array(12);
  globalThis.crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/[^A-Za-z0-9]/g, 'x');
}

/**
 * Compiles a project into one self-contained HTML document. Used by both the editor preview
 * (sandboxed iframe) and the renderer (restricted Chromium page) so what you preview is what is exported.
 */
export function compileProjectHtml(project: Project, opts: CompileOptions): CompileResult {
  const { width: W, height: H } = project.canvas;
  const timeline = computeTimeline(project);
  const nonce = opts.nonce ?? randomNonce();
  const missing = new Set<string>();
  const warnings: string[] = [];
  const sections = project.scenes.map((s) => sceneHtml(s, W, H, opts, missing, warnings)).join('\n');

  const cap = project.captions;
  const capPos = cap.position === 'top' ? 'top:6%' : cap.position === 'center' ? 'top:50%;transform:translateY(-50%)' : 'bottom:7%';
  const captionsHtml = `<div id="ff-captions" style="display:none;position:absolute;left:8%;right:8%;${capPos};text-align:center;font:600 ${num((cap.fontSize / 100) * Math.min(W, H))}px/1.25 ${FONT_STACKS[project.brand.fontFamily]};color:${cap.color};z-index:9999"></div>`;

  const data = {
    totalMs: timeline.totalMs,
    scenes: timeline.scenes.map((t) => ({
      start: t.startMs,
      end: t.endMs,
      overlap: t.overlapMs,
      transition: project.scenes[t.index]?.transition.type ?? 'none',
    })),
    captions: cap.enabled ? cap.items.map((c) => ({ start: c.startMs, end: c.endMs, text: c.text })) : [],
  };

  const csp = `default-src 'none'; img-src ${opts.imgSrc}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src 'none'; media-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${esc(csp)}">
<style>
html,body{margin:0;padding:0;background:#000;overflow:hidden}
#ff-stage{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:#000}
.ff-scene{position:absolute;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;display:none}
.ff-bg{position:absolute;left:0;top:0;width:100%;height:100%;background-position:center;background-repeat:no-repeat}
.ff-el{position:absolute;box-sizing:border-box}
.ff-anim{width:100%;height:100%;box-sizing:border-box}
.ff-html-host{position:absolute;left:0;top:0;width:100%;height:100%}
${keyframesCss(W, H)}
</style></head>
<body><div id="ff-stage">
${sections}
${captionsHtml}
</div>
<script type="application/json" id="ff-data">${jsonForScript(data)}</script>
<script nonce="${nonce}">${RUNTIME_SOURCE}</script>
</body></html>`;
  return { html, warnings, missingAssets: [...missing], timeline };
}
