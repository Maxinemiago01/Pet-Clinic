import { test, expect } from '@playwright/test';
import { login, mockApi, seedPet } from './petcare-test-helpers';

test('secondary navigation and mobile logout work', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await page.locator('.mobile-brand').click();
  await page.locator('.notebook-summary a').click();
  await expect(page).toHaveURL(/\/app\/reminders$/);
  await page.getByRole('link', { name: 'Open pet profile' }).click();
  await page.getByRole('link', { name: 'Reminders', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/reminders$/);
  await page.locator('.mobile-nav').getByRole('link', { name: 'My pets', exact: true }).click();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.locator('app-auth:not(.ion-page-hidden) .brand').click();
});

test('pages fit a phone screen and the record dialog receives focus', async ({ page }) => {
  test.setTimeout(120000);
  const state = await mockApi(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  seedPet(state);
  await login(page);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ['/app', '/app/pets/new', '/app/pets/sample-pet', '/app/reminders']) {
      await page.goto(route);
      await expect(page.locator('.loading-state')).not.toBeVisible();
      const overflows = await page.evaluate(() => {
        const scroll = document
          .querySelector('ion-content')
          ?.shadowRoot?.querySelector('.inner-scroll');
        return {
          body: document.documentElement.scrollWidth > innerWidth + 1,
          content: !!scroll && scroll.scrollWidth > scroll.clientWidth + 1,
        };
      });
      expect(overflows, `${route} at ${width}px`).toEqual({ body: false, content: false });
    }
    await page.goto('/app/pets/sample-pet');
    await page.getByRole('button', { name: 'Add a record', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect(
      await dialog.evaluate((element) => element.contains(document.activeElement)),
    ).toBeTruthy();
    expect(
      await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBeTruthy();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  await page.goto('/app');
  await expect(page.locator('.pet-card')).toBeVisible();
  await page.getByRole('link', { name: 'Add pet', exact: true }).click();
  await expect(page.locator('input[name="name"]')).toBeVisible();
  await page.getByRole('link', { name: 'Cancel', exact: true }).click();
  await page.getByRole('link', { name: 'Reminders', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/reminders$/);
  expect(errors).toEqual([]);
});
