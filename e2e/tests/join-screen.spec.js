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
  // Target the room-list Join button specifically, not the disabled JoinForm one
  await page.locator('.join-btn').first().click();

  await expect(page.getByRole('heading', { name: 'Join Room' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByRole('heading', { name: 'Simple Estimation' })).toBeVisible();
});
