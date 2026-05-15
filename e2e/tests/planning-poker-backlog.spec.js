const { test, expect } = require('@playwright/test');

test('add item → select → vote → finalise → verify in history → download CSV', async ({ page, context }) => {
  await page.goto('/');

  await page.getByRole('tab', { name: 'Create Room' }).click();
  await page.getByLabel('Your name').fill('Alice');

  await page.getByRole('button', { name: 'Create Room' }).click();
  await expect(page.getByRole('button', { name: 'Leave Room' })).toBeVisible();

  // Add items to the backlog
  await page.getByPlaceholder('Add item…').fill('User can log in with email');
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByPlaceholder('Add item…').fill('Password reset flow');
  await page.getByRole('button', { name: 'Add' }).click();

  // Both items appear in the Pending section
  await expect(page.getByText('User can log in with email')).toBeVisible();
  await expect(page.getByText('Password reset flow')).toBeVisible();

  // Select the first item to estimate
  await page.getByRole('button', { name: 'Estimate' }).first().click();

  // Active item banner appears
  await expect(page.locator('.active-banner')).toContainText('User can log in with email');

  // Voting cards are now enabled — cast a vote
  await page.locator('button.card', { hasText: '5' }).click();
  await expect(page.locator('.participant.voted')).toBeVisible();

  // Reveal votes
  await page.getByRole('button', { name: 'Reveal Votes' }).click();
  await expect(page.locator('.vote-value', { hasText: '5' })).toBeVisible();

  // Finalise section appears — pre-filled with majority (5)
  await expect(page.locator('.finalise-section')).toBeVisible();
  await expect(page.locator('.estimate-btn.selected', { hasText: '5' })).toBeVisible();

  // Accept the suggested estimate
  await page.getByRole('button', { name: 'Finalise' }).click();

  // Item moves to Done section with its estimate
  await expect(page.locator('.done-item')).toBeVisible();
  await expect(page.locator('.done-item .item-label')).toContainText('User can log in with email');
  await expect(page.locator('.done-item .estimate-badge')).toContainText('5');

  // CSV download button appears
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeVisible();

  // Trigger download and verify it starts (Playwright captures the download event)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^estimation-[a-f0-9]{8}\.csv$/);
});

test('facilitator can remove a pending item', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('tab', { name: 'Create Room' }).click();
  await page.getByLabel('Your name').fill('Alice');
  await page.getByRole('button', { name: 'Create Room' }).click();
  await expect(page.getByRole('button', { name: 'Leave Room' })).toBeVisible();

  await page.getByPlaceholder('Add item…').fill('To be removed');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('To be removed')).toBeVisible();

  await page.getByRole('button', { name: 'Remove To be removed' }).click();
  await expect(page.getByText('To be removed')).not.toBeVisible();
});

test('non-facilitator sees backlog but no facilitator controls', async ({ page, context }) => {
  // Create room as Alice
  await page.goto('/');
  await page.getByRole('tab', { name: 'Create Room' }).click();
  await page.getByLabel('Your name').fill('Alice');
  await page.getByRole('button', { name: 'Create Room' }).click();
  await expect(page.getByRole('button', { name: 'Leave Room' })).toBeVisible();

  const roomId = new URL(page.url()).searchParams.get('room');

  // Add an item as facilitator
  await page.getByPlaceholder('Add item…').fill('Login story');
  await page.getByRole('button', { name: 'Add' }).click();

  // Join as Bob in a second tab
  const page2 = await context.newPage();
  await page2.goto(`/?room=${roomId}`);
  await page2.getByLabel('Your name').fill('Bob');
  await page2.getByRole('button', { name: 'Join' }).click();
  await expect(page2.getByRole('button', { name: 'Leave Room' })).toBeVisible();

  // Bob sees the backlog item
  await expect(page2.getByText('Login story')).toBeVisible();

  // Bob does not see Add form or Estimate/Remove buttons
  await expect(page2.getByPlaceholder('Add item…')).not.toBeVisible();
  await expect(page2.getByRole('button', { name: 'Estimate' })).not.toBeVisible();
});

test('backlog state syncs to second participant in real time', async ({ page, context }) => {
  // Alice creates a room (no PIN)
  await page.goto('/');
  await page.getByRole('tab', { name: 'Create Room' }).click();
  await page.getByLabel('Your name').fill('Alice');
  await page.getByRole('button', { name: 'Create Room' }).click();
  await expect(page.getByRole('button', { name: 'Leave Room' })).toBeVisible();

  const roomId = new URL(page.url()).searchParams.get('room');

  // Alice adds an item to the backlog
  await page.getByPlaceholder('Add item…').fill('User can log in');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('User can log in')).toBeVisible();

  // Bob joins the same room in a second tab
  const bobPage = await context.newPage();
  await bobPage.goto(`/?room=${roomId}`);
  await bobPage.getByLabel('Your name').fill('Bob');
  await bobPage.getByRole('button', { name: 'Join' }).click();
  await expect(bobPage.getByRole('button', { name: 'Leave Room' })).toBeVisible();

  // Alice clicks Estimate — active-item banner appears on both pages
  await page.getByRole('button', { name: 'Estimate' }).first().click();
  await expect(page.locator('.active-banner')).toContainText('User can log in');
  await expect(bobPage.locator('.active-banner')).toContainText('User can log in');

  // Both Alice and Bob vote 5
  await page.locator('button.card', { hasText: '5' }).click();
  await expect(page.locator('.participant.voted')).toBeVisible();
  await bobPage.locator('button.card', { hasText: '5' }).click();
  await expect(bobPage.locator('.participant.voted')).toBeVisible();

  // Alice reveals votes — both see the result
  await page.getByRole('button', { name: 'Reveal Votes' }).click();
  await expect(page.locator('.vote-value', { hasText: '5' }).first()).toBeVisible();
  await expect(bobPage.locator('.vote-value', { hasText: '5' }).first()).toBeVisible();

  // Alice finalises with estimate 5
  await expect(page.locator('.finalise-section')).toBeVisible();
  await expect(page.locator('.estimate-btn.selected', { hasText: '5' })).toBeVisible();
  await page.getByRole('button', { name: 'Finalise' }).click();

  // Bob's page shows the item in the Done section with estimate 5 (real-time sync)
  await expect(bobPage.locator('.done-item')).toBeVisible();
  await expect(bobPage.locator('.done-item .item-label')).toContainText('User can log in');
  await expect(bobPage.locator('.done-item .estimate-badge')).toContainText('5');
});
