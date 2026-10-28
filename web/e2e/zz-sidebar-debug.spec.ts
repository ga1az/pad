import { test } from './fixtures';
for (const [name, vp] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 700, height: 900 }]] as const) {
	test(`sidebar dbg ${name}`, async ({ page, fixture }) => {
		await page.setViewportSize(vp);
		await page.goto(`/${fixture.adminUsername}/${fixture.workspaceSlug}`);
		await page.waitForTimeout(1500);
		const out = await page.evaluate(() => {
			const s = document.querySelector('.sidebar-footer .footer-row .settings-btn') as HTMLElement | null;
			if (!s) return 'none';
			const range = document.createRange();
			range.selectNodeContents(s);
			return {
				btn: s.getBoundingClientRect().toJSON(),
				cs: { h: getComputedStyle(s).height, lh: getComputedStyle(s).lineHeight, fs: getComputedStyle(s).fontSize, d: getComputedStyle(s).display, ai: getComputedStyle(s).alignItems },
				rects: [...range.getClientRects()].map((r) => ({ top: r.top, h: r.height, w: r.width })),
				kids: [...s.childNodes].filter((n) => n.nodeType !== 8).map((n) => (n.nodeType === 3 ? 'text:' + n.textContent!.trim() : (n as HTMLElement).tagName + ' ' + JSON.stringify((n as HTMLElement).getBoundingClientRect().toJSON()))),
				html: s.outerHTML.slice(0, 500)
			};
		});
		console.log('DBG', name, JSON.stringify(out, null, 1));
	});
}
