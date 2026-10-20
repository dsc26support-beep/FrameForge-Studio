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
