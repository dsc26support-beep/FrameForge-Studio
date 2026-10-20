import { canvasFor, newId, projectSchema, type Project } from '@frameforge/project-schema';

export interface Template {
  id: string;
  name: string;
  description: string;
  aspect: '16:9' | '9:16' | '1:1';
  build(): Project;
}

type Raw = Record<string, unknown>;
const anim = (preset: string, delayMs = 0, durationMs = 700, extra: Raw = {}): Raw => ({
  preset,
  delayMs,
  durationMs,
  easing: 'easeOut',
  ...extra,
});
const text = (t: string, o: Raw = {}): Raw => ({ id: newId('el'), type: 'text', text: t, ...o });
const shape = (o: Raw = {}): Raw => ({ id: newId('el'), type: 'shape', ...o });
const scene = (name: string, durationMs: number, background: Raw, elements: Raw[], extra: Raw = {}): Raw => ({
  id: newId('scn'),
  name,
  durationMs,
  background,
  elements,
  ...extra,
});
const grad = (from: string, to: string, angle = 135): Raw => ({ type: 'gradient', from, to, angle });

function make(name: string, aspect: Template['aspect'], scenes: Raw[], brand: Raw = {}): Project {
  const now = new Date().toISOString();
  return projectSchema.parse({
    schemaVersion: 1,
    id: newId('prj'),
    name,
    createdAt: now,
    updatedAt: now,
    canvas: canvasFor('720p', aspect),
    exportSettings: { aspect },
    brand,
    scenes,
  });
}

export const TEMPLATES: Template[] = [
  {
    id: 'animated-title',
    name: 'Animated title',
    description: 'A clean headline with a subtitle and accent line.',
    aspect: '16:9',
    build: () =>
      make('Animated title', '16:9', [
        scene('Title', 4000, grad('#0f172a', '#312e81'), [
          shape({ x: 50, y: 62, w: 18, h: 0.8, fill: '#f59e0b', animation: anim('reveal', 700, 700) }),
          text('Your Big Idea', { y: 46, fontSize: 10, animation: anim('slideUp', 100, 800) }),
          text('A subtitle that explains it', {
            y: 72,
            fontSize: 4,
            fontWeight: 400,
            color: '#cbd5e1',
            animation: anim('fadeIn', 1000, 700),
          }),
        ]),
      ]),
  },
  {
    id: 'kinetic-typography',
    name: 'Kinetic typography',
    description: 'Fast, punchy words that pop in sequence.',
    aspect: '16:9',
    build: () =>
      make('Kinetic typography', '16:9', [
        scene('Move', 1200, { type: 'color', color: '#111827' }, [
          text('MOVE', {
            fontSize: 22,
            fontFamily: 'display',
            color: '#facc15',
            animation: anim('pop', 0, 500, { easing: 'overshoot', exit: 'fadeOut', exitMs: 200 }),
          }),
        ]),
        scene(
          'Fast',
          1200,
          { type: 'color', color: '#be123c' },
          [text('FAST', { fontSize: 22, fontFamily: 'display', animation: anim('slideLeft', 0, 400) })],
          { transition: { type: 'slideLeft', durationMs: 300 } },
        ),
        scene(
          'Think',
          1600,
          { type: 'color', color: '#0ea5e9' },
          [
            text('THINK', { fontSize: 20, fontFamily: 'display', color: '#082f49', animation: anim('zoomIn', 0, 500) }),
            text('different', { y: 72, fontSize: 6, fontFamily: 'serif', animation: anim('fadeIn', 500, 500) }),
          ],
          { transition: { type: 'wipe', durationMs: 300 } },
        ),
      ]),
  },
  {
    id: 'youtube-intro',
    name: 'YouTube intro',
    description: 'A short channel intro with logo mark and tagline.',
    aspect: '16:9',
    build: () =>
      make('YouTube intro', '16:9', [
        scene('Logo', 2500, grad('#020617', '#1e1b4b', 160), [
          shape({ shape: 'ellipse', x: 50, y: 40, w: 14, h: 25, fill: '#ef4444', animation: anim('pop', 0, 700, { easing: 'overshoot' }) }),
          shape({ shape: 'ellipse', x: 50, y: 40, w: 7, h: 12.5, fill: '#ffffff', animation: anim('zoomIn', 400, 500) }),
          text('Channel Name', { y: 68, fontSize: 8, animation: anim('slideUp', 700, 600) }),
        ]),
        scene(
          'Tagline',
          2000,
          { type: 'color', color: '#ef4444' },
          [text('Subscribe for more', { fontSize: 7, animation: anim('reveal', 0, 700) })],
          { transition: { type: 'wipe', durationMs: 400 } },
        ),
      ]),
  },
  {
    id: 'explainer',
    name: 'Explainer scene',
    description: 'Problem, solution and result in three beats.',
    aspect: '16:9',
    build: () =>
      make('Explainer', '16:9', [
        scene('Problem', 3500, { type: 'color', color: '#1f2937' }, [
          text('The problem', { y: 22, fontSize: 5, color: '#fca5a5', fontWeight: 600, animation: anim('fadeIn', 0, 500) }),
          text('Work is slow and scattered', { y: 48, w: 70, fontSize: 8, animation: anim('slideUp', 300, 700) }),
        ]),
        scene(
          'Solution',
          3500,
          grad('#064e3b', '#0f766e'),
          [
            text('The solution', { y: 22, fontSize: 5, color: '#a7f3d0', fontWeight: 600, animation: anim('fadeIn', 0, 500) }),
            shape({ x: 50, y: 58, w: 50, h: 22, fill: '#ffffff22', radius: 8, animation: anim('zoomIn', 200, 600) }),
            text('One place for everything', { y: 58, w: 46, fontSize: 6, animation: anim('fadeIn', 700, 600) }),
          ],
          { transition: { type: 'slideLeft', durationMs: 500 } },
        ),
        scene(
          'Result',
          3000,
          grad('#312e81', '#7c3aed'),
          [text('Done in half the time', { fontSize: 9, w: 70, animation: anim('pop', 100, 700, { easing: 'overshoot' }) })],
          { transition: { type: 'fade', durationMs: 500 } },
        ),
      ]),
  },
  {
    id: 'product-promo',
    name: 'Product promotion',
    description: 'Product name, price badge and call to action.',
    aspect: '1:1',
    build: () =>
      make('Product promo', '1:1', [
        scene('Hero', 3000, grad('#fff7ed', '#fed7aa', 160), [
          text('NEW', { y: 18, fontSize: 5, color: '#c2410c', animation: anim('fadeIn', 0, 400) }),
          text('Aurora Lamp', { y: 40, fontSize: 11, color: '#431407', fontFamily: 'serif', animation: anim('slideUp', 200, 700) }),
          shape({
            shape: 'ellipse',
            x: 50,
            y: 70,
            w: 24,
            h: 24,
            fill: '#ea580c',
            animation: anim('pop', 700, 600, { easing: 'overshoot' }),
          }),
          text('$49', { y: 70, fontSize: 9, animation: anim('zoomIn', 900, 500) }),
        ]),
        scene(
          'CTA',
          2000,
          { type: 'color', color: '#431407' },
          [
            text('Shop now', { fontSize: 10, animation: anim('pop', 0, 600) }),
            text('example.com', { y: 66, fontSize: 4, fontWeight: 400, color: '#fdba74', animation: anim('fadeIn', 500, 500) }),
          ],
          { transition: { type: 'fade', durationMs: 400 } },
        ),
      ]),
  },
  {
    id: 'social-vertical',
    name: 'Social vertical video',
    description: '9:16 story/reel layout with captions-ready spacing.',
    aspect: '9:16',
    build: () =>
      make('Social vertical', '9:16', [
        scene('Hook', 2500, grad('#4c1d95', '#db2777', 160), [
          text('3 tips to\nsave time', { y: 38, w: 80, fontSize: 9, animation: anim('pop', 0, 600, { easing: 'overshoot' }) }),
          shape({ x: 50, y: 62, w: 30, h: 1, fill: '#ffffff', animation: anim('reveal', 600, 600) }),
        ]),
        scene(
          'Tip 1',
          3000,
          { type: 'color', color: '#0f172a' },
          [
            text('1', { y: 24, fontSize: 24, fontFamily: 'display', color: '#f472b6', animation: anim('zoomIn', 0, 500) }),
            text('Plan the night before', { y: 55, w: 80, fontSize: 7, animation: anim('slideUp', 300, 600) }),
          ],
          { transition: { type: 'slideUp', durationMs: 400 } },
        ),
        scene(
          'Outro',
          2200,
          grad('#db2777', '#4c1d95', 20),
          [text('Follow for more', { fontSize: 8, w: 80, animation: anim('fadeIn', 0, 600) })],
          { transition: { type: 'fade', durationMs: 400 } },
        ),
      ]),
  },
  {
    id: 'quote',
    name: 'Quote video',
    description: 'An elegant quote with attribution.',
    aspect: '16:9',
    build: () =>
      make('Quote', '16:9', [
        scene('Quote', 6000, grad('#1c1917', '#44403c', 180), [
          text('“', { x: 18, y: 28, fontSize: 30, fontFamily: 'serif', color: '#d6a35c', animation: anim('fadeIn', 0, 800) }),
          text('Design is not just what it looks like. Design is how it works.', {
            y: 48,
            w: 66,
            fontSize: 6.5,
            fontFamily: 'serif',
            fontWeight: 400,
            lineHeight: 1.35,
            animation: anim('fadeIn', 400, 1200),
          }),
          text('— Someone Wise', { y: 76, fontSize: 3.6, fontWeight: 400, color: '#d6a35c', animation: anim('slideUp', 1800, 700) }),
        ]),
      ]),
  },
  {
    id: 'data-viz',
    name: 'Simple data visualization',
    description: 'Animated bar chart built from shapes.',
    aspect: '16:9',
    build: () => {
      const data: [string, number, string][] = [
        ['Q1', 38, '#60a5fa'],
        ['Q2', 55, '#34d399'],
        ['Q3', 72, '#fbbf24'],
        ['Q4', 90, '#f472b6'],
      ];
      const els: Raw[] = [text('Revenue growth', { y: 12, fontSize: 6, animation: anim('fadeIn', 0, 500) })];
      data.forEach(([label, v, color], i) => {
        const x = 22 + i * 18.7;
        const h = v * 0.6;
        els.push(
          shape({
            x,
            y: 82 - h / 2,
            w: 12,
            h,
            fill: color,
            radius: 6,
            animation: anim('growUp', 300 + i * 250, 800, { easing: 'easeOut' }),
          }),
        );
        els.push(text(`${v}%`, { x, y: 82 - h - 5, fontSize: 4, animation: anim('fadeIn', 900 + i * 250, 400) }));
        els.push(
          text(label, { x, y: 90, fontSize: 3.6, fontWeight: 400, color: '#94a3b8', animation: anim('fadeIn', 300 + i * 250, 400) }),
        );
      });
      return make('Data visualization', '16:9', [scene('Chart', 5000, { type: 'color', color: '#0f172a' }, els)]);
    },
  },
];

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
