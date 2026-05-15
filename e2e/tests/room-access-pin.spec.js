const { test, expect } = require('@playwright/test');

test('creator of an access-PIN room joins immediately without re-entering the PIN', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Create Room' }).click();
  await page.getByLabel('Your name').fill('Alice');
  await page.getByPlaceholder('Limit room access to specific people').fill('secret');
  await page.getByRole('button', { name: 'Create Room' }).click();

  // Alice should land in the room — not stuck on an access-PIN prompt
  await expect(page.getByRole('button', { name: 'Leave Room' })).toBeVisible();
  await expect(page.locator('.participant')).toContainText('Alice');
});

test('second participant can join an access-PIN room with the correct PIN', async ({ page, context }) => {
  // Alice creates the room
  await page.goto('/');
  await page.getByRole('tab', { name: 'Create Room' }).click();
  await page.getByLabel('Your name').fill('Alice');
  await page.getByPlaceholder('Limit room access to specific people').fill('secret');
  await page.getByRole('button', { name: 'Create Room' }).click();
  await expect(page.getByRole('button', { name: 'Leave Room' })).toBeVisible();
  const roomId = new URL(page.url()).searchParams.get('room');

  // Bob joins from a second tab, providing the access PIN upfront
  const bobPage = await context.newPage();
  await bobPage.goto('/');
  await bobPage.getByRole('tab', { name: 'Join Room' }).click();
  await bobPage.getByPlaceholder('Paste room ID').fill(roomId);
  await bobPage.getByLabel('Your name').fill('Bob');
  await bobPage.getByPlaceholder('Enter room access PIN').fill('secret');
  await bobPage.locator('#join-panel').getByRole('button', { name: 'Join' }).click();

  // Bob should be in the room
  await expect(bobPage.getByRole('button', { name: 'Leave Room' })).toBeVisible();
  await expect(bobPage.locator('.participant-list')).toContainText('Bob');

  // Both see each other
  await expect(page.locator('.participant-list')).toContainText('Bob');
});

test('joining with a wrong access PIN shows an error', async ({ page, request }) => {
  const res = await request.post('/api/rooms', {
    data: { type: 'planning-poker', accessPin: 'secret' },
  });
  const { id } = await res.json();

  await page.goto('/');
  await page.getByRole('tab', { name: 'Join Room' }).click();
  await page.getByPlaceholder('Paste room ID').fill(id);
  await page.getByLabel('Your name').fill('Bob');
  await page.getByPlaceholder('Enter room access PIN').fill('wrongpin');
  await page.locator('#join-panel').getByRole('button', { name: 'Join' }).click();

  // Should show an error — not land in the room
  await expect(page.getByRole('alert')).toContainText(/access pin|invalid/i);
  await expect(page.getByRole('button', { name: 'Leave Room' })).not.toBeVisible();
});

test('joining without an access PIN shows a prompt', async ({ page, request }) => {
  const res = await request.post('/api/rooms', {
    data: { type: 'planning-poker', accessPin: 'secret' },
  });
  const { id } = await res.json();

  // Navigate directly to the room URL (no access PIN known)
  await page.goto(`/?room=${id}`);

  // Should ask for the access PIN
  await expect(page.getByRole('heading', { name: 'Room Protected' })).toBeVisible();

  // Enter the correct PIN
  await page.getByPlaceholder('Enter access PIN').fill('secret');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Should then ask for name
  await expect(page.getByRole('heading', { name: 'Join Room' })).toBeVisible();
  await page.getByPlaceholder('Enter your name').fill('Bob');
  await page.getByRole('button', { name: 'Join' }).click();

  // Bob is in the room
  await expect(page.getByRole('button', { name: 'Leave Room' })).toBeVisible();
});
