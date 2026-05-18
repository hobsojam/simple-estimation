const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test.describe('WCAG 2.1 AA — home page', () => {
  test('no axe violations on home page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Simple Estimation' })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('no axe violations on Create Room tab', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Create Room' }).click();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});

test.describe('WCAG 2.1 AA — planning poker room', () => {
  test('no axe violations in an active room', async ({ page, request }) => {
    const res = await request.post('/api/rooms', { data: { type: 'planning-poker' } });
    const { id } = await res.json();

    await page.goto(`/?room=${id}`);
    await page.getByPlaceholder('Enter your name').fill('Tester');
    await page.getByRole('button', { name: 'Join' }).click();
    await expect(page.getByRole('button', { name: 'Leave Room' })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('no axe violations after votes are revealed', async ({ page, request }) => {
    const res = await request.post('/api/rooms', { data: { type: 'planning-poker' } });
    const { id } = await res.json();

    await page.goto(`/?room=${id}`);
    await page.getByPlaceholder('Enter your name').fill('Tester');
    await page.getByRole('button', { name: 'Join' }).click();
    await expect(page.getByRole('button', { name: 'Leave Room' })).toBeVisible();

    await page.getByRole('button', { name: '5' }).first().click();
    await page.getByRole('button', { name: 'Reveal Votes' }).click();
    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});

test.describe('WCAG 2.1 AA — bucket estimation room', () => {
  test('no axe violations in an active room', async ({ page, request }) => {
    const res = await request.post('/api/rooms', { data: { type: 'bucket' } });
    const { id } = await res.json();

    await page.goto(`/?room=${id}`);
    await page.getByPlaceholder('Enter your name').fill('Tester');
    await page.getByRole('button', { name: 'Join' }).click();
    await expect(page.getByRole('button', { name: 'Leave Room' })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('no axe violations after an item is added', async ({ page, request }) => {
    const res = await request.post('/api/rooms', { data: { type: 'bucket' } });
    const { id } = await res.json();

    await page.goto(`/?room=${id}`);
    await page.getByPlaceholder('Enter your name').fill('Tester');
    await page.getByRole('button', { name: 'Join' }).click();
    await expect(page.getByRole('button', { name: 'Leave Room' })).toBeVisible();

    await page.getByPlaceholder('Add new item…').fill('Story A');
    await page.getByRole('button', { name: 'Add Item' }).click();
    await expect(page.getByRole('button', { name: 'Story A' })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});

test.describe('WCAG 2.1 AA — relative estimation room', () => {
  test('no axe violations in an active room', async ({ page, request }) => {
    const res = await request.post('/api/rooms', { data: { type: 'relative' } });
    const { id } = await res.json();

    await page.goto(`/?room=${id}`);
    await page.getByPlaceholder('Enter your name').fill('Tester');
    await page.getByRole('button', { name: 'Join' }).click();
    await expect(page.getByRole('button', { name: 'Leave Room' })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('no axe violations after an item is added', async ({ page, request }) => {
    const res = await request.post('/api/rooms', { data: { type: 'relative' } });
    const { id } = await res.json();

    await page.goto(`/?room=${id}`);
    await page.getByPlaceholder('Enter your name').fill('Tester');
    await page.getByRole('button', { name: 'Join' }).click();
    await expect(page.getByRole('button', { name: 'Leave Room' })).toBeVisible();

    await page.getByPlaceholder('Add new item…').fill('Story A');
    await page.getByRole('button', { name: 'Add Item' }).click();
    await expect(page.getByRole('button', { name: 'Story A' })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
