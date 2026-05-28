const { test, expect } = require('@playwright/test');

const VIEWPORTS = [
  ['iphone-se', { width: 320, height: 667 }],
  ['galaxy-s22', { width: 360, height: 780 }],
  ['large-phone', { width: 430, height: 932 }],
  ['tablet', { width: 768, height: 1024 }],
  ['laptop', { width: 1366, height: 768 }],
  ['desktop', { width: 1440, height: 900 }],
];

async function assertNoPageOverflow(page, label) {
  const metrics = await page.evaluate(() => {
    const clippedControls = [];
    for (const el of document.querySelectorAll('button, input, select')) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.right > window.innerWidth + 1) {
        clippedControls.push(el.textContent.trim() || el.getAttribute('placeholder') || el.tagName);
      }
    }

    return {
      viewportWidth: window.innerWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      clippedControls,
    };
  });

  expect(metrics.scrollWidth, `${label} should not create document-level horizontal overflow`)
    .toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.clippedControls, `${label} should not clip visible controls off-screen`).toEqual([]);
}

async function joinRoom(page, request, type, name) {
  const res = await request.post('/api/rooms', { data: { type, name: `Responsive ${type}` } });
  expect(res.ok()).toBeTruthy();
  const { id } = await res.json();

  await page.goto(`/?room=${id}`);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByRole('button', { name: 'Leave Room' })).toBeVisible();
}

async function addPlanningPokerItems(page) {
  await page.getByPlaceholder('Add item…').fill('A long backlog item that should wrap instead of forcing horizontal page overflow');
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByPlaceholder('Add item…').fill('Short item');
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: 'Estimate' }).first().click();
  await expect(page.locator('.active-banner')).toBeVisible();
}

async function addMagicEstimationItems(page) {
  await page.getByPlaceholder('Add new item…').fill('A long estimation item that should fit inside its card on phones');
  await page.getByRole('button', { name: 'Add Item' }).click();
  await page.getByPlaceholder('Add new item…').fill('Another item');
  await page.getByRole('button', { name: 'Add Item' }).click();
}

test.describe('responsive layout', () => {
  for (const [viewportName, viewport] of VIEWPORTS) {
    test(`does not overflow or clip controls at ${viewportName}`, async ({ page, request }) => {
      await page.setViewportSize(viewport);

      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Simple Estimation' })).toBeVisible();
      await assertNoPageOverflow(page, `${viewportName} home`);

      await joinRoom(page, request, 'planning-poker', `Poker ${viewportName}`);
      await addPlanningPokerItems(page);
      await assertNoPageOverflow(page, `${viewportName} planning poker`);

      await joinRoom(page, request, 'bucket', `Bucket ${viewportName}`);
      await addMagicEstimationItems(page);
      await assertNoPageOverflow(page, `${viewportName} bucket estimation`);

      await joinRoom(page, request, 'relative', `Relative ${viewportName}`);
      await addMagicEstimationItems(page);
      await assertNoPageOverflow(page, `${viewportName} relative estimation`);
    });
  }
});
