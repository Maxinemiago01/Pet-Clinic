import { test, expect } from '@playwright/test';
import { login, mockApi, seedPet } from './petcare-test-helpers';

test('permission errors offer a working retry and loading/empty states', async ({ page }) => {
  const state = await mockApi(page);
  state.failLoad = true;
  await login(page);
  await expect(page.getByRole('alert')).toContainText('You do not have permission');
  state.failLoad = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your notebook starts with a name' }),
  ).toBeVisible();
});

test('pagination loads every pet instead of stopping at the first REST page', async ({ page }) => {
  const state = await mockApi(page);
  for (let index = 0; index < 101; index++) seedPet(state, `pet-${index}`, `Test pet ${index}`);
  await login(page);
  await expect(page.locator('.pet-card')).toHaveCount(101);
});
