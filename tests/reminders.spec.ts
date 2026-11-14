import { test, expect } from '@playwright/test';
import type { LocalNotificationSchema } from '@capacitor/local-notifications';
import { login, mockApi, seedPet } from './petcare-test-helpers';

test('Android care alerts schedule both dates, replace edits, and cancel completed reminders', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-04-30T12:00:00+08:00'));
  const state = await mockApi(page);
  seedPet(state);
  state.records.push({
    id: 'booster',
    owner_id: 'demo-user',
    petId: 'sample-pet',
    category: 'vaccination',
    title: 'Vaccine booster',
    date: '2026-04-29',
    nextDate: '2026-05-02',
    veterinarian: '',
    notes: '',
    weightKg: null,
    createdAt: '2026-04-29T00:00:00Z',
  });

  await page.addInitScript(() => {
    let granted = false;
    const methods = {
      getPending: () => ({
        notifications: JSON.parse(localStorage.getItem('test-alarms') || '[]'),
      }),
      checkPermissions: () => ({ display: granted ? 'granted' : 'prompt' }),
      requestPermissions: () => {
        granted = true;
        return { display: 'granted' };
      },
      createChannel: (channel: object) =>
        localStorage.setItem('test-channel', JSON.stringify(channel)),
      schedule: ({ notifications }: { notifications: LocalNotificationSchema[] }) => {
        const scheduled = methods.getPending().notifications;
        localStorage.setItem('test-alarms', JSON.stringify([...scheduled, ...notifications]));
        return { notifications };
      },
      cancel: ({ notifications }: { notifications: { id: number }[] }) => {
        const ids = new Set(notifications.map((item) => item.id));
        const remaining = methods
          .getPending()
          .notifications.filter((item: { id: number }) => !ids.has(item.id));
        localStorage.setItem('test-alarms', JSON.stringify(remaining));
      },
      removeDeliveredNotificationsById: () => undefined,
      cancelAll: () => localStorage.removeItem('test-alarms'),
      removeAllDeliveredNotifications: () => undefined,
    };
    Object.assign(window, {
      androidBridge: {},
      Capacitor: {
        PluginHeaders: [
          {
            name: 'LocalNotifications',
            methods: Object.keys(methods).map((name) => ({ name, rtype: 'promise' })),
          },
        ],
        nativePromise: async (_: string, method: keyof typeof methods, options: never) =>
          methods[method](options),
      },
    });
  });

  const scheduledTimes = () =>
    page.evaluate(() =>
      (JSON.parse(localStorage.getItem('test-alarms') || '[]') as LocalNotificationSchema[])
        .map((item) => item.schedule?.at)
        .sort(),
    );
  await login(page);
  await expect
    .poll(scheduledTimes)
    .toEqual(['2026-05-01T01:00:00.000Z', '2026-05-02T01:00:00.000Z']);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('test-channel')!).vibration),
  ).toBe(true);

  // A new Android WebView loses sessionStorage but retains the device's app storage.
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.locator('.pet-card')).toBeVisible();
  expect(state.authCalls).toBe(1);

  await page.locator('.pet-card').click();
  await page.getByRole('button', { name: 'Edit Vaccine booster', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const dueDate = dialog.locator('input[name="nextDate"]');
  await expect(dueDate).toHaveAttribute('min', '2026-04-30');
  await dueDate.fill('2026-04-29');
  await dialog.locator('form').dispatchEvent('submit');
  await expect(dialog.getByRole('alert')).toHaveText(
    'Choose today or a future date for the next reminder.',
  );
  expect(state.records[0].nextDate).toBe('2026-05-02');
  await dueDate.fill('2026-05-01');
  await dialog.getByRole('button', { name: 'Save record' }).click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(scheduledTimes)
    .toEqual(['2026-04-30T01:00:00.000Z', '2026-05-01T01:00:00.000Z']);

  await page.getByRole('link', { name: 'Reminders', exact: true }).click();
  await page.getByRole('button', { name: 'Mark done' }).click();
  await expect(page.getByRole('heading', { name: 'No set date' })).toBeVisible();
  expect(await scheduledTimes()).toEqual([]);
  expect(state.records[0].nextDate).toBe('');
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.getItem('petcare-supabase-session'))).toBeNull();
});
