import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The item page's tabs (Details, Relationships, History) exist only while the
 * page is STACKED (the docked pane, a narrow window, mobile). From the
 * two-column width (the `.item-layout` container at 860px or more) the strip is
 * hidden and every panel shows in one scroll, like Linear's issue page
 * (SPEC-24 / TASK-31). A spec that needs a panel therefore opens its tab when
 * the page is stacked, and only checks that the panel is already showing when
 * it is wide. Either way the panel is visible afterwards, so what the spec
 * asserts next is unchanged.
 *
 * `scope` is whatever holds ONE item page: the page itself, or a column or pane
 * locator when two are open (master and pane).
 */
export type ItemTabName = 'Details' | 'Relationships' | 'History';

export const WIDE_PAGE_PX = 860;

/** The page's width as the grid sees it, which is what decides stacked or wide. */
export async function itemLayoutWidth(scope: Page | Locator): Promise<number> {
	const layout = scope.locator('.item-layout').first();
	await expect(layout).toBeVisible();
	const box = await layout.boundingBox();
	if (!box) throw new Error('the item page has no layout box');
	return box.width;
}

export async function openTab(scope: Page | Locator, name: ItemTabName | RegExp): Promise<void> {
	const width = await itemLayoutWidth(scope);
	const tab = scope.getByRole('tab', { name });
	if (width >= WIDE_PAGE_PX) {
		// No strip here; every panel is already showing.
		await expect(scope.locator('.pane-tabs').first(), 'a wide item page has no tab strip').toBeHidden();
		const label = name instanceof RegExp ? name : new RegExp(`^${name}$`);
		await expect(scope.getByRole('tabpanel', { name: label }).first(), `the ${String(name)} panel shows without its tab`).toBeVisible();
		return;
	}
	await tab.click();
	await expect(tab, `the ${String(name)} tab is selected after a click`).toHaveAttribute('aria-selected', 'true');
}
