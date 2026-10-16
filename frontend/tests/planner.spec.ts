import { test, expect } from '@playwright/test';

test('demo: routes, map, forecast, comparison, export and explanation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A safer way forward.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Route 1/ }).first()).toBeVisible();
  await expect(page.locator('.route-card')).toHaveCount(3);
  await expect(page.getByRole('slider', { name: 'Forecast hour' })).toBeEnabled();
  await page.getByRole('slider', { name: 'Forecast hour' }).fill('24');
  await expect(page.locator('.forecast-hour')).toHaveText('+24h');
  await page.getByRole('button', { name: 'Compare routes' }).click();
  await expect(page.getByRole('columnheader', { name: 'Severe miles' })).toBeVisible();
  await page
    .getByRole('button', { name: /Checkpoints/ })
    .last()
    .click();
  await page.getByRole('button', { name: 'Show checkpoint 2 on map' }).click();
  await expect(page.locator('tr.focused')).toHaveCount(1);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export trip' }).click();
  expect((await downloadEvent).suggestedFilename()).toBe('spotter-demo-trip.json');
  await page.getByRole('button', { name: 'How it works' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: '10 mi' }).click();
  await expect(page.getByText(/Trip settings changed/)).toBeVisible();
  await page.getByRole('button', { name: 'Find safest routes' }).click();
  await expect(page.getByText(/Trip settings changed/)).not.toBeVisible();
  await expect(page.getByRole('slider', { name: 'Forecast hour' })).toBeEnabled();
  expect(errors).toEqual([]);
  await page.screenshot({ path: '../docs/desktop.png', fullPage: true });
});

test('mobile stays within the viewport and remains usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.route-card')).toHaveCount(3);
  await expect(page.getByRole('slider', { name: 'Forecast hour' })).toBeEnabled();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.getByRole('button', { name: 'Weather layer' }).click();
  await expect(page.getByRole('button', { name: 'Weather layer' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.screenshot({ path: '../docs/mobile.png', fullPage: true });
});

test('live city search, recalculation errors and stale data are explicit', async ({ page }) => {
  await page.route('**/api/places/**', (route) =>
    route.fulfill({ json: { places: [{ name: 'Paris, France', coordinate: [2.35, 48.85] }] } }),
  );
  await page.goto('/');
  await expect(page.locator('.route-card')).toHaveCount(3);
  await page.getByRole('button', { name: /Live planning/ }).click();
  const input = page.getByRole('combobox', { name: 'Origin' });
  await input.fill('Paris');
  await page.getByRole('option', { name: 'Paris, France' }).click();
  await expect(input).toHaveValue('Paris, France');
  await page.route('**/api/plan/', (route) =>
    route.fulfill({ status: 502, json: { error: 'Weather provider is temporarily unavailable.' } }),
  );
  await page.getByRole('button', { name: 'Find safest routes' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Weather provider is temporarily unavailable.',
  );
  await expect(page.getByText('Demo workspace')).not.toBeVisible();
  await expect(page.getByText(/Trip settings changed/)).toBeVisible();
});
