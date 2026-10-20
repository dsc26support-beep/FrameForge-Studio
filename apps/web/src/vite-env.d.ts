/// <reference types="vite/client" />
import type { FrameForgeBridge } from '@frameforge/render-core';

declare global {
  interface Window {
    frameforge?: FrameForgeBridge;
  }
}
