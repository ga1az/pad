<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";

	// The Linear "chip" (DOC-33): 22px high, fully rounded, a 1px border,
	// 12px icon + 12px text. `sm` is the dense form for cards and rows of a list.
	// A `color` (any CSS color, usually one of the legacy accent variables) tints the
	// text, fill and border through the `[data-slot="badge"][data-color]` rule
	// in src/ui.css; it replaces the legacy `common/Chip`.
	export const badgeVariants = tv({
		base: "gap-1 rounded-full border border-transparent font-medium leading-none transition-[color,background-color,border-color,filter] duration-[120ms] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:size-3! group/badge inline-flex w-fit shrink-0 items-center justify-center overflow-hidden whitespace-nowrap focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 outline-none aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none",
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
				secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
				destructive: "bg-destructive/10 [a]:hover:bg-destructive/20 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 text-destructive dark:bg-destructive/20",
				outline: "border-border text-foreground [a]:hover:bg-foreground/4 [button]:hover:bg-foreground/4",
				ghost: "hover:bg-foreground/4 hover:text-foreground",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-[22px] px-2 text-xs",
				sm: "h-[18px] px-1.5 text-[11px]",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	});

	export type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];
	export type BadgeSize = VariantProps<typeof badgeVariants>["size"];
</script>

<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAnchorAttributes } from "svelte/elements";

	type Props = WithElementRef<HTMLAnchorAttributes, HTMLElement> & {
		variant?: BadgeVariant;
		size?: BadgeSize;
		/** CSS color for a tinted badge: text, fill and border follow it. */
		color?: string;
		/** A leading dot in the badge color. */
		dot?: boolean;
		/** A brief scale pulse, e.g. after the value changed. */
		pulse?: boolean;
		/** Renders a <button>. The click always preventDefault()s: a badge is
		 *  never a link, and this keeps a parent <a> card from navigating.
		 *  Propagation continues, so outside-click closers still see it;
		 *  stopPropagation() in the handler when the card also handles clicks. */
		onclick?: (e: MouseEvent) => void;
	};

	let {
		ref = $bindable(null),
		href,
		class: className,
		variant,
		size = "default",
		color,
		dot = false,
		pulse = false,
		onclick,
		children,
		...restProps
	}: Props = $props();

	// A tinted badge has no fill of its own; the ui.css rule supplies it.
	const resolvedVariant = $derived(variant ?? (color ? "outline" : "default"));
	const tag = $derived(onclick ? "button" : href ? "a" : "span");
</script>

<svelte:element
	this={tag}
	bind:this={ref}
	data-slot="badge"
	data-color={color ? "" : undefined}
	data-pulse={pulse ? "" : undefined}
	style:--badge-c={color}
	type={onclick ? "button" : undefined}
	href={onclick ? undefined : href}
	class={cn(badgeVariants({ variant: resolvedVariant, size }), onclick && "cursor-pointer", className)}
	onclick={onclick
		? (e: MouseEvent) => {
				e.preventDefault();
				onclick?.(e);
			}
		: undefined}
	{...restProps}
>
	{#if dot}<span data-slot="badge-dot" class="size-[7px] shrink-0 rounded-full bg-current" aria-hidden="true"></span>{/if}
	{@render children?.()}
</svelte:element>
