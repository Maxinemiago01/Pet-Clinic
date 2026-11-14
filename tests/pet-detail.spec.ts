import { test, expect } from '@playwright/test';
import path from 'node:path';
import { login, mockApi, seedPet } from './petcare-test-helpers';

test('pet and record CRUD, photo upload, filters, reminders, and cascading deletion', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-01-02T12:00:00+08:00'));
  const state = await mockApi(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  await page.getByRole('link', { name: 'Add a pet', exact: true }).click();
  await page.locator('input[name="name"]').fill('Mochi');
  await page.locator('select[name="species"]').selectOption('Cat');
  await page.locator('input[name="breed"]').fill('Persian');
  await page.locator('input[name="birthday"]').fill('2023-04-01');
  await page.locator('input[name="weight"]').fill('4.5');
  await page.locator('textarea[name="notes"]').fill('Loves sunny windows.');
  await page.locator('input[type="file"]').setInputFiles(path.resolve('public/assets/paw.png'));
  await expect(page.getByAltText('Pet profile preview')).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mochi.', exact: true })).toBeVisible();
  expect(state.uploads).toBe(1);
  expect(state.pets[0].imagePath).toMatch(/^demo-user\/[a-f0-9-]+\.jpg$/);
  await page.getByRole('link', { name: 'Edit profile' }).click();
  await page.locator('input[name="name"]').fill('Mochi Bean');
  await page.getByRole('button', { name: 'Remove photo', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Mochi Bean.', exact: true })).toBeVisible();

  for (const [category, title] of [
    ['vaccination', 'Rabies'],
    ['medical', 'Annual checkup'],
    ['health', 'Weight check'],
  ]) {
    await page.getByRole('button', { name: 'Add a record', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('select[name="category"]').selectOption(category);
    await dialog.locator('input[name="title"]').fill(title);
    await dialog.locator('input[name="date"]').fill('2026-01-01');
    if (category === 'vaccination')
      await dialog.locator('input[name="nextDate"]').fill('2026-01-02');
    if (category === 'health') await dialog.locator('input[name="weightKg"]').fill('4.75');
    await dialog.getByRole('button', { name: 'Save record' }).click();
    await expect(dialog).not.toBeVisible();
  }
  await expect(page.locator('.record-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Edit Weight check', exact: true }).click();
  await page.getByRole('dialog').locator('input[name="title"]').fill('Updated weight');
  await page.getByRole('dialog').getByRole('button', { name: 'Save record' }).click();
  await expect(page.getByRole('heading', { name: 'Updated weight' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Updated weight', exact: true }).click();
  await page.getByRole('button', { name: 'Keep it' }).click();
  await page.getByRole('button', { name: 'Delete Updated weight', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(page.locator('.record-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Add a record', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();

  await page.getByRole('link', { name: 'Back to my pets', exact: true }).click();
  await page.locator('.pet-card').click();
  await expect(page.getByRole('heading', { name: 'Mochi Bean.', exact: true })).toBeVisible();

  await page.clock.setFixedTime(new Date('2026-01-03T12:00:00+08:00'));
  await page.getByRole('link', { name: 'Reminders', exact: true }).click();
  await expect(page.getByText('Overdue', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'For Mochi Bean' }).click();
  await page.getByRole('button', { name: 'Edit Rabies', exact: true }).click();
  const overdueForm = page.getByRole('dialog');
  await overdueForm.locator('input[name="title"]').fill('Rabies vaccination');
  await overdueForm.getByRole('button', { name: 'Save record' }).click();
  await expect(overdueForm).not.toBeVisible();
  expect(state.records.find((item) => item.title === 'Rabies vaccination')?.nextDate).toBe(
    '2026-01-02',
  );
  await page.getByRole('link', { name: 'Reminders', exact: true }).click();
  await page.getByRole('button', { name: 'Mark done' }).click();
  await expect(page.getByRole('heading', { name: 'No set date' })).toBeVisible();
  expect(state.records).toHaveLength(2);
  await page.getByRole('link', { name: 'Open pet profile' }).click();
  await page.getByRole('button', { name: 'Dogs', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No pet found' })).toBeVisible();
  await page.getByRole('button', { name: 'Cats', exact: true }).click();
  await expect(page.locator('.pet-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'All pets', exact: true }).click();
  await page.getByRole('searchbox').fill('does-not-exist');
  await expect(page.getByRole('heading', { name: 'No pet found' })).toBeVisible();
  await page.getByRole('searchbox').clear();
  await page.locator('.pet-card').click();
  await page.getByRole('button', { name: 'Delete pet profile', exact: true }).click();
  await page.getByRole('button', { name: 'Keep it' }).click();
  await page.getByRole('button', { name: 'Delete pet profile', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(page).toHaveURL(/\/app$/);
  expect(state.pets).toHaveLength(0);
  expect(state.records).toHaveLength(0);
  expect(state.requests.some((request) => request.method === 'PATCH')).toBeTruthy();
  expect(errors).toEqual([]);
});

test('a failed pet deletion preserves the profile and its records for retry', async ({ page }) => {
  const state = await mockApi(page);
  seedPet(state);
  state.records.push({
    id: 'care-1',
    owner_id: 'demo-user',
    petId: 'sample-pet',
    category: 'medical',
    title: 'Test visit',
    date: '2026-01-01',
    nextDate: '',
    veterinarian: '',
    weightKg: null,
    notes: '',
    createdAt: '2026-01-01T00:00:00Z',
  });
  await login(page);
  await page.locator('.pet-card').click();
  state.failPetDelete = true;
  await page.getByRole('button', { name: 'Delete pet profile', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(state.pets).toHaveLength(1);
  expect(state.records).toHaveLength(1);
  state.failPetDelete = false;
  await page.getByRole('button', { name: 'Delete pet profile', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(page).toHaveURL(/\/app$/);
  expect(state.pets).toHaveLength(0);
  expect(state.records).toHaveLength(0);
});

test('a missing private photo does not prevent opening pet records', async ({ page }) => {
  const state = await mockApi(page);
  seedPet(state);
  state.pets[0].imagePath = 'demo-user/missing.jpg';
  await login(page);
  await expect(page.locator('.pet-card')).toBeVisible();
  await page.locator('.pet-card').click();
  await expect(page.getByRole('heading', { name: 'Test pet.', exact: true })).toBeVisible();
  await expect(page.locator('.profile-avatar img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add a record', exact: true })).toBeVisible();
});
