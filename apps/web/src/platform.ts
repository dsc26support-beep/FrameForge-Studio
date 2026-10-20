import { useEffect, useMemo, useState } from 'react';
import { classifyDevice, type BridgeCapabilities, type DeviceProfile } from '@frameforge/render-core';

export function getBridge() {
  return typeof window !== 'undefined' ? window.frameforge : undefined;
}

export function useDeviceProfile(override: 'auto' | 'on' | 'off'): { profile: DeviceProfile; renderer: BridgeCapabilities | null } {
  const [renderer, setRenderer] = useState<BridgeCapabilities | null>(null);
  const [width, setWidth] = useState(typeof window === 'undefined' ? 1200 : window.innerWidth);
  useEffect(() => {
    let alive = true;
    getBridge()
      ?.capabilities()
      .then((c) => alive && setRenderer(c))
      .catch(() => undefined);
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => {
      alive = false;
      window.removeEventListener('resize', onResize);
    };
  }, []);
  const profile = useMemo(() => {
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    const base = classifyDevice({
      cores: nav.hardwareConcurrency,
      memoryGB: nav.deviceMemory,
      coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
      screenWidth: width,
      hasDesktopRenderer: Boolean(renderer?.canRender),
      saveData: nav.connection?.saveData,
    });
    if (override === 'on') return { ...base, lowResourceMode: true, previewScale: Math.min(base.previewScale, 0.5) };
    if (override === 'off') return { ...base, lowResourceMode: false };
    return base;
  }, [renderer, width, override]);
  return { profile, renderer };
}
