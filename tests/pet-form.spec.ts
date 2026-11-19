import { test, expect, devices } from '@playwright/test';
import path from 'node:path';
import { login, mockApi } from './petcare-test-helpers';

test('failed saves keep form data and do not upload the same photo twice on retry', async ({
  page,
}) => {
  const state = await mockApi(page);
  await login(page);
  await page.getByRole('link', { name: 'Add a pet', exact: true }).click();
  await page.locator('input[name="name"]').fill('Retry pet');
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'invalid.gif', mimeType: 'image/gif', buffer: Buffer.from('invalid') });
  await expect(page.getByRole('alert')).toContainText('JPG, PNG, or WebP');
  await page.locator('input[type="file"]').setInputFiles(path.resolve('public/assets/paw.png'));
  await expect(page.getByAltText('Pet profile preview')).toBeVisible();
  state.failPetSaves = 1;
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not save or load');
  await expect(page.locator('input[name="name"]')).toHaveValue('Retry pet');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Retry pet.', exact: true })).toBeVisible();
  expect(state.uploads).toBe(1);
});

test('missing schema and private-photo upload errors allow a useful retry', async ({ page }) => {
  const state = await mockApi(page);
  state.failMissingTables = true;
  await login(page);
  await expect(page.getByRole('alert')).toContainText('database has not been set up');
  state.failMissingTables = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByRole('link', { name: 'Add a pet', exact: true }).click();
  await page.locator('input[name="name"]').fill('Photo retry');
  await page.locator('input[type="file"]').setInputFiles(path.resolve('public/assets/paw.png'));
  await expect(page.getByAltText('Pet profile preview')).toBeVisible();
  state.failUploads = true;
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('permission');
  expect(state.pets).toHaveLength(0);
  state.failUploads = false;
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Photo retry.', exact: true })).toBeVisible();
  await expect(page.getByAltText('Photo retry', { exact: true })).toBeVisible();
});

test('Android camera cancellation keeps the form ready for another photo', async ({ page }) => {
  await page.addInitScript(() => {
    let attempts = 0;
    Object.assign(window, {
      androidBridge: {},
      Capacitor: {
        PluginHeaders: [{ name: 'Camera', methods: [{ name: 'takePhoto', rtype: 'promise' }] }],
        nativePromise: async () => {
          if (++attempts === 1) throw { code: 'OS-PLUG-CAMR-0006' };
          return { webPath: '/assets/happy-pets.jpg' };
        },
      },
    });
  });
  await mockApi(page);
  await login(page);
  await page.getByRole('link', { name: 'Add a pet', exact: true }).click();
  await page.getByRole('textbox', { name: 'Pet’s name' }).fill('Camera pet');

  const takePhoto = page.getByRole('button', { name: 'Take photo', exact: true });
  await takePhoto.click();
  await expect(takePhoto).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Pet’s name' })).toHaveValue('Camera pet');

  await takePhoto.click();
  await expect(page.getByAltText('Pet profile preview')).toBeVisible();
});

test.describe('mobile browser', () => {
  test.use({
    userAgent: devices['Pixel 7'].userAgent,
    viewport: { width: 320, height: 740 },
    isMobile: true,
    hasTouch: true,
  });

  test('Take photo opens the rear-camera picker and saves the returned photo', async ({ page }) => {
    const state = await mockApi(page);
    await login(page);
    await page.getByRole('link', { name: 'Add a pet', exact: true }).click();
    await page.getByRole('textbox', { name: 'Pet’s name' }).fill('Camera pet');

    const cameraPicker = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Take photo', exact: true }).click();
    const picker = await cameraPicker;
    expect(await picker.element().getAttribute('capture')).toBe('environment');
    await picker.setFiles(path.resolve('public/assets/paw.png'));

    await expect(page.getByAltText('Pet profile preview')).toBeVisible();
    expect(state.uploads).toBe(0);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByAltText('Camera pet', { exact: true })).toBeVisible();
    expect(state.uploads).toBe(1);
  });
});
