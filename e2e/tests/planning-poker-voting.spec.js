const { test, expect } = require('@playwright/test');

test('vote count updates and reveal button enables after facilitator votes', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('tab', { name: 'Create Room' }).click();
  await page.getByLabel('Your name').fill('Alice');
  await page.getByRole('button', { name: 'Create Room' }).click();
  await expect(page.getByRole('button', { name: 'Leave Room' })).toBeVisible();

  // Before voting: 0 of 1, reveal disabled
  await expect(page.locator('.hint')).toContainText('0 of 1 voted');
  await expect(page.getByRole('button', { name: 'Reveal Votes' })).toBeDisabled();

  // Cast a vote
  await page.locator('button.card', { hasText: '5' }).click();

  // Count must update and reveal button must become enabled
  await expect(page.locator('.hint')).toContainText('1 of 1 voted');
  await expect(page.getByRole('button', { name: 'Reveal Votes' })).toBeEnabled();

  // Reveal works
  await page.getByRole('button', { name: 'Reveal Votes' }).click();
  await expect(page.locator('.vote-value', { hasText: '5' })).toBeVisible();
});

test('vote count reflects each participant as they vote', async ({ page, context }) => {
  await page.goto('/');

  await page.getByRole('tab', { name: 'Create Room' }).click();
  await page.getByLabel('Your name').fill('Alice');
  await page.getByRole('button', { name: 'Create Room' }).click();
  await expect(page.getByRole('button', { name: 'Leave Room' })).toBeVisible();

  const roomId = new URL(page.url()).searchParams.get('room');

  const bobPage = await context.newPage();
  await bobPage.goto(`/?room=${roomId}`);
  await bobPage.getByLabel('Your name').fill('Bob');
  await bobPage.getByRole('button', { name: 'Join' }).click();
  await expect(bobPage.getByRole('button', { name: 'Leave Room' })).toBeVisible();

  // 0 of 2 to start, reveal disabled
  await expect(page.locator('.hint')).toContainText('0 of 2 voted');
  await expect(page.getByRole('button', { name: 'Reveal Votes' })).toBeDisabled();

  // Alice votes — 1 of 2, reveal now enabled for facilitator
  await page.locator('button.card', { hasText: '5' }).click();
  await expect(page.locator('.hint')).toContainText('1 of 2 voted');
  await expect(page.getByRole('button', { name: 'Reveal Votes' })).toBeEnabled();

  // Bob votes — 2 of 2 on both pages
  await bobPage.locator('button.card', { hasText: '8' }).click();
  await expect(page.locator('.hint')).toContainText('2 of 2 voted');
  await expect(bobPage.locator('.hint')).toContainText('2 of 2 voted');
});
