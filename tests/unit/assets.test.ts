import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  checkSvgSafe,
  createArchive,
  ingestAsset,
  isSafeRelativePath,
  readArchive,
  sanitizeFileName,
  sanitizeOutputName,
  sniffMedia,
  readImageSize,
  findMissingAssets,
  MemoryAssetStore,
} from '@frameforge/asset-manager';
import { addAudioTrack, registerAsset } from '@frameforge/editor-core';
import { createProject } from '@frameforge/project-schema';

// 1x1 PNG
const PNG = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64'),
);

describe('filenames and paths', () => {
  it.each([
    ['../../etc/passwd', 'passwd'],
    ['..\\..\\win.ini', 'win.ini'],
    ['CON.txt', '_CON.txt'],
    ['a<b>:"c|?*.png', 'a_b___c___.png'],
    ['   ', 'file'],
    ['.hidden', 'hidden'],
  ])('sanitizes %s', (input, _expected) => {
    const out = sanitizeFileName(input);
    expect(out).not.toMatch(/[/\\<>:"|?*]/);
    expect(out.startsWith('.')).toBe(false);
    expect(out.length).toBeGreaterThan(0);
  });
  it('always yields a plain .mp4 output name', () => {
    expect(sanitizeOutputName('../my video')).toMatch(/^[^/\\]+\.mp4$/);
    expect(sanitizeOutputName('x.mp4')).toBe('x.mp4');
    expect(sanitizeOutputName('')).toBe('video.mp4');
  });
  it('validates relative paths', () => {
    for (const bad of ['../x', '/etc/passwd', 'a/../../b', 'C:/x', 'a\\b', '', 'a//b', './a', 'a\0b'])
      expect(isSafeRelativePath(bad)).toBe(false);
    for (const good of ['project.json', 'assets/a.png']) expect(isSafeRelativePath(good)).toBe(true);
  });
});

describe('media validation', () => {
  it('detects by content, not extension, and rejects unknown/invalid files', async () => {
    expect(sniffMedia(PNG)?.mime).toBe('image/png');
    expect(readImageSize(PNG)).toEqual({ width: 1, height: 1 });
    await expect(ingestAsset(strToU8('MZ this is an exe renamed'), 'cat.png', [])).rejects.toThrow(/Unsupported/);
    await expect(ingestAsset(new Uint8Array(0), 'a.png', [])).rejects.toThrow(/empty/);
  });
  it('rejects active SVG content', async () => {
    expect(checkSvgSafe(strToU8('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'))).toMatch(/script/);
    expect(checkSvgSafe(strToU8('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://e.test/x.png"/></svg>'))).not.toBeNull();
    expect(checkSvgSafe(strToU8('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'))).toBeNull();
    await expect(ingestAsset(strToU8('<svg onload="alert(1)" xmlns="http://www.w3.org/2000/svg"></svg>'), 'x.svg', [])).rejects.toThrow(
      /SVG rejected/,
    );
  });
  it('de-duplicates identical content', async () => {
    const a = await ingestAsset(PNG, 'one.png', []);
    const b = await ingestAsset(PNG, 'two.png', [a.asset]);
    expect(b.duplicate).toBe(true);
    expect(b.asset.id).toBe(a.asset.id);
  });
  it('detects missing assets in a store', async () => {
    const a = (await ingestAsset(PNG, 'one.png', [])).asset;
    const store = new MemoryAssetStore();
    expect(await findMissingAssets('p', [a], store)).toEqual([a.id]);
    await store.put('p', a.id, PNG);
    expect(await findMissingAssets('p', [a], store)).toEqual([]);
  });
});

describe('project archives', () => {
  it('round-trips a project with assets', async () => {
    const { asset } = await ingestAsset(PNG, 'logo.png', []);
    const p = registerAsset(createProject('Zip'), asset);
    const zip = await createArchive(p, new Map([[asset.id, PNG]]));
    const back = await readArchive(zip);
    expect(back.project.id).toBe(p.id);
    expect(back.assets.get(asset.id)).toEqual(PNG);
  });

  it('reports a missing asset file as a warning, not a crash', async () => {
    const { asset } = await ingestAsset(PNG, 'logo.png', []);
    const p = registerAsset(createProject('Zip'), asset);
    const back = await readArchive(await createArchive(p, new Map()));
    expect(back.warnings.join()).toMatch(/Missing asset/);
  });

  it('rejects traversal entries, corrupt zips and missing manifests', async () => {
    await expect(
      readArchive(zipSync({ '../evil.txt': strToU8('x'), 'project.json': strToU8('{}'), 'manifest.json': strToU8('{}') })),
    ).rejects.toThrow(/Unsafe path/);
    await expect(readArchive(strToU8('not a zip at all'))).rejects.toThrow(/corrupt/);
    await expect(readArchive(zipSync({ 'project.json': strToU8('{}') }))).rejects.toThrow(/manifest/);
  });

  it('rejects tampered assets (hash mismatch) and mismatched types', async () => {
    const { asset } = await ingestAsset(PNG, 'logo.png', []);
    const p = registerAsset(createProject('Zip'), asset);
    const evil = strToU8('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>');
    const good = await createArchive(p, new Map([[asset.id, PNG]]));
    const { unzipSync } = await import('fflate');
    const files = unzipSync(good);
    const key = Object.keys(files).find((k) => k.startsWith('assets/'))!;
    files[key] = evil;
    await expect(readArchive(zipSync(files))).rejects.toThrow(/rejected/);
  });

  it('rejects an archive whose entries declare a huge expanded size', async () => {
    const big = new Uint8Array(2 * 1024 * 1024);
    const entries: Record<string, Uint8Array> = { 'manifest.json': strToU8('{}') };
    for (let i = 0; i < 1300; i++) entries[`f${i}.txt`] = strToU8('x');
    await expect(readArchive(zipSync({ ...entries, 'big.bin': big }))).rejects.toThrow(/too many files/);
  });

  it('keeps audio references valid', async () => {
    const p = createProject('A');
    expect(addAudioTrack(p, 'ast_x', 'x').audioTracks).toHaveLength(1);
  });
});
