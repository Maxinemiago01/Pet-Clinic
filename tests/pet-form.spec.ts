import { test, expect } from '@playwright/test';
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
