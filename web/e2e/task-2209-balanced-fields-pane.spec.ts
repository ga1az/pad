import { test, expect } from './fixtures';
import { browserLogin } from './lib/collab-helpers';
import type { Page } from '@playwright/test';

/**
 * TASK-2209: the item page's layout follows the width of the ITEM, not the
 * viewport. The docked pane is ~400px on a 1440px screen, and a viewport query
 * kept a two-column fields grid there: the right column ran past the screen
 * edge (measured: Impact and Tags ended at x=1492 on a 1440px viewport).
 *
 * SPEC-24 / TASK-31 turned the page into a grid (`.item-grid`: the title and
 * body on the left, the properties on the right), and the same rule holds for
 * it: `.item-layout` is the query container, so the pane stacks the grid into
 * one column (head, properties, body) while the full page at the same viewport
 * keeps two. Inside the stacked pane the properties of a `balanced` collection
 * are still a compact block that must fit it.
 *
 * Mutation-tested: swapping the `@container` for a viewport `@media` fails the
 * pane leg (2 tracks); adding `contain: layout` to the container fails the
 * sheet leg (the overlay shrinks to the container). jsdom computes no layout,
 * so this is an e2e.
 */

async function seedIdea(fixture: import('./fixtures').SuiteFixture, request: import('@playwright/test').APIRequestContext, title: string) {
	const resp = await request.post(`/api/v1/workspaces/${fixture.workspaceSlug}/collections/ideas/items`, {
		headers: { Authorization: `Bearer ${fixture.apiToken}`, 'Content-Type': 'application/json' },
		data: { title, fields: JSON.stringify({ impact: 'high', category: 'pane width' }), content: '' }
	});
	if (!resp.ok()) throw new Error(`idea create failed (${resp.status()}): ${await resp.text()}`);
	return (await resp.json()) as { slug: string; ref: string };
}

/** The page grid's tracks and how far any property control reaches past its panel or the viewport. */
async function layoutGeometry(page: Page) {
	const panel = page.locator('.item-layout .fields-panel').first();
	await expect(panel).toBeVisible();
	await expect(panel.locator('.field-row', { hasText: 'Impact' })).toBeVisible();
	return panel.evaluate((el) => {
		const box = el.getBoundingClientRect();
		const rights = [...el.querySelectorAll('.field-row, .field-row *')].map((e) => e.getBoundingClientRect().right);
		const right = Math.max(...rights);
		const grid = el.closest('.item-grid') as HTMLElement;
		return {
			tracks: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
			layoutWidth: (el.closest('.item-layout') as HTMLElement).getBoundingClientRect().width,
			pastPanel: right - box.right,
			pastViewport: right - window.innerWidth
		};
	});
}

test.describe('TASK-2209: the item page layout follows the item, not the viewport', () => {
	test('in the docked pane on a wide screen the page is one column and nothing runs off screen', async ({ page, fixture, request }, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop-chromium', 'the viewport is set explicitly');
		await page.setViewportSize({ width: 1440, height: 900 });
		const idea = await seedIdea(fixture, request, `t2209 pane ${Date.now()}`);
		await browserLogin(page);
		await page.goto(`/${fixture.adminUsername}/${fixture.workspaceSlug}/ideas?item=${idea.ref}`);
		const g = await layoutGeometry(page);
		// The premise: this is the narrow pane, not the full page.
		expect(g.layoutWidth).toBeLessThan(560);
		expect(g.tracks).toBe(1);
		expect(g.pastPanel).toBeLessThanOrEqual(0.5);
		expect(g.pastViewport).toBeLessThanOrEqual(0);
	});

	test('CONTROL: on the full item page the same viewport keeps the properties in a second column', async ({ page, fixture, request }, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop-chromium', 'the viewport is set explicitly');
		await page.setViewportSize({ width: 1440, height: 900 });
		const idea = await seedIdea(fixture, request, `t2209 page ${Date.now()}`);
		await browserLogin(page);
		await page.goto(`/${fixture.adminUsername}/${fixture.workspaceSlug}/ideas/${idea.slug}`);
		const g = await layoutGeometry(page);
		expect(g.layoutWidth).toBeGreaterThanOrEqual(860);
		expect(g.tracks).toBe(2);
		expect(g.pastPanel).toBeLessThanOrEqual(0.5);
	});

	test('between 560px and 859px the page is stacked and the balanced properties are a two-column block that fits', async ({ page, fixture, request }, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop-chromium', 'the viewport is set explicitly');
		// A full page whose container is 560-859px: wide enough for the compact
		// two-column properties block, too narrow for the page's own two columns.
		await page.setViewportSize({ width: 1060, height: 900 });
		const idea = await seedIdea(fixture, request, `t2209 mid ${Date.now()}`);
		await browserLogin(page);
		await page.goto(`/${fixture.adminUsername}/${fixture.workspaceSlug}/ideas/${idea.slug}`);
		const g = await layoutGeometry(page);
		expect(g.layoutWidth).toBeGreaterThanOrEqual(560);
		expect(g.layoutWidth).toBeLessThan(860);
		// Stacked: one page column.
		expect(g.tracks).toBe(1);
		const panel = page.locator('.item-layout .fields-panel').first();
		const block = await panel.evaluate((el) => ({
			tracks: getComputedStyle(el).gridTemplateColumns.split(' ').length,
			display: getComputedStyle(el).display
		}));
		// The collection's balanced layout still shapes the compact block: two tracks, as a grid.
		expect(block.display).toBe('grid');
		expect(block.tracks).toBe(2);
		// And it fits: nothing runs past its panel or off the screen.
		expect(g.pastPanel).toBeLessThanOrEqual(0.5);
		expect(g.pastViewport).toBeLessThanOrEqual(0);
	});

	test('the mobile bottom sheet opened from a field is not trapped by the new container', async ({ page, fixture, request }, testInfo) => {
		test.skip(testInfo.project.name !== 'mobile-chromium', 'the BottomSheet only replaces the anchored panel at the mobile breakpoint');
		const idea = await seedIdea(fixture, request, `t2209 sheet ${Date.now()}`);
		await browserLogin(page);
		await page.goto(`/${fixture.adminUsername}/${fixture.workspaceSlug}/ideas/${idea.slug}`);
		const layout = page.locator('.item-layout').first();
		await expect.poll(() => layout.evaluate((el) => getComputedStyle(el).containerType)).toBe('inline-size');
		await layout.locator('.field-row', { hasText: 'Impact' }).locator('button.select-trigger').click();
		const overlay = page.locator('.bs-overlay');
		await expect(overlay).toBeVisible();
		// Inside the container, or this proves nothing about containment.
		expect(await overlay.evaluate((el) => !!el.closest('.item-layout'))).toBe(true);
		const box = (await overlay.boundingBox())!;
		const vp = page.viewportSize()!;
		expect(Math.round(box.width)).toBe(vp.width);
		expect(Math.round(box.height)).toBe(vp.height);
	});
});
