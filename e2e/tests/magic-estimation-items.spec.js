const { test, expect } = require('@playwright/test');

async function joinRoom(page, request, type) {
  const res = await request.post('/api/rooms', { data: { type } });
  expect(res.ok()).toBeTruthy();
  const { id } = await res.json();

  await page.goto(`/?room=${id}`);
  await page.getByLabel('Your name').fill('Alice');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByRole('button', { name: 'Leave Room' })).toBeVisible();
}

async function addItem(page, label) {
  await page.getByPlaceholder('Add new item…').fill(label);
  await page.getByRole('button', { name: 'Add Item' }).click();
  await expect(page.getByRole('button', { name: label })).toBeVisible();
}

async function dragItemToRegion(page, itemLabel, regionName) {
  await page
    .getByRole('button', { name: itemLabel })
    .dragTo(page.getByRole('region', { name: regionName, exact: true }));
}

test('bucket: item remains visible after placement and can move to another bucket', async ({ page, request }) => {
  const itemLabel = 'Persist after bucket move';
  await joinRoom(page, request, 'bucket');
  await addItem(page, itemLabel);

  await dragItemToRegion(page, itemLabel, 'S');

  const smallBucket = page.getByRole('region', { name: 'S', exact: true });
  await expect(smallBucket.getByRole('button', { name: itemLabel })).toBeVisible();

  await dragItemToRegion(page, itemLabel, 'L');

  const largeBucket = page.getByRole('region', { name: 'L', exact: true });
  await expect(largeBucket.getByRole('button', { name: itemLabel })).toBeVisible();
  await expect(smallBucket.getByRole('button', { name: itemLabel })).not.toBeVisible();
});

test('relative: item remains visible after placement and can move to another estimate', async ({ page, request }) => {
  const itemLabel = 'Persist after relative move';
  await joinRoom(page, request, 'relative');
  await addItem(page, itemLabel);

  await dragItemToRegion(page, itemLabel, '3');

  const firstEstimate = page.getByRole('region', { name: '3', exact: true });
  await expect(firstEstimate.getByRole('button', { name: itemLabel })).toBeVisible();

  await dragItemToRegion(page, itemLabel, '8');

  const secondEstimate = page.getByRole('region', { name: '8', exact: true });
  await expect(secondEstimate.getByRole('button', { name: itemLabel })).toBeVisible();
  await expect(firstEstimate.getByRole('button', { name: itemLabel })).not.toBeVisible();
});

test('bucket: item can be placed with touch-friendly controls on mobile', async ({ page, request }) => {
  const itemLabel = 'Mobile bucket placement';
  await page.setViewportSize({ width: 360, height: 780 });
  await joinRoom(page, request, 'bucket');
  await addItem(page, itemLabel);

  await page.getByLabel(`Move ${itemLabel} to bucket`).selectOption('M');

  const mediumBucket = page.getByRole('region', { name: 'M', exact: true });
  await expect(mediumBucket.getByRole('button', { name: itemLabel })).toBeVisible();
});

test('relative: item can be placed with touch-friendly controls on mobile', async ({ page, request }) => {
  const itemLabel = 'Mobile relative placement';
  await page.setViewportSize({ width: 360, height: 780 });
  await joinRoom(page, request, 'relative');
  await addItem(page, itemLabel);

  await page.getByLabel(`Move ${itemLabel} to estimate`).selectOption('8');

  const estimateColumn = page.getByRole('region', { name: '8', exact: true });
  await expect(estimateColumn.getByRole('button', { name: itemLabel })).toBeVisible();
});
