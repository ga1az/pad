import { test, expect } from './fixtures';
import { browserLogin, seedDoc } from './lib/collab-helpers';
import { authJson } from './lib/attachment-viewer';
import type { Locator, Page } from '@playwright/test';

/**
 * BUG-3231: menus that closed on a window CLICK outside them closed when a drag
 * started inside and was released outside, because that click lands on a
 * common ancestor outside the menu. They now dismiss through `clickOutside`,
 * which decides on the press.
 *
 * Each leg drags with a real mouse from inside the menu to a point outside it
 * and asserts the menu is still open, then presses that point and asserts it
 * closes, so a menu that simply stopped closing fails the second half.
 */

const DESKTOP = { width: 1280, height: 800 };
const OUTSIDE = { x: 640, y: DESKTOP.height - 20 };

async function dragOut(page: Page, from: Locator) {
	const box = await from.boundingBox();
	if (!box) throw new Error('drag source has no box');
	await page.mouse.move(box.x + 4, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
	await page.mouse.move(OUTSIDE.x, OUTSIDE.y, { steps: 10 });
	await page.mouse.up();
}

test.describe('BUG-3231: a drag started inside a menu and released outside does not close it', () => {
	test.beforeEach(async ({ page }, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop-chromium', 'a mouse-drag concern; one desktop browser is enough');
		await page.setViewportSize(DESKTOP);
		await browserLogin(page);
	});

	test('field picker popover (item page status)', async ({ page, fixture, request }) => {
		const stamp = Date.now();
		const resp = await request.post(`/api/v1/workspaces/${fixture.workspaceSlug}/collections/tasks/items`, {
			headers: authJson(fixture),
			data: { title: `Menu drag ${stamp}`, content: '', fields: JSON.stringify({ status: 'open' }) },
		});
		expect(resp.ok(), await resp.text()).toBeTruthy();
		const { slug } = (await resp.json()) as { slug: string };
		await page.goto(`/${fixture.adminUsername}/${fixture.workspaceSlug}/tasks/${slug}`);

		// The item page's status is the status picker's row (TASK-31): a
		// Popover + Command, which closes on the press, not on a drag's click.
		const trigger = page.locator('.item-aside button.picker-row', { hasText: 'Open' }).first();
		await expect(trigger).toBeVisible({ timeout: 15_000 });
		await trigger.click();
		const list = page.locator('[data-slot="popover-content"]');
		await expect(list).toBeVisible();

		await dragOut(page, list.getByRole('option').first());
		await expect(list).toBeVisible();

		await page.mouse.click(OUTSIDE.x, OUTSIDE.y);
		await expect(list).toBeHidden();
	});

	// The boxed FieldEditor select (`.select-dropdown`, closed by `clickOutside`)
	// no longer ships on the item page, whose properties are pickers (TASK-31),
	// but it is still the control the copy dialog hands a destination field's value
	// to. That dropdown keeps its own drag-out leg here.
	test('field select dropdown (FieldEditor, form appearance, in the copy dialog)', async ({ page, fixture, request }) => {
		const headers = authJson(fixture);
		const wsName = `Drag Dest ${Date.now()}`;
		const wsResp = await request.post('/api/v1/workspaces', { headers, data: { name: wsName, template: 'blank' } });
		expect(wsResp.ok(), await wsResp.text()).toBeTruthy();
		const dest = (await wsResp.json()) as { slug: string };
		const collResp = await request.post(`/api/v1/workspaces/${dest.slug}/collections`, {
			headers,
			data: {
				name: 'Bugs',
				slug: 'bugs',
				schema: JSON.stringify({
					fields: [{ key: 'severity', label: 'Severity', type: 'select', options: ['low', 'high'], required: true }],
				}),
			},
		});
		expect(collResp.ok(), await collResp.text()).toBeTruthy();
		const { slug } = await seedDoc(fixture, request, 'Select drag');
		await page.goto(`/${fixture.adminUsername}/${fixture.workspaceSlug}/docs/${slug}`);

		await page.getByRole('button', { name: 'More item actions' }).first().click();
		await page.getByRole('menuitem', { name: 'Copy or move to workspace…' }).click();
		const dialog = page.getByRole('dialog', { name: /^Copy or move / });
		await expect(dialog).toBeVisible();
		await dialog.getByLabel('Workspace', { exact: true }).selectOption(dest.slug);
		const preflight = page.waitForResponse((r) => r.url().includes('/copy/preflight') && r.status() === 200);
		await dialog.getByLabel('Collection', { exact: true }).selectOption('bugs');
		await preflight;

		await dialog.locator('.select-trigger').click();
		const list = dialog.locator('.select-dropdown[role="listbox"]');
		await expect(list).toBeVisible();

		// Press an option, release outside the list (on the dialog's own heading,
		// so the dialog itself stays): the click lands on a common ancestor.
		const heading = dialog.getByRole('heading').first();
		const box = await heading.boundingBox();
		if (!box) throw new Error('the dialog heading has no box');
		const outside = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
		const opt = await list.getByRole('option').first().boundingBox();
		if (!opt) throw new Error('the option has no box');
		await page.mouse.move(opt.x + 4, opt.y + opt.height / 2);
		await page.mouse.down();
		await page.mouse.move(opt.x + opt.width / 2, opt.y + opt.height / 2, { steps: 4 });
		await page.mouse.move(outside.x, outside.y, { steps: 10 });
		await page.mouse.up();
		await expect(list).toBeVisible();
		await expect(dialog).toBeVisible();

		// A real press outside closes it (and only it).
		await page.mouse.click(outside.x, outside.y);
		await expect(list).toBeHidden();
		await expect(dialog).toBeVisible();
	});

	test('board lane actions menu, tag input (BoardView)', async ({ page, fixture, request }) => {
		const stamp = Date.now();
		const resp = await request.post(`/api/v1/workspaces/${fixture.workspaceSlug}/collections/tasks/items`, {
			headers: authJson(fixture),
			data: { title: `Lane drag ${stamp}`, content: '', fields: JSON.stringify({ status: 'open' }) },
		});
		expect(resp.ok(), await resp.text()).toBeTruthy();
		await page.goto(`/${fixture.adminUsername}/${fixture.workspaceSlug}/tasks?view=board`);

		const kebab = page.locator('.lane-menu-btn').first();
		await expect(kebab).toBeVisible({ timeout: 15_000 });
		await kebab.click();
		const first = page.getByRole('menuitem').first();
		await expect(first).toBeVisible();

		// Press a menu row and release outside: the click lands on a common
		// ancestor outside the menu, which the old window closer took for an
		// outside click. (A drag out of the tag INPUT does not reproduce in
		// Chromium, whose text-selection drag keeps the release on the input.)
		await dragOut(page, first);
		await expect(first).toBeVisible();

		await page.mouse.click(OUTSIDE.x, OUTSIDE.y);
		await expect(first).toBeHidden();
	});
});
