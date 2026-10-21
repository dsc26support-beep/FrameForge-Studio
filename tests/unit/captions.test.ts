import { describe, expect, it } from 'vitest';
import {
  addCaption,
  captionWarnings,
  formatSrt,
  parseSrt,
  removeCaption,
  replaceCaptions,
  setCaptionStyle,
  updateCaption,
} from '@frameforge/editor-core';
import { createProject, validateProject } from '@frameforge/project-schema';

describe('caption operations', () => {
  it('adds captions in time order, enables captions and stays valid', () => {
    let p = createProject('C');
    p = addCaption(p, 3000, 4000, 'second');
    p = addCaption(p, 500, 1500, 'first');
    expect(p.captions.enabled).toBe(true);
    expect(p.captions.items.map((c) => c.text)).toEqual(['first', 'second']);
    expect(validateProject(p).ok).toBe(true);
  });

  it('never lets a caption end before it starts', () => {
    let p = addCaption(createProject('C'), 1000, 2000, 'x');
    const id = p.captions.items[0]!.id;
    p = updateCaption(p, id, { endMs: 500 });
    const c = p.captions.items[0]!;
    expect(c.endMs).toBeGreaterThan(c.startMs);
    p = updateCaption(p, id, { startMs: -50 });
    expect(p.captions.items[0]!.startMs).toBe(0);
    expect(validateProject(p).ok).toBe(true);
  });

  it('caps caption text length and removes captions', () => {
    let p = addCaption(createProject('C'), 0, 1000, 'y'.repeat(900));
    expect(p.captions.items[0]!.text).toHaveLength(500);
    p = removeCaption(p, p.captions.items[0]!.id);
    expect(p.captions.items).toHaveLength(0);
    expect(setCaptionStyle(p, { position: 'top' }).captions.position).toBe('top');
  });

  it('warns about captions the viewer will not see', () => {
    let p = addCaption(createProject('C'), 9000, 9500, 'late');
    p = addCaption(p, 100, 2000, 'a');
    p = addCaption(p, 1500, 2500, 'b');
    const w = captionWarnings(p, 3000).join(' ');
    expect(w).toMatch(/after the video ends/);
    expect(w).toMatch(/overlap/);
    expect(captionWarnings(setCaptionStyle(p, { enabled: false }), 3000).join(' ')).toMatch(/switched off/);
  });
});

describe('SRT import/export', () => {
  const srt =
    '﻿1\r\n00:00:01,000 --> 00:00:02,500\r\nHello <i>world</i>\r\n\r\n2\r\n00:00:03.000 --> 00:00:04.000\r\nTwo\r\nlines\r\n\r\nnonsense block\r\n\r\n3\r\n00:00:05,000 --> 00:00:04,000\r\nbackwards\r\n';
  it('parses valid blocks, strips tags, skips invalid ones and never throws', () => {
    const { items, skipped } = parseSrt(srt);
    expect(items.map((i) => i.text)).toEqual(['Hello world', 'Two\nlines']);
    expect(items[0]).toMatchObject({ startMs: 1000, endMs: 2500 });
    expect(skipped).toBe(2);
    expect(parseSrt('').items).toEqual([]);
    expect(parseSrt('\u0000\u0001 binary garbage').items).toEqual([]);
  });
  it('round-trips through export', () => {
    const { items } = parseSrt(srt);
    const again = parseSrt(formatSrt(items)).items;
    expect(again.map((i) => [i.startMs, i.endMs, i.text])).toEqual(items.map((i) => [i.startMs, i.endMs, i.text]));
    expect(validateProject(replaceCaptions(createProject('S'), items)).ok).toBe(true);
  });
  it('caps the number of imported captions', () => {
    const many = Array.from({ length: 2500 }, (_, i) => `${i + 1}\n00:00:00,000 --> 00:00:01,000\nx`).join('\n\n');
    const { items, skipped } = parseSrt(many);
    expect(items.length).toBe(2000);
    expect(skipped).toBe(500);
  });
});
