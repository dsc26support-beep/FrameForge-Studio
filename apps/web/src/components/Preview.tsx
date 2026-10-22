import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Project } from '@frameforge/project-schema';
import { compileProjectHtml } from '@frameforge/render-core';

interface Props {
  project: Project;
  assetUrls: ReadonlyMap<string, string>;
  timeMs: number;
  /** 0.25 - 1: lower values trade sharpness for CPU on low-power devices. */
  quality: number;
  onWarnings?: (w: string[]) => void;
  /** Rendered above the preview, sharing its size. Receives the preview scale and measured element sizes. */
  overlay?: (info: { scale: number; rects: Readonly<Record<string, [number, number]>> }) => ReactNode;
}

interface Doc {
  id: number;
  html: string;
  ready: boolean;
}

type Rects = Record<string, [number, number]>;

/**
 * Sandboxed preview. Each compiled document runs without same-origin access and can only talk via postMessage.
 * Edits are double-buffered: the new document loads hidden and replaces the old one only once it is ready,
 * so dragging or typing never flashes a blank preview.
 */
export function Preview({ project, assetUrls, timeMs, quality, onWarnings, overlay }: Props) {
  const nextId = useRef(2);
  const frames = useRef(new Map<number, HTMLIFrameElement>());
  const boxRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef(timeMs);
  const warningsRef = useRef(onWarnings);
  const [boxWidth, setBoxWidth] = useState(640);
  const [rects, setRects] = useState<Rects>({});
  const compile = useCallback(
    (p: Project, urls: ReadonlyMap<string, string>) =>
      compileProjectHtml(p, { assetUrl: (id) => urls.get(id) ?? null, imgSrc: 'blob: data:' }),
    [],
  );
  const [docs, setDocs] = useState<Doc[]>(() => [{ id: 1, html: compile(project, assetUrls).html, ready: false }]);

  useEffect(() => {
    timeRef.current = timeMs;
    warningsRef.current = onWarnings;
  });

  // Recompile shortly after edits settle (debounced) and queue the result as a hidden document.
  useEffect(() => {
    const t = setTimeout(() => {
      const out = compile(project, assetUrls);
      warningsRef.current?.([...out.warnings, ...out.missingAssets.map((id) => `Missing media file (${id})`)]);
      const id = nextId.current++;
      setDocs((prev) => {
        if (prev.some((d) => d.html === out.html && d.id === prev.at(-1)?.id)) return prev;
        const lastReady = [...prev].reverse().find((d) => d.ready);
        return [...(lastReady ? [lastReady] : []), { id, html: out.html, ready: false }];
      });
    }, 90);
    return () => clearTimeout(t);
  }, [project, assetUrls, compile]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => e && setBoxWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const entry = [...frames.current.entries()].find(([, f]) => f.contentWindow === e.source);
      if (!entry) return;
      const [docId, frame] = entry;
      const data = e.data as { type?: string; rects?: Rects };
      if (data?.type === 'ff-ready') {
        frame.contentWindow?.postMessage({ type: 'ff-seek', t: timeRef.current }, '*');
        frame.contentWindow?.postMessage({ type: 'ff-measure' }, '*');
        // Show this document and drop every older one.
        setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, ready: true } : d)).filter((d) => d.id >= docId));
      } else if (data?.type === 'ff-rects' && data.rects && typeof data.rects === 'object') {
        // Only accept well-formed [width, height] number pairs from the sandboxed page.
        const clean: Rects = {};
        for (const [id, v] of Object.entries(data.rects)) {
          if (Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number' && Number.isFinite(v[0]) && Number.isFinite(v[1]))
            clean[id] = [v[0], v[1]];
        }
        setRects(clean);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => {
    for (const f of frames.current.values()) f.contentWindow?.postMessage({ type: 'ff-seek', t: timeMs }, '*');
  }, [timeMs]);

  const { width: W, height: H } = project.canvas;
  const scale = boxWidth / W;
  return (
    <div className="preview-wrap" style={{ aspectRatio: `${W} / ${H}`, maxWidth: `min(100%, calc(52dvh * ${W / H}))` }}>
      <div ref={boxRef} className="preview-box">
        {docs.map((d) => (
          <iframe
            key={d.id}
            ref={(el) => {
              if (el) frames.current.set(d.id, el);
              else frames.current.delete(d.id);
            }}
            title={d.ready ? 'Video preview' : 'Video preview (loading)'}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            srcDoc={d.html}
            width={W}
            height={H}
            style={{
              width: W,
              height: H,
              transform: `scale(${scale})`,
              visibility: d.ready ? 'visible' : 'hidden',
              imageRendering: quality < 0.6 ? 'pixelated' : 'auto',
            }}
            tabIndex={-1}
          />
        ))}
      </div>
      {overlay?.({ scale, rects })}
    </div>
  );
}
