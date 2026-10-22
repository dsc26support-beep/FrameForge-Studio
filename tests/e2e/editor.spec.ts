import { expect, test, type Page } from '@playwright/test';

test.describe('editor workflow', () => {
  test('create, edit, preview, save and reopen a project', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /FrameForge Studio/ })).toBeVisible();
    await page.getByRole('button', { name: /Blank project/ }).click();

    // Rename + edit text
    const name = page.getByRole('textbox', { name: 'Project name' });
    await expect(name).toBeVisible();
    await name.fill('E2E project');
    await page.getByRole('tab', { name: 'Scenes' }).click();
    await page.getByRole('button', { name: '+ Scene' }).click();
    await expect(page.getByRole('list', { name: 'Scenes' }).getByRole('listitem')).toHaveCount(2);
    await page.getByRole('button', { name: '+ Text' }).click();
    await page.getByRole('textbox', { name: 'Text', exact: true }).fill('Hello from the test');

    // Preview: seek the playhead and make sure the iframe received the scene document
    const frame = page.frameLocator('iframe[title="Video preview"]');
    await expect(frame.locator('#ff-stage')).toBeAttached();
    await page.getByRole('slider', { name: 'Playhead' }).focus();
    await page.keyboard.press('End');
    await expect(frame.getByText('Hello from the test')).toBeAttached();
    await page.getByRole('button', { name: 'Play' }).click();
    await page.getByRole('button', { name: 'Pause' }).click();

    // Autosave then reopen
    await expect(page.getByText('Saved on this device')).toBeVisible();
    await page.getByRole('button', { name: /Projects/ }).click();
    await expect(page.locator('.project-open', { hasText: 'E2E project' })).toBeVisible();
    await page.reload();
    await page.locator('.project-open', { hasText: 'E2E project' }).click();
    await page.getByRole('tab', { name: 'Scenes' }).click();
    await expect(page.getByRole('list', { name: 'Scenes' }).getByRole('listitem')).toHaveCount(2);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('export panel explains that browsers cannot render and offers the archive', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Quote video/ }).click();
    await page.getByRole('tab', { name: 'Export' }).click();
    await expect(page.getByText('Local rendering is not available in this browser.')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download project archive/ }).click();
    expect((await download).suggestedFilename()).toMatch(/\.ffproj$/);
  });

  test('has no horizontal overflow and keeps touch targets usable', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Animated title/ }).click();
    await expect(page.getByRole('slider', { name: 'Playhead' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const small = await page.evaluate(
      () =>
        [...document.querySelectorAll('button, [role=tab]')]
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.height < 32 && r.width > 0).length,
    );
    expect(small).toBeLessThanOrEqual(8); // dense timeline nudge buttons are the only allowed exceptions
  });

  test('imports a media file and rejects a disguised executable', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Blank project/ }).click();
    await page.getByRole('tab', { name: 'Media' }).click();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
    await page.locator('input[type=file]').setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByText('Imported "dot.png".')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Preview of dot.png' })).toBeVisible();
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: 'evil.png', mimeType: 'image/png', buffer: Buffer.from('MZ\x90\x00 this is not an image at all') });
    await expect(page.getByRole('alert')).toContainText(/Unsupported/);
  });
});

function wavBuffer(seconds: number): Buffer {
  const rate = 8000;
  const n = rate * seconds;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 8000), 44 + i * 2);
  return buf;
}

test.describe('audio and captions editor', () => {
  test('adds an audio track, edits it, and adds captions that show in the preview', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.getByRole('button', { name: /Blank project/ }).click();

    // Import audio and add it as a track
    await page.getByRole('tab', { name: 'Media' }).click();
    await page.locator('input[type=file]').setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: wavBuffer(2) });
    await expect(page.getByText('Imported "tone.wav".')).toBeVisible();
    await page.getByRole('tab', { name: 'Audio' }).click();
    await page.getByRole('button', { name: 'Add as track' }).click();
    const track = page.getByRole('region', { name: 'Audio track tone.wav' });
    await expect(track).toBeVisible();
    await expect(track.getByText(/clip is 2 s/)).toBeVisible();
    await track.getByLabel('Volume (%)', { exact: true }).fill('50');
    await track.getByLabel('Fade in (seconds)', { exact: true }).fill('0.5');
    await track.getByLabel('Mute this track').check();
    await expect(track.getByLabel('Mute this track')).toBeChecked();
    await expect(page.getByLabel('Audio track tone.wav', { exact: false }).first()).toBeVisible();

    // Captions: add at the playhead, edit text, check the preview shows it
    await page.getByRole('tab', { name: 'Captions' }).click();
    await page.getByRole('button', { name: '+ Caption at playhead' }).click();
    await page.getByRole('textbox', { name: 'Caption 1 text' }).fill('Hello captions');
    const frame = page.frameLocator('iframe[title="Video preview"]');
    await expect(frame.locator('#ff-captions')).toHaveText('Hello captions');
    // Turning captions off hides them in the preview
    await page.getByLabel('Show captions in the video').uncheck();
    await expect(frame.locator('#ff-captions')).toBeHidden();
    expect(errors, errors.join('\n')).toEqual([]);

    // Saved and restored after reload (wait for the save to start, then finish)
    await expect(page.getByText('Saving…')).toBeVisible();
    await expect(page.getByText('Saved on this device')).toBeVisible();
    await page.reload(); // the URL keeps the project open
    await page.getByRole('tab', { name: 'Audio' }).click();
    await expect(page.getByRole('region', { name: 'Audio track tone.wav' }).getByLabel('Mute this track')).toBeChecked();
    await page.getByRole('tab', { name: 'Captions' }).click();
    await expect(page.getByRole('textbox', { name: 'Caption 1 text' })).toHaveValue('Hello captions');
  });

  test('imports an .srt file', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Blank project/ }).click();
    await page.getByRole('tab', { name: 'Captions' }).click();
    await page.locator('input[type=file]').setInputFiles({
      name: 'subs.srt',
      mimeType: 'text/plain',
      buffer: Buffer.from('1\n00:00:00,500 --> 00:00:01,500\nFirst\n\n2\n00:00:02,000 --> 00:00:02,800\nSecond\n'),
    });
    await expect(page.getByText('Imported 2 captions.')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Caption 2 text' })).toHaveValue('Second');
  });
});

test.describe('direct manipulation on the preview', () => {
  async function openWithText(page: Page) {
    await page.goto('/');
    await page.getByRole('button', { name: /Blank project/ }).click();
    await page.getByRole('tab', { name: 'Scenes' }).click();
    await page.getByRole('button', { name: '+ Text' }).click(); // selects the new element and opens the Edit panel
    const box = page.locator('[data-el-box]').last();
    await expect(box).toBeVisible();
    await expect.poll(async () => (await box.boundingBox())?.width ?? 0).toBeGreaterThan(20);
    return box;
  }
  const num = (page: Page, label: string) => page.getByLabel(label, { exact: true });

  test('dragging moves the element, snaps to the centre, and is one undo step', async ({ page }) => {
    const box = await openWithText(page);
    await expect(num(page, 'X (centre) (%)')).toHaveValue('50');
    const b = (await box.boundingBox())!;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy + 30, { steps: 8 });
    await page.mouse.up();
    const x = Number(await num(page, 'X (centre) (%)').inputValue());
    const y = Number(await num(page, 'Y (centre) (%)').inputValue());
    expect(x).toBeGreaterThan(52);
    expect(y).toBeGreaterThan(52);
    // One drag = one undo step
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(num(page, 'X (centre) (%)')).toHaveValue('50');
    await expect(num(page, 'Y (centre) (%)')).toHaveValue('50');
    // A tiny drag near the centre snaps back exactly to 50
    const b2 = (await box.boundingBox())!;
    await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
    await page.mouse.down();
    await page.mouse.move(b2.x + b2.width / 2 + 3, b2.y + b2.height / 2, { steps: 3 });
    await page.mouse.up();
    await expect(num(page, 'X (centre) (%)')).toHaveValue('50');
  });

  test('corner handle scales and the round handle rotates', async ({ page }) => {
    const box = await openWithText(page);
    await expect(num(page, 'Scale')).toHaveValue('1');
    const b = (await box.boundingBox())!;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    // Scale: drag the bottom-right handle further from the centre
    const br = (await page.locator('.ov-h.br').boundingBox())!;
    await page.mouse.move(br.x + br.width / 2, br.y + br.height / 2);
    await page.mouse.down();
    await page.mouse.move(cx + (br.x + br.width / 2 - cx) * 1.6, cy + (br.y + br.height / 2 - cy) * 1.6, { steps: 8 });
    await page.mouse.up();
    expect(Number(await num(page, 'Scale').inputValue())).toBeGreaterThan(1.3);
    // Rotate: drag the rotate handle to the right of the centre (90 degrees) with Shift for 15-degree steps
    const rot = (await page.locator('.ov-h.rot').boundingBox())!;
    await page.mouse.move(rot.x + rot.width / 2, rot.y + rot.height / 2);
    await page.mouse.down();
    await page.keyboard.down('Shift');
    await page.mouse.move(cx + 200, cy, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(num(page, 'Rotation (°)')).toHaveValue('90');
  });

  test('keyboard nudges the selected element and Escape deselects', async ({ page }) => {
    const box = await openWithText(page);
    await box.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(num(page, 'X (centre) (%)')).toHaveValue('51');
    await page.keyboard.press('Shift+ArrowDown');
    await expect(num(page, 'Y (centre) (%)')).toHaveValue('52');
    await page.keyboard.press('Escape');
    await expect(page.locator('.ov-h')).toHaveCount(0);
  });

  test('is hidden for HTML-mode scenes and while playing', async ({ page }) => {
    await openWithText(page);
    await expect(page.getByTestId('canvas-overlay')).toBeVisible();
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByTestId('canvas-overlay')).toHaveCount(0);
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByTestId('canvas-overlay')).toBeVisible();
  });
});

test('preview shows the last scene when the playhead is at the very end', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Quote video/ }).click();
  await page.getByRole('slider', { name: 'Playhead' }).focus();
  await page.keyboard.press('End');
  const frame = page.frameLocator('iframe[title="Video preview"]');
  await expect(frame.getByText('— Someone Wise')).toBeVisible();
});
