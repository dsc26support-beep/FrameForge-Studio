import { describe, expect, it } from 'vitest';
import { angleFromPoints, moveByPixels, normalizeAngle, scaleFromPoints, snapAngle, snapAxis } from '@frameforge/editor-core';

describe('direct-manipulation geometry', () => {
  it('normalises angles into (-180, 180]', () => {
    expect(normalizeAngle(190)).toBe(-170);
    expect(normalizeAngle(-190)).toBe(170);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(-180)).toBe(180);
    expect(normalizeAngle(725)).toBe(5);
  });

  it('computes the rotate-handle angle (0 = straight up)', () => {
    const c = { x: 100, y: 100 };
    expect(Math.round(angleFromPoints(c, { x: 100, y: 0 }))).toBe(0);
    expect(Math.round(angleFromPoints(c, { x: 200, y: 100 }))).toBe(90);
    expect(Math.round(angleFromPoints(c, { x: 100, y: 200 }))).toBe(180);
    expect(Math.round(angleFromPoints(c, { x: 0, y: 100 }))).toBe(-90);
  });

  it('snaps angles softly near 45 degree steps and hard with force', () => {
    expect(snapAngle(88)).toBe(90);
    expect(snapAngle(80)).toBe(80);
    expect(snapAngle(52, { force: true })).toBe(45);
    expect(snapAngle(-178, { force: true })).toBe(180);
  });

  it('scales proportionally to pointer distance and clamps', () => {
    const c = { x: 0, y: 0 };
    expect(scaleFromPoints(c, { x: 100, y: 0 }, { x: 200, y: 0 }, 1)).toBe(2);
    expect(scaleFromPoints(c, { x: 100, y: 0 }, { x: 50, y: 0 }, 2)).toBe(1);
    expect(scaleFromPoints(c, { x: 100, y: 0 }, { x: 100000, y: 0 }, 1)).toBe(5);
    expect(scaleFromPoints(c, { x: 100, y: 0 }, { x: 0.1, y: 0 }, 1)).toBe(0.1);
    expect(scaleFromPoints(c, { x: 0, y: 0 }, { x: 50, y: 0 }, 1.5)).toBe(1.5); // degenerate start keeps the scale
  });

  it('snaps to the canvas centre and edges, and reports a guide', () => {
    expect(snapAxis(50.8, 10)).toEqual({ value: 50, guide: 50 });
    expect(snapAxis(10.6, 10)).toEqual({ value: 10, guide: 0 }); // left edge to canvas edge
    expect(snapAxis(89.4, 10)).toEqual({ value: 90, guide: 100 });
    expect(snapAxis(30, 10)).toEqual({ value: 30, guide: null });
  });

  it('moves by pixels and clamps', () => {
    expect(moveByPixels(50, 128, 1280)).toBe(60);
    expect(moveByPixels(50, 1e9, 1280)).toBe(150);
    expect(moveByPixels(50, -1e9, 1280)).toBe(-50);
  });
});
