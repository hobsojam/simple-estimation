const { test, expect } = require('@playwright/test');

test('bucket: download CSV after sizing items', async ({ page, request }) => {
  const res = await request.post('/api/rooms', { data: { type: 'bucket' } });
  const { id } = await res.json();

  await page.goto(`/?room=${id}`);
  await page.getByLabel('Your name').fill('Alice');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByRole('button', { name: 'Leave Room' })).toBeVisible();

  // Download CSV button is absent before any item is sized
  await expect(page.getByRole('button', { name: 'Download CSV' })).not.toBeVisible();

  // Facilitator adds two items
  await page.getByPlaceholder('Add new item…').fill('User login');
  await page.getByRole('button', { name: 'Add Item' }).click();
  await page.getByPlaceholder('Add new item…').fill('Password reset');
  await page.getByRole('button', { name: 'Add Item' }).click();

  await expect(page.getByText('User login')).toBeVisible();
  await expect(page.getByText('Password reset')).toBeVisible();

  // Move one item to the S bucket via keyboard (Enter cycles to next bucket)
  const loginCard = page.getByRole('button', { name: 'User login' });
  await loginCard.focus();
  await page.keyboard.press('Enter'); // null → XS
  await page.keyboard.press('Enter'); // XS → S

  // Download CSV button now appears
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeVisible();

  // Trigger download and verify filename
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^estimation-[a-f0-9]{8}\.csv$/);
});

test('relative: download CSV after placing items', async ({ page, request }) => {
  const res = await request.post('/api/rooms', { data: { type: 'relative' } });
  const { id } = await res.json();

  await page.goto(`/?room=${id}`);
  await page.getByLabel('Your name').fill('Alice');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByRole('button', { name: 'Leave Room' })).toBeVisible();

  // Download CSV button is absent before any item is placed
  await expect(page.getByRole('button', { name: 'Download CSV' })).not.toBeVisible();

  // Facilitator adds an item
  await page.getByPlaceholder('Add new item…').fill('Dark mode toggle');
  await page.getByRole('button', { name: 'Add Item' }).click();
  await expect(page.getByText('Dark mode toggle')).toBeVisible();

  // Move item to a column via keyboard
  const itemCard = page.getByRole('button', { name: 'Dark mode toggle' });
  await itemCard.focus();
  await page.keyboard.press('Enter'); // null → 1

  // Download CSV button now appears
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeVisible();

  // Trigger download and verify filename
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^estimation-[a-f0-9]{8}\.csv$/);
});
