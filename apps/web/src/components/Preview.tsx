import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '@frameforge/project-schema';
import { compileProjectHtml } from '@frameforge/render-core';

interface Props {
  project: Project;
  assetUrls: ReadonlyMap<string, string>;
  timeMs: number;
  /** 0.25 - 1: lower values trade sharpness for CPU on low-power devices. */
  quality: number;
  onWarnings?: (w: string[]) => void;
}

/** Sandboxed preview. The compiled document runs without same-origin access and can only talk via postMessage. */
export function Preview({ project, assetUrls, timeMs, quality, onWarnings }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(640);
  const [debounced, setDebounced] = useState(project);
  const timeRef = useRef(timeMs);
  useEffect(() => {
    timeRef.current = timeMs;
  });

  // Debounce recompiles while typing/dragging sliders.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(project), 120);
    return () => clearTimeout(t);
  }, [project]);

  const compiled = useMemo(
    () => compileProjectHtml(debounced, { assetUrl: (id) => assetUrls.get(id) ?? null, imgSrc: 'blob: data:' }),
    [debounced, assetUrls],
  );

  useEffect(() => {
    onWarnings?.([...compiled.warnings, ...compiled.missingAssets.map((id) => `Missing media file (${id})`)]);
  }, [compiled, onWarnings]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => e && setBoxWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source === frameRef.current?.contentWindow && (e.data as { type?: string })?.type === 'ff-ready') {
        frameRef.current?.contentWindow?.postMessage({ type: 'ff-seek', t: timeRef.current }, '*');
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage({ type: 'ff-seek', t: timeMs }, '*');
  }, [timeMs]);

  const { width: W, height: H } = project.canvas;
  const scale = boxWidth / W;
  return (
    <div ref={boxRef} className="preview-box" style={{ aspectRatio: `${W} / ${H}`, maxWidth: `min(100%, calc(52dvh * ${W / H}))` }}>
      <iframe
        ref={frameRef}
        title="Video preview"
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={compiled.html}
        width={W}
        height={H}
        style={{ width: W, height: H, transform: `scale(${scale})`, imageRendering: quality < 0.6 ? 'pixelated' : 'auto' }}
        tabIndex={-1}
      />
    </div>
  );
}
