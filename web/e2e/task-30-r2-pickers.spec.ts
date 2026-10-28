import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect, type SuiteFixture } from './fixtures';
import { browserLogin } from './lib/collab-helpers';

/**
 * TASK-30, review round 2: the Popover + Command pickers (status, priority,
 * icon) and the palette, in a real browser, DARK.
 *
 *  - an outside press on another field leaves focus on that field (the
 *    popover used to trap focus and pull it back, ending on <body>);
 *  - Escape with the item pane open closes the picker and leaves the pane;
 *  - the panel does not float once its card scrolls out of the lane;
 *  - axe is clean on the open pickers (the shared Command grays clear 4.5:1);
 *  - the palette's and the Command's search rows show focus.
 */

const EVIDENCE = join(process.env.PAD_EVIDENCE_DIR ?? join(homedir(), '.cache', 'spec24-evidence', 'TASK-30'));

function authHeaders(fixture: SuiteFixture) {
	return { Authorization: `Bearer ${fixture.apiToken}`, 'Content-Type': 'application/json' };
}

async function dark(page: Page) {
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	// The chips fade their colours; scan and shoot only once every transition ended.
	await page.evaluate(async () => {
		for (;;) {
			void getComputedStyle(document.documentElement).color;
			const live = document
				.getAnimations()
				.filter((a) => a instanceof CSSTransition && a.playState !== 'finished' && a.playState !== 'idle');
			if (live.length === 0) return;
			await Promise.all(live.map((a) => a.finished.catch(() => undefined)));
		}
	});
}

/** A fresh startup workspace, so the board holds only what the test seeded. */
async function freshWorkspace(page: Page, fixture: SuiteFixture, titles: string[]) {
	const created = await page.request.post('/api/v1/workspaces', {
		headers: authHeaders(fixture),
		data: { name: `P30 ${Date.now()}${Math.floor(Math.random() * 1e4)}`, template: 'startup' },
	});
	expect(created.ok(), await created.text()).toBeTruthy();
	const ws = ((await created.json()) as { slug: string }).slug;
	const slugs: string[] = [];
	for (const title of titles) {
		const r = await page.request.post(`/api/v1/workspaces/${ws}/collections/tasks/items`, {
			headers: authHeaders(fixture),
			data: { title, fields: JSON.stringify({ status: 'open' }) },
		});
		expect(r.ok(), await r.text()).toBeTruthy();
		slugs.push(((await r.json()) as { slug: string }).slug);
	}
	return { ws, slugs };
}

const card = (page: Page, title: string) =>
	page.locator('.board-view .item-card').filter({ has: page.locator('.card-title', { hasText: title }) });
const statusPanel = (page: Page) => page.getByRole('dialog', { name: 'Status' });

test.describe('TASK-30 r2: Popover + Command pickers', () => {
	test.beforeEach(async ({ page }, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop-chromium', 'the popover is the desktop picker; mobile keeps the sheet');
		mkdirSync(EVIDENCE, { recursive: true });
		await page.setViewportSize({ width: 1280, height: 800 });
		await browserLogin(page);
		// The app pins its theme from storage; dark is set before any page loads.
		await page.addInitScript(() => localStorage.setItem('pad-theme', 'dark'));
	});

	test('an outside press on a text field closes the picker and leaves focus on that field', async ({ page, fixture }) => {
		const title = `Press ${Date.now()}`;
		const { ws } = await freshWorkspace(page, fixture, [title]);
		await page.goto(`/${fixture.adminUsername}/${ws}/tasks`);
		await dark(page);
		await expect(card(page, title)).toBeVisible();

		// A real field to press: the board's own are behind menus, this one is
		// always there and at a known place.
		await page.evaluate(() => {
			const input = document.createElement('input');
			input.id = 'press-probe';
			input.setAttribute('aria-label', 'Probe');
			input.placeholder = 'Type here';
			input.style.cssText = 'position:fixed;left:16px;bottom:16px;width:240px;z-index:50';
			document.body.appendChild(input);
		});

		const chip = card(page, title).locator('[title="Change status"]');
		await chip.click();
		await expect(statusPanel(page)).toBeVisible();
		await expect(statusPanel(page).locator('[data-slot="command-input"]')).toBeFocused();

		await page.locator('#press-probe').click();
		await expect(statusPanel(page)).toBeHidden();
		await expect(page.locator('#press-probe')).toBeFocused();
		await page.keyboard.type('still typing');
		await expect(page.locator('#press-probe')).toHaveValue('still typing');
		await page.screenshot({ path: join(EVIDENCE, 'r2-picker-outside-press-focus.png') });
	});

	test('the chip returns focus after Escape, a pick and a second click', async ({ page, fixture }) => {
		const title = `Focus ${Date.now()}`;
		const { ws } = await freshWorkspace(page, fixture, [title]);
		await page.goto(`/${fixture.adminUsername}/${ws}/tasks`);
		const chip = card(page, title).locator('[title="Change status"]');

		await chip.click();
		await expect(statusPanel(page)).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(statusPanel(page)).toBeHidden();
		await expect(chip).toBeFocused();

		await chip.click();
		await expect(statusPanel(page)).toBeVisible();
		await chip.click();
		await expect(statusPanel(page)).toBeHidden();
		await expect(chip).toBeFocused();

		await chip.click();
		await statusPanel(page).getByRole('option', { name: /in.progress/i }).click();
		await expect(statusPanel(page)).toBeHidden();
		await expect(card(page, title).locator('[title="Change status"]')).toHaveText(/In.Progress/i);
	});

	test('Escape closes the picker and leaves the open item pane, with focus in the panel or outside it', async ({ page, fixture }) => {
		const a = `Pane A ${Date.now()}`;
		const b = `Pane B ${Date.now()}`;
		const { ws, slugs } = await freshWorkspace(page, fixture, [a, b]);
		await page.goto(`/${fixture.adminUsername}/${ws}/tasks?item=${slugs[0]}`);
		const pane = page.locator('.item-pane');
		await expect(pane).toBeVisible();
		await expect(pane.locator('.title', { hasText: a })).toBeVisible();

		const chip = card(page, b).locator('[title="Change status"]');
		await chip.click();
		await expect(statusPanel(page)).toBeVisible();

		// Focus in the panel (its search field).
		await page.keyboard.press('Escape');
		await expect(statusPanel(page)).toBeHidden();
		await expect(pane).toBeVisible();
		await expect(page).toHaveURL(new RegExp(`item=${slugs[0]}`));

		// Focus outside the panel: on the card behind it.
		await chip.click();
		await expect(statusPanel(page)).toBeVisible();
		await card(page, b).locator('a').first().focus();
		await expect(statusPanel(page)).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(statusPanel(page)).toBeHidden();
		await expect(pane).toBeVisible();
		await expect(page).toHaveURL(new RegExp(`item=${slugs[0]}`));
	});

	test('the panel closes once its card scrolls out of the lane, and not before', async ({ page, fixture }) => {
		const titles = Array.from({ length: 40 }, (_, i) => `Scroll ${String(i).padStart(2, '0')} ${Date.now()}`);
		const { ws } = await freshWorkspace(page, fixture, titles);
		await page.goto(`/${fixture.adminUsername}/${ws}/tasks`);
		const lane = page.locator('.board-view .column-cards').first();
		const first = lane.locator('.item-card').first();
		await expect(first).toBeVisible();
		const scrollable = await lane.evaluate((el) => el.scrollHeight - el.clientHeight);
		expect(scrollable, 'precondition: the lane scrolls').toBeGreaterThan(300);

		await first.locator('[title="Change status"]').click();
		await expect(statusPanel(page)).toBeVisible();

		// A nudge that leaves the card in sight keeps the panel.
		await lane.evaluate((el) => (el.scrollTop = 8));
		await page.waitForTimeout(150);
		await expect(statusPanel(page)).toBeVisible();

		// Scrolled until the card is clipped: the panel is gone, not floating.
		await lane.evaluate((el) => (el.scrollTop = el.scrollHeight));
		await expect(statusPanel(page)).toBeHidden();
		await expect(page.locator('[data-slot="popover-content"]')).toHaveCount(0);
		const clipped = await first.evaluate((el) => {
			const r = el.getBoundingClientRect();
			const l = el.closest('.column-cards')!.getBoundingClientRect();
			return r.bottom <= l.top;
		});
		expect(clipped, 'precondition: the card really left the lane').toBe(true);
	});

	test('axe is clean on the open status picker and the open icon picker, dark', async ({ page, fixture }) => {
		const title = `Axe ${Date.now()}`;
		const { ws } = await freshWorkspace(page, fixture, [title]);
		await page.goto(`/${fixture.adminUsername}/${ws}/tasks`);
		await dark(page);
		await expect(card(page, title)).toBeVisible();

		// Status: rows with the gray digit hints. (A search with no match leaves an
		// option-less listbox, which axe flags as aria-required-children: that is
		// bits-ui's Command, not scanned here.)
		await card(page, title).locator('[title="Change status"]').click();
		await expect(statusPanel(page)).toBeVisible();
		await page.keyboard.press('ArrowDown');
		await dark(page);
		const rows = await new AxeBuilder({ page }).include('[data-slot="popover-content"]').analyze();
		expect(rows.violations.map((v) => `${v.id}: ${v.help}`), 'axe on the open status picker').toEqual([]);
		await page.keyboard.press('Escape');

		// Icon: group headings over the grid, inside a real dialog.
		await page.goto(`/${fixture.adminUsername}/${ws}/roles`);
		await page.getByRole('button', { name: /add role/i }).first().click();
		const dialog = page.getByRole('dialog', { name: 'New Role' });
		await expect(dialog).toBeVisible();
		await dark(page);
		await dialog.locator('.emoji-picker-button button.trigger').click();
		const picker = page.getByRole('dialog', { name: 'Pick an icon' });
		await expect(picker).toBeVisible();
		await expect(picker.locator('[data-slot="command-group-heading"], [data-command-group-heading]').first()).toBeVisible();
		const icons = await new AxeBuilder({ page }).include('[data-slot="popover-content"]').analyze();
		expect(
			icons.violations.map((v) => `${v.id}: ${v.help} :: ${v.nodes.map((n) => n.html.slice(0, 200) + ' ' + n.failureSummary?.replace(/\s+/g, ' ')).join(' | ')}`),
			'axe on the open icon picker'
		).toEqual([]);
	});

	// axe cannot judge these grays: it reports the oklch() text as "incomplete",
	// not as a violation. So the ratio is computed here from what the browser
	// paints (a 1px canvas takes any CSS colour and composites the row's
	// translucent highlight over the popover).
	test('the Command grays clear 4.5:1 on the popover and on the highlighted row', async ({ page, fixture }) => {
		const title = `Gray ${Date.now()}`;
		const { ws } = await freshWorkspace(page, fixture, [title]);
		await page.goto(`/${fixture.adminUsername}/${ws}/tasks`);
		await dark(page);

		const ratios = (selector: string) =>
			page.evaluate((sel) => {
				const rgb = (layers: string[]) => {
					const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
					ctx.canvas.width = ctx.canvas.height = 1;
					for (const l of layers) {
						ctx.fillStyle = l;
						ctx.fillRect(0, 0, 1, 1);
					}
					return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
				};
				const lum = (c: number[]) => {
					const [r, g, b] = c.map((v) => {
						const x = v / 255;
						return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
					});
					return 0.2126 * r + 0.7152 * g + 0.0722 * b;
				};
				const ratio = (a: number[], b: number[]) => {
					const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
					return (hi + 0.05) / (lo + 0.05);
				};
				const panel = document.querySelector('[data-slot="popover-content"]')!;
				const popover = getComputedStyle(panel).backgroundColor;
				const out: { text: string; onPopover: number; onRow: number }[] = [];
				for (const el of Array.from(document.querySelectorAll(sel))) {
					const cs = getComputedStyle(el, sel.includes('placeholder') ? '::placeholder' : null);
					const fg = rgb([cs.color]);
					const row = document.querySelector('[data-slot="command-item"][data-selected]');
					const rowBg = row ? getComputedStyle(row).backgroundColor : popover;
					out.push({
						text: (el.textContent || (el as HTMLInputElement).placeholder || '').trim().slice(0, 20),
						onPopover: ratio(fg, rgb([popover])),
						onRow: ratio(fg, rgb([popover, rowBg])),
					});
				}
				return out;
			}, selector);
		const clear = (rows: { text: string; onPopover: number; onRow: number }[], what: string) => {
			expect(rows.length, `${what}: something to measure`).toBeGreaterThan(0);
			for (const r of rows) {
				expect(r.onPopover, `${what} "${r.text}" on the popover`).toBeGreaterThanOrEqual(4.5);
				expect(r.onRow, `${what} "${r.text}" on the highlighted row`).toBeGreaterThanOrEqual(4.5);
			}
		};

		await card(page, title).locator('[title="Change status"]').click();
		await expect(statusPanel(page)).toBeVisible();
		await page.keyboard.press('ArrowDown');
		clear(await ratios('[data-slot="command-shortcut"]'), 'the digit hints');
		clear(await ratios('[data-slot="command-input"]'), 'the placeholder');
		await page.keyboard.type('zzzz');
		await expect(statusPanel(page).getByText('No results')).toBeVisible();
		clear(await ratios('[data-slot="command-empty"]'), 'the empty line');
		await page.keyboard.press('Escape');

		await page.goto(`/${fixture.adminUsername}/${ws}/roles`);
		await page.getByRole('button', { name: /add role/i }).first().click();
		const dialog = page.getByRole('dialog', { name: 'New Role' });
		await dark(page);
		await dialog.locator('.emoji-picker-button button.trigger').click();
		await expect(page.getByRole('dialog', { name: 'Pick an icon' })).toBeVisible();
		clear(await ratios('[data-command-group-heading]'), 'the group headings');
	});

	test('the icon picker opens on the current icon, marked', async ({ page, fixture }) => {
		const { ws } = await freshWorkspace(page, fixture, []);
		await page.goto(`/${fixture.adminUsername}/${ws}/roles`);
		await page.getByRole('button', { name: /add role/i }).first().click();
		const dialog = page.getByRole('dialog', { name: 'New Role' });
		await expect(dialog).toBeVisible();
		await dark(page);
		const trigger = dialog.locator('.emoji-picker-button button.trigger');
		const picker = page.getByRole('dialog', { name: 'Pick an icon' });
		// A new role has no icon yet: choose one, then reopen on it.
		await trigger.click();
		await picker.getByRole('option', { name: /rocket/i }).first().click();
		await expect(picker).toBeHidden();
		const current = (await trigger.textContent())?.trim() ?? '';
		expect(current).toBe('🚀');
		await trigger.click();
		await expect(picker).toBeVisible();
		const marked = picker.locator('[role="option"][aria-checked="true"]');
		await expect(marked).toHaveCount(1);
		expect((await marked.textContent())?.trim()).toBe(current);
		// Marked by more than a fill: at open the current icon is also the
		// highlighted one, and the highlight's fill outranks a checked fill.
		const ring = (loc: ReturnType<typeof picker.locator>) => loc.first().evaluate((el) => getComputedStyle(el).boxShadow);
		expect(await ring(marked), 'the current icon carries a ring').not.toBe('none');
		expect(await ring(picker.locator('[role="option"][aria-checked="false"]')), 'the others do not').toBe('none');
		await page.screenshot({ path: join(EVIDENCE, 'r2-emoji-open-current.png') });
	});

	test('the search rows show focus: the palette and the Command', async ({ page, fixture }) => {
		const title = `Row ${Date.now()}`;
		const { ws } = await freshWorkspace(page, fixture, [title]);
		await page.goto(`/${fixture.adminUsername}/${ws}/tasks`);
		await dark(page);
		await expect(card(page, title)).toBeVisible();

		const indicator = (selector: string) =>
			page.locator(selector).first().evaluate((el) => {
				const s = getComputedStyle(el);
				return { shadow: s.boxShadow, border: s.borderBottomColor };
			});

		// The Command's row in the status picker.
		await card(page, title).locator('[title="Change status"]').click();
		const input = statusPanel(page).locator('[data-slot="command-input"]');
		await expect(input).toBeFocused();
		const focused = await indicator('[data-slot="command-input-wrapper"]');
		expect(focused.shadow, 'the focused Command row draws a line').not.toBe('none');
		await input.evaluate((el) => (el as HTMLInputElement).blur());
		const blurred = await indicator('[data-slot="command-input-wrapper"]');
		expect(blurred.shadow).toBe('none');
		expect(blurred.border).not.toBe(focused.border);
		await page.keyboard.press('Escape');

		// The palette's row.
		await page.keyboard.press('Control+k');
		const search = page.locator('.palette .search-input');
		await expect(search).toBeFocused();
		const open = await indicator('.palette .search-row');
		expect(open.shadow, 'the focused palette row draws a line').not.toBe('none');
		await search.evaluate((el) => (el as HTMLInputElement).blur());
		const idle = await indicator('.palette .search-row');
		expect(idle.shadow).toBe('none');
		expect(idle.border).not.toBe(open.border);
		await search.focus();
		await page.keyboard.type('Row');
		await page.screenshot({ path: join(EVIDENCE, 'r2-palette-search-focus.png') });
	});
});
