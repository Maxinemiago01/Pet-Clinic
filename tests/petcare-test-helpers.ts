import { expect, type Page } from '@playwright/test';
import path from 'node:path';

type Document = { id: string; owner_id: string; [key: string]: any };
type MockState = {
  pets: Document[];
  records: Document[];
  requests: { method: string; path: string; body: any }[];
  failLoad: boolean;
  failMissingTables: boolean;
  failPetSaves: number;
  failPetDelete: boolean;
  failRefresh: boolean;
  failUploads: boolean;
  confirmationRequired: boolean;
  uploads: number;
  refreshes: number;
  authCalls: number;
  signups: number;
};
const supabaseUrl = 'https://hykutdgbuycbfquefice.supabase.co';
const publishableKey = 'sb_publishable_iiPy0P0yJLhkWmRW1WUnyQ_rm4SWe83';

export async function mockApi(page: Page): Promise<MockState> {
  const state: MockState = {
    pets: [],
    records: [],
    requests: [],
    failLoad: false,
    failMissingTables: false,
    failPetSaves: 0,
    failPetDelete: false,
    failRefresh: false,
    failUploads: false,
    confirmationRequired: false,
    uploads: 0,
    refreshes: 0,
    authCalls: 0,
    signups: 0,
  };
  let nextId = 1;
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  };
  const session = (email = 'student@example.com', token = 'test-access-token') => ({
    access_token: token,
    refresh_token: 'test-refresh-token',
    expires_in: 3600,
    user: { id: 'demo-user', email },
  });
  await page.route(supabaseUrl + '/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (method === 'GET' && url.pathname.startsWith('/storage/v1/object/sign/')) {
      expect(url.searchParams.get('token')).toBe('test-signature');
      await route.fulfill({
        path: path.resolve('public/assets/paw.png'),
        contentType: 'image/png',
        headers,
      });
      return;
    }
    expect(request.headers()['apikey']).toBe(publishableKey);
    if (url.pathname.startsWith('/auth/v1/')) {
      state.authCalls++;
      const body = request.postData() ? request.postDataJSON() : {};
      if (url.pathname.endsWith('/settings')) {
        await route.fulfill({ json: { mailer_autoconfirm: !state.confirmationRequired }, headers });
        return;
      }
      if (url.pathname.endsWith('/logout')) {
        await route.fulfill({ status: 204, headers });
        return;
      }
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        state.refreshes++;
        expect(body.refresh_token).toBeTruthy();
        if (state.failRefresh)
          await route.fulfill({
            status: 400,
            json: { error_code: 'refresh_token_not_found' },
            headers,
          });
        else
          await route.fulfill({ json: session('student@example.com', 'refreshed-token'), headers });
        return;
      }
      if (body.password === 'wrong-password') {
        await route.fulfill({ status: 400, json: { error_code: 'invalid_credentials' }, headers });
        return;
      }
      expect(['/auth/v1/token', '/auth/v1/signup']).toContain(url.pathname);
      if (url.pathname.endsWith('/signup')) {
        expect(state.confirmationRequired).toBe(false);
        state.signups++;
      }
      await route.fulfill({ json: session(body.email), headers });
      return;
    }
    expect(request.headers()['authorization']).toMatch(
      /^Bearer (test-access-token|refreshed-token)$/,
    );
    if (url.pathname.startsWith('/storage/v1/')) {
      if (url.pathname.startsWith('/storage/v1/object/sign/pet-photos/')) {
        expect(request.postDataJSON()).toEqual({ expiresIn: 3600 });
        expect(url.pathname).toContain('/demo-user/');
        if (url.pathname.endsWith('/missing.jpg')) {
          await route.fulfill({
            status: 400,
            json: { statusCode: '404', message: 'Object not found' },
            headers,
          });
          return;
        }
        await route.fulfill({
          json: { signedURL: url.pathname.replace('/storage/v1', '') + '?token=test-signature' },
          headers,
        });
        return;
      }
      expect(url.pathname).toMatch(
        /^\/storage\/v1\/object\/pet-photos\/demo-user\/[a-f0-9-]+\.jpg$/,
      );
      expect(request.headers()['content-type']).toBe('image/jpeg');
      expect(request.headers()['x-upsert']).toBe('false');
      expect(request.postDataBuffer()!.subarray(0, 3)).toEqual(Buffer.from([255, 216, 255]));
      state.uploads++;
      if (state.failUploads) await route.fulfill({ status: 403, json: { code: '42501' }, headers });
      else await route.fulfill({ json: { Key: url.pathname.split('/object/')[1] }, headers });
      return;
    }
    const collection = url.pathname.endsWith('/pet_records') ? 'records' : 'pets';
    expect(['/rest/v1/pets', '/rest/v1/pet_records']).toContain(url.pathname);
    const id = url.searchParams.get('id')?.slice(3);
    const body = ['POST', 'PATCH'].includes(method) ? request.postDataJSON() : null;
    state.requests.push({ method, path: url.pathname, body });
    if (state.failMissingTables) {
      await route.fulfill({ status: 404, json: { code: 'PGRST205' }, headers });
      return;
    }
    if (state.failLoad && method === 'GET') {
      await route.fulfill({ status: 403, json: { code: '42501' }, headers });
      return;
    }
    if (collection === 'pets' && ['POST', 'PATCH'].includes(method) && state.failPetSaves > 0) {
      state.failPetSaves--;
      await route.fulfill({ status: 503, json: { message: 'Service unavailable' }, headers });
      return;
    }
    if (collection === 'pets' && method === 'DELETE' && state.failPetDelete) {
      await route.fulfill({ status: 503, json: { message: 'Service unavailable' }, headers });
      return;
    }
    if (method === 'GET') {
      if (!id) expect(url.searchParams.get('owner_id')).toBe('eq.demo-user');
      let documents = state[collection].filter((item) => !id || item.id === id);
      const petId = url.searchParams.get('petId')?.slice(3);
      if (petId) documents = documents.filter((item) => item.petId === petId);
      documents = [...documents].sort((a, b) =>
        collection === 'pets' ? a.name.localeCompare(b.name) : b.date.localeCompare(a.date),
      );
      const offset = Number(url.searchParams.get('offset') || 0);
      const limit = Number(url.searchParams.get('limit') || 100);
      await route.fulfill({ json: documents.slice(offset, offset + limit), headers });
    } else if (method === 'POST' || method === 'PATCH') {
      expect(request.headers()['prefer']).toBe('return=representation');
      expect(body.owner_id).toBe('demo-user');
      expect(body.fields).toBeUndefined();
      expect(body.imageUrl).toBeUndefined();
      const document = { ...body, id: id || 'item-' + nextId++ };
      state[collection] = [
        ...state[collection].filter((item) => item.id !== document.id),
        document,
      ];
      await route.fulfill({ json: [document], headers });
    } else if (method === 'DELETE') {
      const deleted = state[collection].filter((item) => item.id === id);
      state[collection] = state[collection].filter((item) => item.id !== id);
      if (collection === 'pets') state.records = state.records.filter((item) => item.petId !== id);
      await route.fulfill({ json: deleted, headers });
    } else throw new Error('Unexpected API method: ' + method);
  });
  return state;
}

export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill('student@example.com');
  await page.locator('input[name="password"]').fill('petcare123');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator('.loading-state')).not.toBeVisible();
}

export function seedPet(state: MockState, id = 'sample-pet', name = 'Test pet'): void {
  state.pets.push({
    id,
    owner_id: 'demo-user',
    name,
    species: 'Cat',
    breed: 'Mixed breed',
    sex: 'Female',
    birthday: '2023-04-01',
    weightKg: 4.5,
    allergies: 'Test care note',
    notes: 'Test fixture, used only by automated tests.',
    imagePath: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  });
}
