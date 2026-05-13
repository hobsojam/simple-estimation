const { test, expect } = require('@playwright/test');

test('create PIN-protected room, cast vote, leave, delete with correct PIN', async ({ page }) => {
  await page.goto('/');

  // Switch to Create Room tab
  await page.getByRole('tab', { name: 'Create Room' }).click();

  // Fill in name and PIN (room type defaults to Planning Poker)
  await page.getByLabel('Your name').fill('Alice');
  await page.getByPlaceholder('Set a PIN to protect facilitator role').fill('1234');

  // Create the room
  await page.getByRole('button', { name: 'Create Room' }).click();

  // Wait for the room view to appear
  await expect(page.getByRole('button', { name: 'Leave Room' })).toBeVisible();

  // Capture room ID from URL for later matching in the room list
  const roomId = new URL(page.url()).searchParams.get('room');
  expect(roomId).toBeTruthy();

  // Cast a vote
  await page.locator('button.card', { hasText: '5' }).click();

  // Vote registered — our participant row transitions to voted state
  await expect(page.locator('.participant.voted')).toBeVisible();

  // Leave the room
  await page.getByRole('button', { name: 'Leave Room' }).click();

  // Back on the home page
  await expect(page.getByRole('heading', { name: 'Simple Estimation' })).toBeVisible();

  // Room list shows our room (PIN badge confirms it is protected)
  const roomRow = page.locator('.room-row').filter({
    has: page.locator('.room-id', { hasText: roomId.slice(0, 8) }),
  });
  await expect(roomRow).toBeVisible();
  await expect(roomRow.locator('.pin-badge')).toBeVisible();

  // Open the delete flow
  await roomRow.getByRole('button', { name: 'Delete' }).click();

  // Enter correct PIN and confirm
  await roomRow.locator('input.pin-input').fill('1234');
  await roomRow.getByRole('button', { name: 'Delete' }).click();

  // Room disappears from the list
  await expect(roomRow).not.toBeVisible();
});

test('delete with wrong PIN shows Incorrect PIN error', async ({ page, request }) => {
  // Create the room via API — no need to drive the full UI here
  const res = await request.post('/api/rooms', {
    data: { type: 'planning-poker', pin: 'secret' },
  });
  const { id } = await res.json();

  await page.goto('/');

  const roomRow = page.locator('.room-row').filter({
    has: page.locator('.room-id', { hasText: id.slice(0, 8) }),
  });
  await expect(roomRow).toBeVisible();

  // Open the delete flow and submit a wrong PIN
  await roomRow.getByRole('button', { name: 'Delete' }).click();
  await roomRow.locator('input.pin-input').fill('wrongpin');
  await roomRow.getByRole('button', { name: 'Delete' }).click();

  // Error message appears and the room stays in the list
  await expect(roomRow.locator('.inline-error')).toContainText('Incorrect PIN');
  await expect(roomRow).toBeVisible();
});
