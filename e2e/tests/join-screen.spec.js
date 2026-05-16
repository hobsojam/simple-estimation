const { test, expect } = require('@playwright/test');

test('Cancel button on the join screen returns to the home page (direct URL)', async ({ page, request }) => {
  const res = await request.post('/api/rooms', { data: { type: 'planning-poker' } });
  const { id } = await res.json();

  await page.goto(`/?room=${id}`);
  await expect(page.getByRole('heading', { name: 'Join Room' })).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByRole('heading', { name: 'Simple Estimation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel' })).not.toBeVisible();
});

test('Cancel button on the join screen returns to the home page (room list)', async ({ page, request }) => {
  await request.post('/api/rooms', { data: { type: 'planning-poker' } });

  await page.goto('/');
  await page.getByRole('button', { name: 'Refresh' }).click();
  await page.getByRole('button', { name: 'Join' }).first().click();

  await expect(page.getByRole('heading', { name: 'Join Room' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByRole('heading', { name: 'Simple Estimation' })).toBeVisible();
});

test('access PIN field is shown on the join screen for protected rooms', async ({ page, request }) => {
  const res = await request.post('/api/rooms', { data: { type: 'planning-poker', accessPin: 'secret' } });
  const { id } = await res.json();

  await page.goto(`/?room=${id}`);
  await expect(page.getByRole('heading', { name: 'Join Room' })).toBeVisible();
  await expect(page.getByPlaceholder('Enter access PIN')).toBeVisible();
});

test('access PIN field is not shown for rooms without access PIN', async ({ page, request }) => {
  const res = await request.post('/api/rooms', { data: { type: 'planning-poker' } });
  const { id } = await res.json();

  await page.goto(`/?room=${id}`);
  await expect(page.getByRole('heading', { name: 'Join Room' })).toBeVisible();
  await expect(page.getByPlaceholder('Enter access PIN')).not.toBeVisible();
});

test('can join an access-PIN room from the room list with the correct PIN', async ({ page, request }) => {
  const res = await request.post('/api/rooms', { data: { type: 'planning-poker', accessPin: 'secret' } });
  const { id } = await res.json();

  await page.goto('/');
  await page.getByRole('button', { name: 'Refresh' }).click();

  // Find the row matching this room and click Join
  const row = page.locator('.room-row', { hasText: id.slice(0, 8) });
  await row.getByRole('button', { name: 'Join' }).click();

  await expect(page.getByRole('heading', { name: 'Join Room' })).toBeVisible();
  await expect(page.getByPlaceholder('Enter access PIN')).toBeVisible();

  await page.getByPlaceholder('Enter your name').fill('Alice');
  await page.getByPlaceholder('Enter access PIN').fill('secret');
  await page.getByRole('button', { name: 'Join' }).click();

  await expect(page.getByRole('button', { name: 'Leave Room' })).toBeVisible();
});

test('wrong access PIN shows an error on the join screen', async ({ page, request }) => {
  const res = await request.post('/api/rooms', { data: { type: 'planning-poker', accessPin: 'secret' } });
  const { id } = await res.json();

  await page.goto(`/?room=${id}`);
  await expect(page.getByRole('heading', { name: 'Join Room' })).toBeVisible();

  await page.getByPlaceholder('Enter your name').fill('Alice');
  await page.getByPlaceholder('Enter access PIN').fill('wrongpin');
  await page.getByRole('button', { name: 'Join' }).click();

  await expect(page.getByRole('alert')).toContainText(/access pin|invalid/i);
  await expect(page.getByRole('button', { name: 'Leave Room' })).not.toBeVisible();
});
