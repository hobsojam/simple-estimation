const { test, expect } = require('@playwright/test');

test('facilitator starts a 5-second timer and votes auto-reveal when it expires', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('tab', { name: 'Create Room' }).click();
  await page.getByLabel('Your name').fill('Alice');
  await page.getByRole('button', { name: 'Create Room' }).click();
  await expect(page.getByRole('button', { name: 'Leave Room' })).toBeVisible();

  // Cast a vote so there is something to reveal
  await page.locator('button.card', { hasText: '5' }).click();
  await expect(page.locator('.hint')).toContainText('1 of 1 voted');

  // Set duration to 5 seconds and start the timer
  await page.fill('#timer-duration', '5');
  await page.getByRole('button', { name: 'Start Timer' }).click();

  // Progress bar and countdown are visible
  await expect(page.getByRole('progressbar')).toBeVisible();
  await expect(page.getByRole('timer')).toContainText('s remaining');

  // Cancel button is visible
  await expect(page.getByRole('button', { name: 'Cancel Timer' })).toBeVisible();

  // Wait for auto-reveal (timer expires and server broadcasts revealed state)
  await expect(page.locator('.vote-value', { hasText: '5' })).toBeVisible({ timeout: 10000 });

  // Timer UI is gone after reveal
  await expect(page.getByRole('progressbar')).not.toBeVisible();
});

test('facilitator can cancel a running timer', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('tab', { name: 'Create Room' }).click();
  await page.getByLabel('Your name').fill('Alice');
  await page.getByRole('button', { name: 'Create Room' }).click();
  await expect(page.getByRole('button', { name: 'Leave Room' })).toBeVisible();

  // Start a 60-second timer
  await page.fill('#timer-duration', '60');
  await page.getByRole('button', { name: 'Start Timer' }).click();
  await expect(page.getByRole('progressbar')).toBeVisible();

  // Cancel it
  await page.getByRole('button', { name: 'Cancel Timer' }).click();

  // Timer UI disappears and manual reveal controls return
  await expect(page.getByRole('progressbar')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Timer' })).toBeVisible();
});
