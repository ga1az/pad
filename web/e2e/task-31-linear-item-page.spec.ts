import { test, expect } from './fixtures';
import { browserLogin } from './lib/collab-helpers';
import type { APIRequestContext, Page } from '@playwright/test';
import type { SuiteFixture } from './fixtures';

/**
 * TASK-31 (SPEC-24): the item page as Linear's issue view, measured.
 *
 * Wide (the `.item-layout` container at 860px or more): one scroll with no tabs
 * (the body right under the title, then the sub-issues, then the relationships,
 * then ONE Activity stream: a heading, the comment box, the history), the
 * properties column on the right, sticky, with a text field's label above its
 * full text; the Summary block is hidden and its Copy is in the ⋯ menu.
 * Stacked (the docked pane, a narrow window, mobile): the tabs stay, the
 * properties show on Details only, the Summary is closed and below the body.
 *
 * jsdom computes no layout, so all of this is e2e.
 */

const LONG =
	'En staging por WhatsApp: audio «¿puedes escuchar audios?» → responde que sí; sin audit_held. Luego confirmar con un segundo número que el mensaje de voz llega transcrito, y que el hilo conserva el contexto durante diez turnos.';

function headers(fixture: SuiteFixture) {
	return { Authorization: `Bearer ${fixture.apiToken}`, 'Content-Type': 'application/json' };
}

async function seed(fixture: SuiteFixture, request: APIRequestContext) {
	const stamp = Date.now();
	const slug = `lin${stamp}`;
	const coll = await request.post(`/api/v1/workspaces/${fixture.workspaceSlug}/collections`, {
		headers: headers(fixture),
		data: {
			name: `Lin ${stamp}`,
			slug,
			schema: JSON.stringify({
				fields: [
					{ key: 'status', label: 'Status', type: 'select', options: ['open', 'done'], terminal_options: ['done'], default: 'open' },
					{ key: 'area', label: 'Area', type: 'select', options: ['web', 'api'] },
					{ key: 'points', label: 'Points', type: 'number' },
					{ key: 'how', label: 'How to verify', type: 'text' }
				]
			})
		}
	});
	if (!coll.ok()) throw new Error(`collection create failed (${coll.status()}): ${await coll.text()}`);
	const mk = async (title: string, extra: Record<string, unknown> = {}) => {
		const r = await request.post(`/api/v1/workspaces/${fixture.workspaceSlug}/collections/${slug}/items`, {
			headers: headers(fixture),
			data: { title, content: 'First paragraph of the body.\n\nSecond paragraph.', fields: JSON.stringify({ status: 'open', area: 'web', points: 5, how: LONG }), tags: JSON.stringify(['design']), ...extra }
		});
		if (!r.ok()) throw new Error(`item create failed (${r.status()}): ${await r.text()}`);
		return (await r.json()) as { id: string; slug: string };
	};
	const item = await mk(`Linear page ${stamp}`);
	for (const t of ['child one', 'child two']) {
		// A child names its parent in the reserved `parent` field (plan-3535 does the same).
		await mk(`${t} ${stamp}`, { fields: JSON.stringify({ status: 'open', area: 'api', parent: item.id }), tags: '[]' });
	}
	const cm = await request.post(`/api/v1/workspaces/${fixture.workspaceSlug}/items/${item.slug}/comments`, {
		headers: headers(fixture),
		data: { body: 'a seeded comment' }
	});
	if (!cm.ok()) throw new Error(`comment create failed (${cm.status()}): ${await cm.text()}`);
	return { slug, item };
}

const url = (f: SuiteFixture, coll: string, slug: string) => `/${f.adminUsername}/${f.workspaceSlug}/${coll}/${slug}`;

async function top(page: Page, selector: string): Promise<number> {
	const box = await page.locator(selector).first().boundingBox();
	if (!box) throw new Error(`${selector} has no box`);
	return box.y;
}

test.describe('TASK-31: the wide item page', () => {
	test.beforeEach(({}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop-chromium', 'the viewport is set explicitly');
	});

	test('reads body, sub-issues, relationships, then Activity, with no tabs and no Summary', async ({ page, fixture, request }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		const { slug, item } = await seed(fixture, request);
		await browserLogin(page);
		await page.goto(url(fixture, slug, item.slug));
		await expect(page.locator('.item-grid .title')).toBeVisible();
		const layout = (await page.locator('.item-layout').boundingBox())!;
		expect(layout.width).toBeGreaterThanOrEqual(860);

		// No tab strip, but every panel shows.
		await expect(page.locator('.pane-tabs')).toBeHidden();
		await expect(page.getByRole('tabpanel', { name: 'Details' })).toBeVisible();
		await expect(page.getByRole('tabpanel', { name: 'Relationships' })).toBeVisible();
		await expect(page.getByRole('tabpanel', { name: 'History' })).toBeVisible();
		// The Summary is not on the page.
		await expect(page.locator('.field-summary')).toBeHidden();

		await expect(page.locator('.item-body .ProseMirror')).toBeVisible();
		await expect(page.locator('#item-children')).toBeVisible();
		await expect(page.locator('.activity-heading')).toBeVisible();
		await expect(page.locator('#item-comments .compose')).toBeVisible();

		// The reading order, top to bottom.
		const ys = [
			await top(page, '.item-grid .title'),
			await top(page, '.item-head .meta-info'),
			await top(page, '.item-body .ProseMirror'),
			await top(page, '#item-children'),
			await top(page, '.activity-heading'),
			await top(page, '#item-comments .compose'),
			await top(page, '#item-timeline')
		];
		expect(ys, `title, meta, body, children, Activity, composer, history: ${ys.join(', ')}`).toEqual([...ys].sort((a, b) => a - b));
		// The body follows the title and meta line directly: nothing sits between them.
		const metaBottom = (await page.locator('.item-head .meta-info').boundingBox())!;
		const bodyTop = await top(page, '.item-body .ProseMirror');
		expect(bodyTop - (metaBottom.y + metaBottom.height), 'the body sits right under the meta line').toBeLessThan(110);
	});

	test('the properties column is on the right, sticky, and a text field reads in full under its label', async ({ page, fixture, request }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		const { slug, item } = await seed(fixture, request);
		await browserLogin(page);
		await page.goto(url(fixture, slug, item.slug));
		const aside = page.locator('.item-aside');
		await expect(aside).toBeVisible();
		const a = (await aside.boundingBox())!;
		const m = (await page.locator('.item-main').boundingBox())!;
		expect(a.x, 'the properties column is right of the main column').toBeGreaterThanOrEqual(m.x + m.width);
		expect(await aside.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');

		// The text field: label above, value at the column's width, all of it showing.
		const row = page.locator('.item-aside .field-row-text', { hasText: 'How to verify' });
		await expect(row).toBeVisible();
		const label = (await row.locator('.field-label').boundingBox())!;
		const area = row.locator('textarea');
		const box = (await area.boundingBox())!;
		expect(label.y + label.height, 'the label is above the value').toBeLessThanOrEqual(box.y + 1);
		expect(box.width, 'the value uses the column width').toBeGreaterThan(200);
		const fit = await area.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
		expect(fit.scroll, 'the whole text shows: the textarea grew to fit it').toBeLessThanOrEqual(fit.client + 1);
		expect(fit.client).toBeGreaterThan(60);
	});

	test('the ⋯ menu copies the Summary as Markdown', async ({ page, fixture, request, context }) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await page.setViewportSize({ width: 1440, height: 900 });
		const { slug, item } = await seed(fixture, request);
		await browserLogin(page);
		await page.goto(url(fixture, slug, item.slug));
		await page.getByRole('button', { name: 'More item actions' }).click();
		await page.getByRole('menuitem', { name: 'Copy as Markdown' }).click();
		await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('**How to verify:**');
	});

	test('a number\'s steppers do not move its digits, and a label links to its tag page', async ({ page, fixture, request }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		const { slug, item } = await seed(fixture, request);
		await browserLogin(page);
		await page.goto(url(fixture, slug, item.slug));
		const input = page.locator('.item-aside .field-row', { hasText: 'Points' }).locator('.number-input');
		await expect(input).toBeVisible();
		const before = (await input.boundingBox())!;
		const wrapper = page.locator('.item-aside .field-row', { hasText: 'Points' }).locator('.number-wrapper');
		await wrapper.hover();
		const dec = page.locator('.item-aside .field-row', { hasText: 'Points' }).getByRole('button', { name: 'Decrease' });
		await expect(dec).toHaveCSS('opacity', '1');
		const after = (await input.boundingBox())!;
		expect(after.x, 'the digits stay put when the value is pointed at').toBeCloseTo(before.x, 1);
		expect(after.width).toBeCloseTo(before.width, 1);
		// The stepper overlays the end of the row, clear of the digits.
		const d = (await dec.boundingBox())!;
		expect(d.x).toBeGreaterThanOrEqual(after.x + after.width - 1);

		// Labels are links to the tag page; the × is a separate button.
		const link = page.locator('.item-aside a.tag-link', { hasText: 'design' });
		await expect(link).toHaveAttribute('href', new RegExp(`/${fixture.workspaceSlug}/tags/design$`));
		await expect(page.getByRole('button', { name: 'Remove design' })).toBeVisible();
		await link.click();
		await expect(page).toHaveURL(new RegExp(`/tags/design$`));
	});

	test('the toolbar keeps round 28px buttons in a 264px column (a 312px pane), with an app action and count pills', async ({ page, fixture, request }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.route('**/items/*/app-actions', (route) =>
			route.fulfill({ json: [{ install_id: 'i1', app_title: 'Studio', action_key: 'open', label: 'Open in a very long Studio label' }] })
		);
		const { slug, item } = await seed(fixture, request);
		await browserLogin(page);
		await page.goto(url(fixture, slug, item.slug));
		await expect(page.locator('.meta-actions .tool-btn-count').first()).toBeVisible();
		await expect(page.locator('.app-action-btn')).toBeVisible();
		// The pane's inner width at its narrowest (312px, less its 24px padding either side).
		await page.locator('.item-layout').evaluate((el) => ((el as HTMLElement).style.width = '264px'));
		const m = await page.evaluate(() => {
			const bar = document.querySelector('.meta-actions')!;
			const barBox = bar.getBoundingClientRect();
			const circles = [...bar.querySelectorAll('button.tool-btn:not(.tool-btn-count), .quick-actions-menu > .trigger-btn')].map((b) => {
				const r = b.getBoundingClientRect();
				return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
			});
			const kids = [...bar.children].map((k) => k.getBoundingClientRect());
			return {
				circles,
				overflow: Math.max(...kids.map((r) => r.right)) - barBox.right,
				wrapped: barBox.height > Math.max(...kids.map((r) => r.height)) + 2
			};
		});
		expect(m.circles.length).toBeGreaterThan(3);
		for (const c of m.circles) expect(c, 'a round 28px button, not squeezed').toEqual({ w: 28, h: 28 });
		expect(m.wrapped, 'one row').toBe(false);
		expect(m.overflow, 'nothing runs past the toolbar').toBeLessThanOrEqual(0.5);
	});
});

test.describe('TASK-31: the stacked item page', () => {
	test.beforeEach(({}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop-chromium', 'the viewport is set explicitly');
	});

	test('the properties show on Details only: History starts at the tab strip', async ({ page, fixture, request }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		const { slug, item } = await seed(fixture, request);
		await browserLogin(page);
		// The docked pane: narrow whatever the screen.
		await page.goto(`/${fixture.adminUsername}/${fixture.workspaceSlug}/${slug}?item=${item.slug}`);
		const pane = page.locator('.item-layout').first();
		await expect(pane).toBeVisible();
		expect((await pane.boundingBox())!.width).toBeLessThan(560);
		const aside = pane.locator('.item-aside');
		await expect(aside).toBeVisible();
		const tabs = pane.locator('.pane-tabs');
		await expect(tabs).toBeVisible();
		// Details: the properties sit above the strip.
		expect((await aside.boundingBox())!.y).toBeLessThan((await tabs.boundingBox())!.y);

		await pane.getByRole('tab', { name: /History/ }).click();
		await expect(aside).toBeHidden();
		// History's content starts right under the strip: no property row above it.
		const panel = pane.getByRole('tabpanel', { name: 'History' });
		await expect(panel).toBeVisible();
		const gap = (await panel.boundingBox())!.y - ((await tabs.boundingBox())!.y + (await tabs.boundingBox())!.height);
		expect(gap).toBeLessThan(40);
		await pane.getByRole('tab', { name: 'Relationships' }).click();
		await expect(aside).toBeHidden();
		await pane.getByRole('tab', { name: 'Details' }).click();
		await expect(aside).toBeVisible();
	});

	test('the Summary is closed and below the body', async ({ page, fixture, request }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		const { slug, item } = await seed(fixture, request);
		await browserLogin(page);
		await page.goto(`/${fixture.adminUsername}/${fixture.workspaceSlug}/${slug}?item=${item.slug}`);
		const summary = page.locator('.item-layout').first().locator('.field-summary');
		await expect(summary).toBeVisible();
		expect(await summary.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
		const bodyBox = (await page.locator('.item-layout').first().locator('.item-body').boundingBox())!;
		expect((await summary.boundingBox())!.y).toBeGreaterThanOrEqual(bodyBox.y + bodyBox.height - 1);
	});
});

test.describe('TASK-31: phone touch targets', () => {
	test('property rows and toolbar buttons are at least 44px', async ({ page, fixture, request }, testInfo) => {
		test.skip(testInfo.project.name !== 'mobile-chromium', 'the ruling is <=768px');
		const { slug, item } = await seed(fixture, request);
		await browserLogin(page);
		await page.goto(url(fixture, slug, item.slug));
		await expect(page.locator('.item-aside .field-row').first()).toBeVisible();
		const small = await page.evaluate(() => {
			const out: string[] = [];
			for (const row of document.querySelectorAll('.item-aside .field-row')) {
				const h = row.getBoundingClientRect().height;
				if (h < 43.5) out.push(`row ${row.querySelector('.field-label')?.textContent}: ${h}`);
				for (const c of row.querySelectorAll('button:not(.number-btn):not(.tag-remove), input, textarea')) {
					const r = c.getBoundingClientRect();
					if (r.height > 0 && r.height < 43.5) out.push(`control in ${row.querySelector('.field-label')?.textContent ?? 'row'}: ${Math.round(r.height)}`);
				}
			}
			for (const b of document.querySelectorAll('.meta-actions button')) {
				const r = b.getBoundingClientRect();
				if (r.height < 43.5 || (r.width < 43.5 && !b.classList.contains('tool-btn-count'))) out.push(`toolbar ${b.getAttribute('aria-label') ?? b.getAttribute('title')}: ${r.width}x${r.height}`);
			}
			return out;
		});
		expect(small, 'every target is 44px').toEqual([]);
	});
});
