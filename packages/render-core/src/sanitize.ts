import { parseFragment } from 'parse5';

/**
 * Allowlist sanitizer for the "direct HTML/CSS" scene mode.
 *
 * Security model: scripts and all external loading are removed here AND blocked again by the
 * Content-Security-Policy and request interception of the render page. This is defence in depth,
 * not a claim that arbitrary markup is safe: JavaScript in scenes is intentionally unsupported.
 */

export interface SanitizeResult {
  html: string;
  warnings: string[];
}

const HTML_TAGS = new Set(
  'div span p h1 h2 h3 h4 h5 h6 ul ol li strong em b i u s br hr img section article header footer main figure figcaption small sub sup mark blockquote code pre table thead tbody tfoot tr td th caption span style'.split(
    ' ',
  ),
);
const SVG_TAGS = new Set(
  'svg g path circle ellipse rect line polyline polygon text tspan defs lineargradient radialgradient stop clippath title desc'.split(' '),
);
const DROP_WITH_CONTENT = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'template',
  'noscript',
  'frame',
  'frameset',
  'applet',
  'link',
  'meta',
  'base',
  'form',
  'foreignobject',
  'audio',
  'video',
  'canvas',
  'animate',
  'animatetransform',
  'animatemotion',
  'set',
  'use',
  'image',
  'math',
]);

const GLOBAL_ATTRS = new Set(['class', 'id', 'style', 'title', 'role', 'lang', 'dir']);
const SVG_ATTRS = new Set(
  'viewbox d fill stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-opacity fill-opacity fill-rule clip-rule opacity cx cy r rx ry x y x1 y1 x2 y2 points transform offset stop-color stop-opacity gradientunits gradienttransform text-anchor font-size font-family font-weight preserveaspectratio xmlns width height dx dy clip-path letter-spacing dominant-baseline'.split(
    ' ',
  ),
);
const HTML_ATTRS: Record<string, Set<string>> = {
  img: new Set(['src', 'alt', 'width', 'height']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan']),
  ol: new Set(['start']),
};
const SAFE_TOKEN = /^[\w\- ]{0,200}$/;
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i;
const SAFE_ASSET_REF = /^asset:[A-Za-z0-9_-]{1,64}$/;

export function isSafeImageRef(value: string): boolean {
  return SAFE_ASSET_REF.test(value) || (value.length < 2_000_000 && SAFE_DATA_IMAGE.test(value));
}

function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s: string): string {
  return escText(s).replace(/"/g, '&quot;');
}

/** Removes constructs that can execute code or fetch resources from a CSS string. */
export function sanitizeCss(css: string, warnings: string[] = []): string {
  let out = css.replace(/\/\*[\s\S]*?\*\//g, '');
  if (/\\/.test(out)) {
    warnings.push('CSS escape sequences were removed.');
    out = out.replace(/\\/g, '');
  }
  out = out.replace(/</g, '');
  if (/@import/i.test(out)) warnings.push('@import is not supported and was removed.');
  out = out.replace(/@import[^;{]*;?/gi, '');
  if (/@font-face/i.test(out)) warnings.push('Custom @font-face is not supported; use the brand font families.');
  out = out.replace(/@font-face\s*\{[^}]*\}/gi, '');
  out = out.replace(/@(?:charset|namespace)[^;]*;/gi, '');
  out = out.replace(/(?:expression\s*\(|behavior\s*:|-moz-binding\s*:|javascript\s*:)[^;}]*/gi, () => {
    warnings.push('Unsafe CSS construct removed.');
    return '';
  });
  out = out.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gis, (_m, _q: string, arg: string) => {
    const v = arg.trim();
    if (isSafeImageRef(v)) return `url('${v}')`;
    if (/^#[\w-]+$/.test(v)) return `url('${v}')`;
    warnings.push('External or unsupported url() reference removed from CSS.');
    return 'none';
  });
  return out.trim();
}

type Node = {
  nodeName: string;
  tagName?: string;
  value?: string;
  childNodes?: Node[];
  attrs?: { name: string; value: string }[];
  namespaceURI?: string;
};

export function sanitizeHtmlFragment(input: string): SanitizeResult {
  const warnings: string[] = [];
  const warn = (m: string) => {
    if (!warnings.includes(m)) warnings.push(m);
  };
  const root = parseFragment(input) as unknown as Node;

  const walk = (node: Node): string => {
    if (node.nodeName === '#text') return escText(node.value ?? '');
    if (node.nodeName === '#comment') return '';
    if (!node.tagName) return (node.childNodes ?? []).map(walk).join('');
    const tag = node.tagName.toLowerCase();
    if (DROP_WITH_CONTENT.has(tag)) {
      warn(`<${tag}> is not supported and was removed.`);
      return '';
    }
    const isSvg = node.namespaceURI === 'http://www.w3.org/2000/svg';
    const allowed = isSvg ? SVG_TAGS.has(tag) : HTML_TAGS.has(tag);
    if (!allowed) {
      warn(`<${tag}> is not supported; its content was kept as plain markup.`);
      return (node.childNodes ?? []).map(walk).join('');
    }
    if (tag === 'style') {
      const css = (node.childNodes ?? []).map((c) => c.value ?? '').join('');
      return `<style>${sanitizeCss(css, warnings)}</style>`;
    }
    let attrs = '';
    for (const { name: rawName, value } of node.attrs ?? []) {
      const name = rawName.toLowerCase();
      if (name.startsWith('on')) {
        warn('Event handler attributes were removed.');
        continue;
      }
      if (name === 'style') {
        const s = sanitizeCss(value, warnings);
        if (s) attrs += ` style="${escAttr(s)}"`;
        continue;
      }
      if (name === 'class' || name === 'id') {
        if (SAFE_TOKEN.test(value)) attrs += ` ${name}="${escAttr(value)}"`;
        continue;
      }
      if (tag === 'img' && name === 'src') {
        if (isSafeImageRef(value)) attrs += ` src="${escAttr(value)}"`;
        else warn('Only project assets (asset:<id>) and small data:image URIs are allowed in <img src>.');
        continue;
      }
      if (/^aria-[\w-]+$/.test(name) || (GLOBAL_ATTRS.has(name) && name !== 'class' && name !== 'id')) {
        attrs += ` ${name}="${escAttr(value)}"`;
        continue;
      }
      const okSvg = isSvg && SVG_ATTRS.has(name);
      const okHtml = HTML_ATTRS[tag]?.has(name) === true;
      if (okSvg || okHtml) {
        if (name === 'clip-path' && !/^url\(#[\w-]+\)$/.test(value.trim())) continue;
        if (/^\s*(?:javascript|data|vbscript)\s*:/i.test(value)) continue;
        attrs += ` ${rawName}="${escAttr(value)}"`;
        continue;
      }
      warn(`Attribute "${name}" is not supported and was removed.`);
    }
    const children = (node.childNodes ?? []).map(walk).join('');
    if (tag === 'br' || tag === 'hr' || tag === 'img') return `<${tag}${attrs}>`;
    return `<${tag}${attrs}>${children}</${tag}>`;
  };

  return { html: walk(root), warnings };
}

/** Replaces `asset:<id>` references using the supplied resolver; unknown assets are removed. */
export function resolveAssetRefs(html: string, resolve: (assetId: string) => string | null, missing: Set<string>): string {
  return html.replace(/(src|url\()(=?["']?)asset:([A-Za-z0-9_-]{1,64})/g, (m, kind: string, q: string, id: string) => {
    const url = resolve(id);
    if (!url) {
      missing.add(id);
      return `${kind}${q}about:blank#missing-${id}`;
    }
    return `${kind}${q}${url}`;
  });
}
