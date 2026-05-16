const { test, expect } = require('@playwright/test');

test('navigating to a nonexistent room shows a not-found error', async ({ page }) => {
  await page.goto('/?room=00000000-0000-0000-0000-000000000000');

  await expect(page.getByRole('alert')).toContainText(/room not found/i);
  await expect(page.getByRole('button', { name: 'Leave Room' })).not.toBeVisible();
});
