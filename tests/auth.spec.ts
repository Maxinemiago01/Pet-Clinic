import { test, expect } from '@playwright/test';
import { mockApi } from './petcare-test-helpers';

test('account validation, fake-email registration, password visibility, and logout', async ({
  page,
}) => {
  const state = await mockApi(page);
  await page.goto('/app/pets/new');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  expect(state.authCalls).toBe(0);
  await expect(page.locator('input[name="email"]')).toBeFocused();
  await page.locator('input[name="email"]').fill('student@example.com');
  await page.locator('input[name="password"]').fill('wrong-password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.locator('input[name="password"]')).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('email or password is incorrect');
  await expect(page.getByRole('button', { name: 'Forgot your password?' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Create account', exact: true }).click();
  await page.locator('input[name="email"]:visible').fill('alex@petcare.test');
  await page.locator('input[name="password"]:visible').fill('petcare123');
  await page.locator('input[name="confirmPassword"]').fill('different123');
  await page.getByRole('button', { name: 'Create my account' }).click();
  await expect(page.getByRole('alert')).toContainText('do not match');
  await page.locator('input[name="confirmPassword"]').fill('petcare123');
  await page.getByRole('button', { name: 'Create my account' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your notebook starts with a name' }),
  ).toBeVisible();
  expect(state.signups).toBe(1);
  expect(
    await page.evaluate(() => sessionStorage.getItem('petcare-supabase-session')),
  ).not.toContain('petcare123');
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => sessionStorage.getItem('petcare-supabase-session'))).toBeNull();
  await expect(page.locator('input[name="password"]')).toHaveValue('');
});

test('expired sessions refresh once for concurrent REST reads and invalid refresh returns to login', async ({
  page,
}) => {
  const state = await mockApi(page);
  await page.addInitScript(() =>
    sessionStorage.setItem(
      'petcare-supabase-session',
      JSON.stringify({
        uid: 'demo-user',
        email: 'student@example.com',
        accessToken: 'test-access-token',
        refreshToken: 'old-token',
        expiresAt: 1,
      }),
    ),
  );
  await page.goto('/app');
  await expect(
    page.getByRole('heading', { name: 'Your notebook starts with a name' }),
  ).toBeVisible();
  expect(state.refreshes).toBe(1);
  state.failRefresh = true;
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
});

test('confirmation-enabled configuration blocks signup before any email can be requested', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.confirmationRequired = true;
  await page.goto('/register');
  await page.locator('input[name="email"]').fill('alex@petcare.test');
  await page.locator('input[name="password"]').fill('petcare123');
  await page.locator('input[name="confirmPassword"]').fill('petcare123');
  await page.getByRole('button', { name: 'Create my account' }).click();
  await expect(page.getByRole('alert')).toContainText('Turn off Confirm email');
  expect(state.signups).toBe(0);
  expect(await page.evaluate(() => sessionStorage.getItem('petcare-supabase-session'))).toBeNull();
});
