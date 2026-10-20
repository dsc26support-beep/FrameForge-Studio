import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';
import { RUNTIME_SOURCE } from '../../packages/render-core/src/runtime.ts';

/**
 * Injects the Content-Security-Policy. The preview iframe is a srcdoc document and therefore inherits
 * this policy, so the (trusted, constant) preview runtime script is allowed by hash and nothing else inline.
 */
function cspPlugin(): Plugin {
  const hash = createHash('sha256').update(RUNTIME_SOURCE).digest('base64');
  return {
    name: 'frameforge-csp',
    transformIndexHtml(html, ctx) {
      const dev = Boolean(ctx.server);
      const csp = [
        "default-src 'self'",
        `script-src 'self' 'sha256-${hash}'${dev ? " 'unsafe-inline'" : ''}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' blob: data:",
        "media-src 'self' blob:",
        "font-src 'self'",
        `connect-src 'self'${dev ? ' ws: http:' : ''}`,
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-src 'self' about:",
      ].join('; ');
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE ?? './',
  plugins: [react(), cspPlugin()],
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 600 },
  server: { host: '127.0.0.1' },
});
