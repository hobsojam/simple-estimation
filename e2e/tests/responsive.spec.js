const { test, expect } = require('@playwright/test');

const VIEWPORTS = [
  ['iphone-se', { width: 320, height: 667 }],
  ['galaxy-s22', { width: 360, height: 780 }],
  ['large-phone', { width: 430, height: 932 }],
  ['phone-landscape', { width: 667, height: 320 }],
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

async function assertTouchTargets(page, label) {
  const undersizedControls = await page.evaluate(() => {
    const undersized = [];
    for (const el of document.querySelectorAll('button, input, select, [role="button"]')) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
        undersized.push(el.textContent.trim() || el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.tagName);
      }
    }
    return undersized;
  });

  expect(undersizedControls, `${label} should provide 44px touch targets`).toEqual([]);
}

async function assertStickyTopBar(page, label) {
  const position = await page.locator('.top-bar').evaluate(el => getComputedStyle(el).position);
  expect(position, `${label} should keep the room navigation visible`).toBe('sticky');
}

async function assertCompactJoinForm(page, label) {
  const marginTop = await page.locator('.join-form').evaluate(el => parseFloat(getComputedStyle(el).marginTop));
  expect(marginTop, `${label} should reduce the join form top margin`).toBeLessThanOrEqual(16);
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
      if (viewport.height <= 600) {
        await assertCompactJoinForm(page, `${viewportName} home`);
      }
      if (viewport.width <= 430) {
        await assertTouchTargets(page, `${viewportName} home`);
      }

      await joinRoom(page, request, 'planning-poker', `Poker ${viewportName}`);
      await addPlanningPokerItems(page);
      await assertNoPageOverflow(page, `${viewportName} planning poker`);
      await assertStickyTopBar(page, `${viewportName} planning poker`);
      if (viewport.width <= 430) {
        await assertTouchTargets(page, `${viewportName} planning poker`);
      }

      await joinRoom(page, request, 'bucket', `Bucket ${viewportName}`);
      await addMagicEstimationItems(page);
      await assertNoPageOverflow(page, `${viewportName} bucket estimation`);
      if (viewport.width <= 430) {
        await assertTouchTargets(page, `${viewportName} bucket estimation`);
      }

      await joinRoom(page, request, 'relative', `Relative ${viewportName}`);
      await addMagicEstimationItems(page);
      await assertNoPageOverflow(page, `${viewportName} relative estimation`);

      if (viewport.width <= 430) {
        await assertTouchTargets(page, `${viewportName} relative estimation`);
      }
    });
  }

  test('supports touch-friendly item movement on a phone', async ({ page, request }) => {
    await page.setViewportSize({ width: 360, height: 780 });

    await joinRoom(page, request, 'bucket', 'Bucket phone controls');
    await addMagicEstimationItems(page);
    await page.getByLabel('Move A long estimation item that should fit inside its card on phones to bucket').selectOption('M');
    await expect(page.getByRole('region', { name: 'M', exact: true })
      .getByRole('button', { name: 'A long estimation item that should fit inside its card on phones' })).toBeVisible();

    await joinRoom(page, request, 'relative', 'Relative phone controls');
    await addMagicEstimationItems(page);
    await page.getByLabel('Move A long estimation item that should fit inside its card on phones to estimate').selectOption('8');
    await expect(page.getByRole('region', { name: '8', exact: true })
      .getByRole('button', { name: 'A long estimation item that should fit inside its card on phones' })).toBeVisible();
  });
});
