<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";

	// Linear look (measured from Linear, dark). Buttons almost never have a box:
	// - ghost: the TEXT ACTION ("+ New issue", "Add label"). No fill, no
	//   border, muted text; on hover the text brightens and a +4% white fill
	//   appears. The default look for any non-primary button.
	// - icon: the ICON-ONLY button. A round 28px pill (size="icon") filled one
	//   step above the panel with a barely lighter rim. A split button (icon +
	//   chevron) is the same pill with both inside.
	// - default: indigo, ONLY for the main submit of a form or dialog.
	// - destructive: a red text action; destructive-solid: the filled red
	//   FINAL confirm of an irreversible action.
	// - secondary: a subtle filled pill, for the selected state of a toggle.
	// - outline: shadcn's bordered button. A bordered box reads as an input in
	//   this theme, so the app does not use it for actions.
	// Legacy common/Button mapping: ui/README.md.
	export const buttonVariants = tv({
		base: "focus-visible:border-ring focus-visible:ring-ring/40 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-md border border-transparent bg-clip-padding font-medium leading-none focus-visible:ring-2 aria-invalid:ring-2 [&_svg:not([class*='size-'])]:size-4 group/button inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap transition-[color,background-color,border-color,box-shadow] duration-[120ms] outline-none select-none disabled:pointer-events-none disabled:cursor-default disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground hover:bg-[color-mix(in_oklch,var(--ui-primary),white_8%)]",
				outline: "border-border bg-transparent text-foreground hover:bg-foreground/4 aria-expanded:bg-foreground/4",
				secondary: "bg-foreground/6 text-foreground hover:bg-foreground/9 aria-expanded:bg-foreground/9",
				ghost: "bg-transparent text-muted-foreground hover:bg-foreground/4 hover:text-foreground aria-expanded:bg-foreground/4 aria-expanded:text-foreground",
				icon: "rounded-full border-foreground/7 bg-tab text-muted-foreground hover:bg-[color-mix(in_oklch,var(--ui-tab),white_5%)] hover:text-foreground aria-expanded:text-foreground",
				destructive: "bg-transparent text-destructive hover:bg-destructive/10 focus-visible:ring-destructive/30",
				"destructive-solid": "bg-[color-mix(in_oklch,var(--ui-destructive),black_22%)] text-white hover:bg-[color-mix(in_oklch,var(--ui-destructive),black_12%)] focus-visible:ring-destructive/40",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-7 gap-1.5 px-2 text-[13px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
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
