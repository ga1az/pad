<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";

	// Linear look (DOC-33): 28px high, a near-transparent surface with a hairline
	// border, +4% white on hover, 120ms transitions, the indigo ring on focus.
	// `default` (indigo) is for the one main action of a surface. The legacy
	// `common/Button` variants map as primary -> default, secondary ->
	// secondary, ghost -> ghost, danger -> destructive and danger-solid ->
	// destructive-solid (the FINAL confirm of an irreversible action).
	export const buttonVariants = tv({
		base: "focus-visible:border-ring focus-visible:ring-ring/40 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-md border border-transparent bg-clip-padding font-medium leading-none focus-visible:ring-2 aria-invalid:ring-2 [&_svg:not([class*='size-'])]:size-4 group/button inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap transition-[color,background-color,border-color,box-shadow] duration-[120ms] outline-none select-none disabled:pointer-events-none disabled:cursor-default disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground hover:bg-[color-mix(in_oklch,var(--ui-primary),white_8%)]",
				outline: "border-border bg-transparent text-foreground hover:bg-foreground/4 aria-expanded:bg-foreground/4",
				secondary: "border-border bg-foreground/3 text-foreground hover:bg-foreground/7 aria-expanded:bg-foreground/7",
				ghost: "text-muted-foreground hover:bg-foreground/4 hover:text-foreground aria-expanded:bg-foreground/4 aria-expanded:text-foreground",
				destructive: "border-destructive/40 bg-destructive/10 text-destructive hover:border-destructive hover:bg-destructive/20 focus-visible:ring-destructive/30",
				"destructive-solid": "bg-[color-mix(in_oklch,var(--ui-destructive),black_22%)] text-white hover:bg-[color-mix(in_oklch,var(--ui-destructive),black_12%)] focus-visible:ring-destructive/40",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-7 gap-1.5 px-3 text-[13px] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
				xs: "h-5 gap-1 rounded-sm px-2 text-[10px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-2.5",
				sm: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
				lg: "h-8 gap-1.5 px-3.5 text-[13px] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-4",
				icon: "size-7 [&_svg:not([class*='size-'])]:size-3.5",
				"icon-xs": "size-5 rounded-sm [&_svg:not([class*='size-'])]:size-2.5",
				"icon-sm": "size-6 [&_svg:not([class*='size-'])]:size-3",
				"icon-lg": "size-8 [&_svg:not([class*='size-'])]:size-4",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
	export type ButtonSize = VariantProps<typeof buttonVariants>["size"];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = "default",
		size = "default",
		ref = $bindable(null),
		href = undefined,
		type = "button",
		disabled,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? "link" : undefined}
		tabindex={disabled ? -1 : undefined}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		{disabled}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
