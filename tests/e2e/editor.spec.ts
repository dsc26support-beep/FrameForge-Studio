import { expect, test } from '@playwright/test';

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
