<script lang="ts">
	// The shadcn-svelte preview (SPEC-24 / TASK-25): every design token next to
	// the hex it was measured from (DOC-33), and the shadcn components in each
	// variant. It is evidence for the SPEC-24 tasks and is linked from nowhere.
	// Styled only with Tailwind utilities, so it also shows they work.
	import { onMount } from 'svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Add01Icon, ArrowRight01Icon, Delete02Icon } from '@hugeicons/core-free-icons';
	import { Button, type ButtonSize, type ButtonVariant } from '$lib/components/ui/button';

	type Swatch = { token: string; hex: string; role: string; text?: boolean };

	const surfaces: Swatch[] = [
		{ token: 'sidebar', hex: '#19191c', role: 'app frame + sidebar' },
		{ token: 'background', hex: '#1f2023', role: 'main content panel' },
		{ token: 'muted', hex: '#1e1e21', role: 'kanban column' },
		{ token: 'card', hex: '#28292c', role: 'card' },
		{ token: 'popover', hex: '#2e2f33', role: 'popover, a step above the card' },
		{ token: 'border', hex: '#2d2d2f', role: 'card border (also input)' },
		{ token: 'secondary', hex: '#282a2c', role: 'list group header' },
		{ token: 'sidebar-accent', hex: '#323438', role: 'active sidebar item' },
		{ token: 'tab', hex: '#2a2b2e', role: 'inactive pill tab' },
		{ token: 'accent', hex: '#494b4e', role: 'active pill tab' },
		{ token: 'primary', hex: '#5e6ad2', role: 'brand accent (also ring, sidebar-primary)' }
	];

	const texts: Swatch[] = [
		{ token: 'foreground', hex: '#e6e6e7', role: 'primary text', text: true },
		{ token: 'muted-foreground', hex: '#939498', role: 'secondary text', text: true },
		{ token: 'subtle-foreground', hex: '#5d5e62', role: 'tertiary text, dim icons', text: true },
		{ token: 'primary-foreground', hex: '#ffffff', role: 'text on primary', text: true }
	];

	const statuses: Swatch[] = [
		{ token: 'status-backlog', hex: '#a0a3a8', role: 'backlog / todo' },
		{ token: 'status-progress', hex: '#e3b502', role: 'in progress' },
		{ token: 'status-review', hex: '#26a243', role: 'in review' },
		{ token: 'status-done', hex: '#5e6ad2', role: 'done' },
		{ token: 'status-cancelled', hex: '#929fb0', role: 'cancelled' }
	];

	const variants: ButtonVariant[] = ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'];
	const sizes: ButtonSize[] = ['default', 'sm', 'lg'];
	const themes = ['dark', 'light', 'system'] as const;

	// Only the attribute the app itself writes; never localStorage, so a visit
	// here does not change the user's saved theme.
	let theme = $state<(typeof themes)[number]>('system');
	onMount(() => {
		const attr = document.documentElement.getAttribute('data-theme');
		theme = attr === 'dark' || attr === 'light' ? attr : 'system';
	});
	function setTheme(next: (typeof themes)[number]) {
		theme = next;
		if (next === 'system') document.documentElement.removeAttribute('data-theme');
		else document.documentElement.setAttribute('data-theme', next);
	}

	// The value the browser resolved, read back so the page shows what is live.
	let resolved = $state<Record<string, string>>({});
	$effect(() => {
		void theme;
		const style = getComputedStyle(document.documentElement);
		const all = [...surfaces, ...texts, ...statuses];
		resolved = Object.fromEntries(all.map((s) => [s.token, style.getPropertyValue(`--ui-${s.token}`).trim()]));
	});
</script>

<svelte:head>
	<title>UI preview · Pad</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#snippet swatchGrid(list: Swatch[])}
	<div class="flex flex-wrap gap-3">
		{#each list as s (s.token)}
			<div class="flex w-72 items-center gap-3 rounded-lg border border-border bg-card p-2" data-token={s.token}>
				{#if s.text}
					<div
						class="flex size-12 shrink-0 items-center justify-center rounded-md border border-border bg-background text-lg font-semibold"
						style="color: var(--ui-{s.token})"
					>
						Aa
					</div>
				{:else}
					<div class="size-12 shrink-0 rounded-md border border-border" style="background: var(--ui-{s.token})"></div>
				{/if}
				<div class="min-w-0 text-xs/relaxed">
					<div class="font-mono text-foreground">--ui-{s.token}</div>
					<div class="text-muted-foreground">{s.hex} · {s.role}</div>
					<div class="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-subtle-foreground">{resolved[s.token] ?? ''}</div>
				</div>
			</div>
		{/each}
	</div>
{/snippet}

<main class="min-h-full bg-background p-6 text-foreground">
	<div class="mx-auto flex max-w-6xl flex-col gap-8">
		<header class="flex flex-wrap items-center justify-between gap-4">
			<div>
				<h1 class="text-xl font-semibold">shadcn-svelte preview</h1>
				<p class="text-sm text-muted-foreground">
					SPEC-24 tokens and components. Dark is the Linear palette (DOC-33); light is stock shadcn neutral.
				</p>
			</div>
			<div class="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Theme">
				{#each themes as t (t)}
					<Button size="sm" variant={theme === t ? 'secondary' : 'ghost'} aria-pressed={theme === t} onclick={() => setTheme(t)}>
						{t}
					</Button>
				{/each}
			</div>
		</header>

		<section class="flex flex-col gap-3">
			<h2 class="text-sm font-medium text-muted-foreground">Button</h2>
			{#each sizes as size (size)}
				<div class="flex flex-wrap items-center gap-2">
					{#each variants as variant (variant)}
						<Button {variant} {size}>{variant}</Button>
					{/each}
					<Button {size} disabled>disabled</Button>
				</div>
			{/each}
			<div class="flex flex-wrap items-center gap-2">
				<Button><HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />New issue</Button>
				<Button variant="outline">Next<HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" /></Button>
				<Button variant="destructive" size="icon" aria-label="Delete"><HugeiconsIcon icon={Delete02Icon} /></Button>
				<Button variant="outline" href="/_ui-preview">as a link</Button>
			</div>
		</section>

		<section class="flex flex-col gap-3">
			<h2 class="text-sm font-medium text-muted-foreground">Surfaces</h2>
			{@render swatchGrid(surfaces)}
		</section>

		<section class="flex flex-col gap-3">
			<h2 class="text-sm font-medium text-muted-foreground">Text</h2>
			{@render swatchGrid(texts)}
		</section>

		<section class="flex flex-col gap-3">
			<h2 class="text-sm font-medium text-muted-foreground">Status</h2>
			{@render swatchGrid(statuses)}
			<div class="flex flex-wrap gap-4 text-xs/relaxed">
				{#each statuses as s (s.token)}
					<span class="inline-flex items-center gap-1.5 text-muted-foreground">
						<span class="size-2.5 rounded-full" style="background: var(--ui-{s.token})"></span>{s.role}
					</span>
				{/each}
			</div>
		</section>

		<section class="flex flex-col gap-3">
			<h2 class="text-sm font-medium text-muted-foreground">Radius and type</h2>
			<div class="flex flex-wrap items-end gap-3 text-xs/relaxed text-muted-foreground">
				<div class="flex size-16 items-end rounded-sm border border-border bg-card p-1">sm 4px</div>
				<div class="flex size-16 items-end rounded-md border border-border bg-card p-1">md 6px</div>
				<div class="flex size-16 items-end rounded-lg border border-border bg-card p-1">lg 8px</div>
				<div class="flex size-16 items-end rounded-xl border border-border bg-card p-1">xl 12px</div>
				<p class="font-inter text-sm text-foreground">font-inter: Inter with cv01 + ss03 (falls back to the app font)</p>
			</div>
		</section>
	</div>
</main>
