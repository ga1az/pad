<script lang="ts">
	import Icon from '$lib/icons/Icon.svelte';
	import { CubeIcon, GitPullRequestIcon, StarIcon } from '@hugeicons/core-free-icons';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { Item, Collection, FieldDef } from '$lib/types';
	import { isRelationType } from '$lib/items/relationFieldTypes';
	import { parseFields, parseSchema, parseTags, formatItemRef, itemUrlId } from '$lib/types';
	import { starredStore } from '$lib/stores/starred.svelte';
	import { viewport } from '$lib/stores/breakpoint.svelte';
	import { workspaceStore } from '$lib/stores/workspace.svelte';
	import { copyToClipboard } from '$lib/utils/clipboard';
	import { statusColor, priorityColor, formatFieldLabel as formatLabel } from '$lib/utils/fieldColors';
	import { Badge } from '$lib/components/ui/badge';
	import { avatarColor, avatarInitial } from '$lib/utils/avatar';
	import StatusIcon from '$lib/components/status/StatusIcon.svelte';
	import PriorityIcon from '$lib/components/status/PriorityIcon.svelte';
	import { priorityLevel, statusCategory } from '$lib/components/status/statusCategory';
	import { createdLabel } from './cardDate';
	import ItemActionsMenu from './ItemActionsMenu.svelte';
	import StatusPicker from './StatusPicker.svelte';
	import { cardPriorityWriter } from '$lib/collections/cardPriority';
	import type { ReorderDirection } from '$lib/collections/reorder';
	import { shouldOpenInPane } from './itemCardClick';

	interface Props {
		item: Item;
		collection: Collection;
		compact?: boolean;
		focused?: boolean;
		showCollection?: boolean;
		statusOptions?: string[];
		onStatusClick?: (item: Item, newStatus: string) => void;
		progress?: { total: number; done: number; label?: string } | null;
		progressLabel?: string;
		/**
		 * Opt-in per-item reorder menu (IDEA-1898). The host (ListView /
		 * BoardView / TableView) passes a bound handler + the disabled
		 * directions for this item's position in its group. When omitted —
		 * the default — no menu renders, so read-only / aggregation views
		 * (share pages, starred, tags, dashboard) get nothing. ItemCard
		 * stays dumb: it forwards these, it has no ordering context.
		 */
		onReorderItem?: (item: Item, dir: ReorderDirection) => void;
		reorderDisabledDirs?: Set<ReorderDirection | 'left' | 'right'>;
		/**
		 * Board-only adjacent-column move (TASK-1908). Pass-through to the
		 * menu's `onMove`; only BoardView wires it, so left/right never
		 * appear on List/Table/Child cards. The vertical `onReorderItem`
		 * type is deliberately left untouched (DR-6).
		 */
		onMoveItem?: (item: Item, dir: 'left' | 'right') => void;
		/** Render the Move left / Move right menu entries (BoardView only). */
		horizontal?: boolean;
		/**
		 * Opt-in split-pane open (PLAN-2105 / TASK-2111). When set, a plain
		 * left-click on the card opens the item in the collection page's
		 * detail pane instead of navigating; modifier/middle clicks still
		 * fall through to the `href` so cmd/middle-click opens the full page
		 * in a new tab (the "popout" state) and right-click-copy / SSR still
		 * target the full page. Omitted everywhere except the collection page,
		 * so all other surfaces (starred / tags / roles) keep full-page
		 * anchor navigation.
		 */
		onItemOpen?: (item: Item) => void;
		/**
		 * `row` is Linear's list row (SPEC-24 / TASK-29): one 44px line of
		 * fixed-width columns (priority, ref, status, title, chips, assignee,
		 * date), so the rows of a list align. ListView passes it; at phone width
		 * the card renders instead (its 44px touch targets, TASK-2244).
		 */
		variant?: 'card' | 'row';
	}

	let { item, collection, compact = false, variant = 'card', focused = false, showCollection = false, statusOptions, onStatusClick, progress = null, progressLabel = 'tasks', onReorderItem, reorderDisabledDirs, onMoveItem, horizontal = false, onItemOpen }: Props = $props();

	let isRow = $derived(variant === 'row' && !viewport.isMobile);
	let wsSlug = $derived(page.params.workspace ?? '');
	let username = $derived(page.params.username ?? '');
	function chippable(f: FieldDef | undefined): FieldDef | undefined {
		return f && !isRelationType(f.type) ? f : undefined;
	}

	let fields = $derived(parseFields(item));
	let schema = $derived(parseSchema(collection));

	// `chippable` asks the SCHEMA as well as the value (BUG-3016, codex
	// enumeration round). The value test below — "is it a string" — is the right
	// question for a `multi_relation` (an array falls out) and the WRONG one for a
	// scalar `relation`, whose value IS a string: a `status` retyped to one
	// rendered its stored item id as a title-cased status pill, and the chip is
	// CLICKABLE, so cycling it wrote a status word into a relation field. Same
	// pair of defects the table's relation arm closes, reached through the card.
	//
	// Withheld rather than resolved: this chip is a categorical summary, and the
	// item's own properties panel already renders the reference properly.
	let statusField = $derived(
		chippable(schema.fields.find((f) => f.key === 'status')),
	);
	let priorityField = $derived(
		chippable(schema.fields.find((f) => f.key === 'priority')),
	);
	let itemUrl = $derived(`/${username}/${wsSlug}/${collection.slug}/${itemUrlId(item)}`);
	let itemRef = $derived(formatItemRef(item));
	let tags = $derived(parseTags(item));

	// Absolute created timestamp for the age element's tooltip (IDEA-2286); the
	// visible label is Linear's short "Created Sep 16" (TASK-28).
	let createdAtTitle = $derived(
		item.created_at ? `Created ${new Date(item.created_at).toLocaleString()}` : ''
	);
	let createdText = $derived(createdLabel(item.created_at));

	function tagUrl(tag: string): string {
		return `/${username}/${wsSlug}/tags/${encodeURIComponent(tag)}`;
	}

	// Navigate to the tag page programmatically (like the star/PR/status
	// controls), and stop the click before it reaches the card's handlers.
	function openTag(e: MouseEvent, tag: string) {
		e.preventDefault();
		e.stopPropagation();
		goto(tagUrl(tag));
	}
	let starred = $derived(starredStore.isStarred(item.id));

	/**
	 * GATED PER ITEM, not per collection (BUG-3068 round 2).
	 *
	 * Nothing gated the chip on permission at all before this: a read-only
	 * viewer was offered a clickable chip whose write the server refused. That
	 * was PRE-EXISTING — measured against 9e121bde on an ordinary status-grouped
	 * list — and it is fixed here because BUG-3068 un-withheld the chip on
	 * relation- and refusal-grouped views, which were immune only by accident.
	 *
	 * The first attempt gated it in the two views on their `canEdit` prop, which
	 * is `canEditCollection` — and that is the WRONG QUESTION for this write.
	 * Item grants deliberately do not promote to collection-level write, so a
	 * guest holding `ItemGrant.edit` on one visible item has `canEdit === false`
	 * and would have lost a chip the server would have honoured. `canEditItem`'s
	 * own doc names `status` among the affordances it governs; this is that
	 * helper's case. The store exposes it anywhere, so this is the natural place
	 * rather than the only possible one — it is where the chip and the item both
	 * are, and the views hold a collection-level flag instead.
	 *
	 * A component with no membership loaded answers false, which is the safe
	 * direction: the affordance is withheld, never the information. The status
	 * is still rendered as a static chip below.
	 */
	let statusWritable = $derived(workspaceStore.canEditItem(item));

	// Whether the chip is offered as a status PICKER (BUG-3157; it was a
	// one-tap cycle before). The status is shown as a static chip otherwise.
	let statusSettable = $derived(
		statusWritable && !!onStatusClick && !!statusOptions && statusOptions.length > 1 && !!fields.status
	);

	// TASK-2214: the priority chip is a picker too, when the host page provides
	// the write (only the collection page does) and the field is a select with
	// a choice to make. Same writability gate as status.
	const writePriority = cardPriorityWriter();
	let priorityOptions = $derived(
		priorityField?.type === 'select' && Array.isArray(priorityField.options) ? priorityField.options : []
	);
	let prioritySettable = $derived(
		statusWritable && !!writePriority && priorityOptions.length > 1 && typeof fields.priority === 'string' && !!fields.priority
	);

	let pullRequest = $derived(item.code_context?.pull_request);

	function prStateColor(state: string): string {
		switch (state?.toUpperCase()) {
			case 'OPEN': return 'var(--accent-green)';
			case 'MERGED': return 'var(--accent-purple, #8b5cf6)';
			case 'CLOSED': return 'var(--accent-red)';
			case 'DRAFT': return 'var(--text-muted)';
			default: return 'var(--text-muted)';
		}
	}

	function openPullRequest(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (pullRequest?.url) {
			window.open(pullRequest.url, '_blank', 'noopener,noreferrer');
		}
	}

	function toggleStar(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		starredStore.toggle(wsSlug, item.slug, item.id);
	}

	// Copy the item's issue ID (e.g. IDEA-1904) without opening the card.
	// Swallow the click so it does not also open the item (IDEA-1904).
	let copied = $state(false);
	async function copyRef(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		await writeRef();
	}
	async function writeRef() {
		if (!itemRef) return;
		const ok = await copyToClipboard(itemRef);
		if (ok) {
			copied = true;
			setTimeout(() => { copied = false; }, 1500);
		}
	}

	// Split-pane row-click interception (PLAN-2105 / TASK-2111), on the title
	// link that covers the card. Only a plain left-click opens the pane;
	// modifier/middle clicks fall through to the native <a href> (cmd/middle-click = full-page popout in a new tab,
	// right-click-copy / SSR target the full page). Sub-controls (star / PR /
	// status / tags / reorder) already stopPropagation, so their clicks never
	// reach this handler; `defaultPrevented` is a defensive backstop. The
	// bail-out predicate is factored into `shouldOpenInPane` (TASK-2116) so
	// it's unit-testable without mounting this component.
	function handleCardClick(e: MouseEvent) {
		if (!shouldOpenInPane(e, !!onItemOpen)) return;
		e.preventDefault();
		onItemOpen?.(item);
	}
</script>

<!--
	A DIV, with the title link stretched over it (TASK-2237, audit C29). The card
	used to be the <a> itself, nesting real buttons (star, copy-ref, PR badge,
	status and priority pickers, tags, the reorder menu): invalid markup whose
	link name was the whole card's text, and whose controls assistive tech
	flattened or could not reach. The title link's ::after now covers the card,
	so a click anywhere that is not a control still opens the item (plain click
	into the pane, modifier and middle clicks to the full page, as before), and
	every control is a SIBLING raised above that overlay.

	Linear's card (SPEC-24 / TASK-28): the ref and the assignee on top, the
	status icon and the title, a row of property chips (the priority box first),
	and "Created <date>". The star and the ⋮ appear on hover or focus.
-->
{#snippet assignee()}
	{#if item.assigned_user_name}
		<span
			class="card-assignee"
			style:background={avatarColor(item.assigned_user_name)}
			role="img"
			aria-label="Assigned to {item.assigned_user_name}"
			title="Assigned to {item.assigned_user_name}"
		>{avatarInitial(item.assigned_user_name)}</span>
	{:else}
		<span class="card-assignee unassigned" title="No assignee" aria-hidden="true">
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
				<circle cx="8" cy="8" r="7.25" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1.9 1.9" />
				<circle cx="8" cy="6.4" r="2" fill="currentColor" />
				<path d="M4.6 11.6c.7-1.4 2-2.1 3.4-2.1s2.7.7 3.4 2.1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
			</svg>
		</span>
	{/if}
{/snippet}

{#snippet statusIcon()}
	{#if statusField && typeof fields.status === 'string' && fields.status}
		{#if statusSettable && statusOptions && onStatusClick}
			<!-- BUG-3157: a picker, never a one-tap cycle — see StatusPicker. -->
			<span class="card-status">
				<StatusPicker
					value={fields.status}
					options={statusOptions}
					appearance="icon"
					field={statusField}
					onselect={(next) => onStatusClick(item, next)}
				/>
			</span>
		{:else}
			<!-- The name is text, not only a label: the card still SHOWS the
			     status to a reader who cannot change it. -->
			<span class="card-status" title="Status: {formatLabel(fields.status)}">
				<StatusIcon category={statusCategory(fields.status, statusField)} />
				<span class="sr-only">Status: {formatLabel(fields.status)}</span>
			</span>
		{/if}
	{/if}
{/snippet}

{#snippet priorityIcon()}
	{#if prioritySettable && writePriority && typeof fields.priority === 'string'}
		<span class="card-chip card-priority">
			<StatusPicker
				kind="priority"
				value={fields.priority}
				options={priorityOptions}
				appearance="icon"
				onselect={(next) => writePriority(item, next)}
			/>
		</span>
	{:else}
		<!-- Static (BUG-3041: string-shaped values only). A missing value
		     is Linear's "no priority" dashes. -->
		{@const priority = typeof fields.priority === 'string' ? fields.priority : ''}
		<span class="card-chip card-priority" title={priority ? `Priority: ${formatLabel(priority)}` : 'No priority'}>
			<PriorityIcon level={priorityLevel(priority)} />
			<span class="sr-only">{priority ? `Priority: ${formatLabel(priority)}` : 'No priority'}</span>
		</span>
	{/if}
{/snippet}

{#snippet propertyChips()}
	{#if item.parent_title}
		{@const parentLabel = item.parent_ref ? `${item.parent_ref}: ${item.parent_title}` : item.parent_title}
		<span class="card-chip meta-parent" title={parentLabel}>
			<Icon icon={CubeIcon} size={12} />
			<span class="chip-text">{item.parent_title}</span>
		</span>
	{/if}
	{#if item.agent_role_name}
		<span class="card-chip meta-role">
			{#if item.agent_role_icon}<Icon icon={item.agent_role_icon} size={12} />{/if}
			<span class="chip-text">{item.agent_role_name}</span>
		</span>
	{/if}
	{#if pullRequest}
		<button
			type="button"
			class="card-chip pr-badge"
			style:--pr-color={prStateColor(pullRequest.state)}
			onclick={openPullRequest}
			title="#{pullRequest.number} {pullRequest.title} ({(pullRequest.state ?? '').toLowerCase()})"
		>
			<Icon icon={GitPullRequestIcon} size={12} />
			<span class="chip-text">#{pullRequest.number}</span>
		</button>
	{/if}
	{#each tags as tag, i (i)}
		<button type="button" class="card-chip card-tag" onclick={(e) => openTag(e, tag)} title="View items tagged “{tag}”">
			<span class="tag-dot" aria-hidden="true"></span>
			<span class="card-tag-text">{tag}</span>
		</button>
	{/each}
{/snippet}

{#if isRow}
	<!--
		Linear's list row (SPEC-24 / TASK-29). The same element, classes and
		controls as the card (`.item-card`, the stretched `.card-link` in
		`.card-title`, the pickers, star, copy-ref and ⋮), laid out as one line of
		fixed-width columns: priority, ref, status, title, then chips, the
		assignee and the created date on the right. The ref column's width comes
		from ListView (`--list-ref-width`), so every row's title starts at the
		same x.
	-->
	<div class="item-card row" data-item-key={itemUrlId(item)} data-item-slug={item.slug} class:focused class:has-pr={!!pullRequest}>
		<span class="row-priority">
			{#if priorityField}{@render priorityIcon()}{/if}
		</span>
		<span class="row-ref item-ref-wrap">
			{#if itemRef}<span class="item-ref">{itemRef}</span>{/if}
			<span class="sr-only" aria-live="polite">{copied ? `Copied ${itemRef}` : ''}</span>
		</span>
		<span class="row-status">{@render statusIcon()}</span>
		<!-- `.card-title` holds the title alone: tests and e2e read its text. -->
		<div class="card-title">
			<a href={itemUrl} class="card-link" onclick={handleCardClick}>{item.title}</a>
		</div>
		<span class="row-actions">
			{#if itemRef}
				<button
					type="button"
					class="copy-ref-btn"
					class:copied
					onclick={copyRef}
					title="Copy item ID"
					aria-label={copied ? `Copied ${itemRef}` : `Copy item ID ${itemRef}`}
				>
					{#if copied}
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
					{:else}
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
					{/if}
				</button>
			{/if}
			<button
				type="button"
				class="star-btn"
				class:starred
				onclick={toggleStar}
				title={starred ? 'Unstar' : 'Star'}
				aria-label={`Star ${item.title}`}
				aria-pressed={starred}
			>
				<span aria-hidden="true">{starred ? '★' : '☆'}</span>
			</button>
			{#if onReorderItem}
				<span class="hover-action">
					<ItemActionsMenu
						{item}
						{horizontal}
						disabledDirs={reorderDisabledDirs}
						label={item.title}
						onReorder={(dir) => onReorderItem?.(item, dir)}
						onMove={onMoveItem ? (dir) => onMoveItem?.(item, dir) : undefined}
					/>
				</span>
			{/if}
		</span>
		<span class="row-meta">
			{#if progress && progress.total > 0}
				<span class="card-chip row-progress" title="{progress.done} of {progress.total} {progress.label ?? progressLabel} done">
					<span class="row-progress-ring" style:--p="{Math.round((progress.done / progress.total) * 100)}%" aria-hidden="true"></span>
					<span class="card-progress-text">{progress.done}/{progress.total} {progress.label ?? progressLabel}</span>
				</span>
			{/if}
			{@render propertyChips()}
		</span>
		{@render assignee()}
		<span class="meta-age row-date" title={createdAtTitle}>{createdText}</span>
	</div>
{:else}
<div class="item-card" data-item-key={itemUrlId(item)} data-item-slug={item.slug} class:compact class:focused class:has-pr={!!pullRequest}>
	<div class="card-top-row">
		{#if showCollection && item.collection_name}
			<span class="collection-badge">
				{#if item.collection_icon}<Icon icon={item.collection_icon} /> {/if}{item.collection_name}
			</span>
		{/if}
		{#if itemRef}
			<span class="item-ref-wrap">
				<span class="item-ref">{itemRef}</span>
				{#if !viewport.isMobile}
				<button
					type="button"
					class="copy-ref-btn"
					class:copied
					onclick={copyRef}
					title="Copy item ID"
					aria-label={copied ? `Copied ${itemRef}` : `Copy item ID ${itemRef}`}
				>
					{#if copied}
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
					{:else}
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
					{/if}
				</button>
				{/if}
				<!-- Announce copy success to assistive tech; the icon/color swap
				     alone is invisible to screen readers (IDEA-1904 a11y review). -->
				<span class="sr-only" aria-live="polite">{copied ? `Copied ${itemRef}` : ''}</span>
			</span>
		{/if}
		<span class="top-spacer"></span>
		{#if viewport.isMobile}
			<!--
				Phone width (TASK-2244, Dave's ruling day 83): star, copy-ref and the
				⋮ could not each reach 44x44 without overlapping, so ONE 44x44 ⋯
				carries all three. The starred state stays visible as a passive ★,
				not a control, so it is not a sub-44 target.
			-->
			{#if starred}
				<span class="starred-mark" aria-label="Starred" role="img"><Icon icon={StarIcon} /></span>
			{/if}
			{@render assignee()}
			<ItemActionsMenu
				{item}
				{horizontal}
				disabledDirs={reorderDisabledDirs}
				label={item.title}
				onReorder={onReorderItem ? (dir) => onReorderItem?.(item, dir) : undefined}
				onMove={onReorderItem && onMoveItem ? (dir) => onMoveItem?.(item, dir) : undefined}
				card={{
					starred,
					onToggleStar: () => starredStore.toggle(wsSlug, item.slug, item.id),
					onCopyRef: itemRef ? () => void writeRef() : undefined,
				}}
			/>
		{:else}
		<!-- A toggle (TASK-2240, audit C111): one name, the state in aria-pressed,
		     and the title so a list of cards does not read "Star, Star, Star". -->
		<button
			type="button"
			class="star-btn"
			class:starred
			onclick={toggleStar}
			title={starred ? 'Unstar' : 'Star'}
			aria-label={`Star ${item.title}`}
			aria-pressed={starred}
		>
			<span aria-hidden="true">{starred ? '★' : '☆'}</span>
		</button>
		{#if onReorderItem}
			<span class="hover-action">
				<ItemActionsMenu
					{item}
					{horizontal}
					disabledDirs={reorderDisabledDirs}
					label={item.title}
					onReorder={(dir) => onReorderItem?.(item, dir)}
					onMove={onMoveItem ? (dir) => onMoveItem?.(item, dir) : undefined}
				/>
			</span>
		{/if}
		{/if}
		{#if !viewport.isMobile}{@render assignee()}{/if}
	</div>

	<div class="card-title-row">
		<!--
			Desktop only: at phone width the status stays a text chip in the
			property row (below), whose 44x44 touch extender (TASK-2244) needs the
			title above it to grow into.

			STRING-SHAPED, not merely truthy (BUG-3041). The status icon renders a
			value straight out of the item's `fields` blob, and a field's declared
			type is not a promise about what is stored: retyping `status` to a list
			or number type in the schema editor leaves the old values in place, and
			a non-empty array is truthy. An icon for such a value describes
			nothing, so the card shows none at all, exactly as it does for an
			absent value. Asking about the VALUE's shape rather than the FIELD's
			type is deliberate: a type allow-list goes stale the next time a type
			is added, and this question does not.
		-->
		{#if !viewport.isMobile}{@render statusIcon()}{/if}
		<!-- `.card-title` holds the title alone: tests and e2e read its text. -->
		<div class="card-title">
			<a href={itemUrl} class="card-link" onclick={handleCardClick}>{item.title}</a>
		</div>
	</div>

	{#if priorityField || item.parent_title || item.agent_role_name || pullRequest || tags.length > 0 || (viewport.isMobile && statusField && fields.status)}
		<div class="card-meta">
			{#if viewport.isMobile}
				<!-- Phone width keeps the text chips (TASK-2244 / TASK-3311 measured
				     their touch targets); same string-shape rule as above. -->
				{#if statusField && typeof fields.status === 'string' && fields.status}
					{#if statusSettable && statusOptions && onStatusClick}
						<span class="status-hit">
							<StatusPicker
								value={fields.status}
								options={statusOptions}
								onselect={(next) => onStatusClick(item, next)}
							/>
						</span>
					{:else}
						<Badge size="sm" color={statusColor(fields.status)}>
							{formatLabel(fields.status)}
						</Badge>
					{/if}
				{/if}
				{#if priorityField && typeof fields.priority === 'string' && fields.priority}
					{#if prioritySettable && writePriority}
						<span class="status-hit">
							<StatusPicker
								kind="priority"
								value={fields.priority}
								options={priorityOptions}
								onselect={(next) => writePriority(item, next)}
							/>
						</span>
					{:else}
						<Badge size="sm" color={priorityColor(fields.priority)}>
							{formatLabel(fields.priority)}
						</Badge>
					{/if}
				{/if}
			{:else if priorityField}
				{@render priorityIcon()}
			{/if}
			{@render propertyChips()}
		</div>
	{/if}

	{#if progress && progress.total > 0}
		<div class="card-progress">
			<div class="card-progress-bar">
				<div class="card-progress-fill" style:width="{Math.round((progress.done / progress.total) * 100)}%"></div>
			</div>
			<span class="card-progress-text">{progress.done}/{progress.total} {progress.label ?? progressLabel}</span>
		</div>
	{/if}

	{#if createdText}
		<span class="meta-age" title={createdAtTitle}>Created {createdText}</span>
	{/if}
</div>
{/if}

<style>
	/* Linear's card, measured at 1:1 (TASK-28): one step above the column, a
	   1px border, 6px radius, 12px sides. Tokens are --ui-*, so the light
	   theme follows. */
	.item-card {
		position: relative;
		display: flex;
		flex-direction: column;
		background: var(--ui-card);
		border: 1px solid var(--ui-border);
		border-radius: 6px;
		box-shadow: 0 0 0 1px color-mix(in oklch, var(--ui-card), black 25%);
		padding: 6px 12px 11px;
		text-decoration: none;
		color: var(--ui-card-foreground);
		font-size: 13px;
		transition: background 0.1s;
		/* When the card is a flex/grid item (board columns, list rows),
		   allow it to shrink below its intrinsic content width so a long
		   unbreakable title can wrap inside instead of pushing the card
		   past its container. Pairs with overflow-wrap on .card-title. */
		min-width: 0;
	}

	.item-card:hover {
		background: color-mix(in oklch, var(--ui-card), white 3%);
		text-decoration: none;
	}

	/* The stretched link (TASK-2237). Its ::after covers the whole card, so the
	   card stays one big target; the card is the positioning context. */
	.card-link {
		color: inherit;
		text-decoration: none;
	}
	.card-link::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
	}
	.card-link:focus-visible {
		outline: none;
	}
	/* The focus ring goes on the card, which is what the link stands for. */
	.item-card:has(.card-link:focus-visible) {
		outline: 2px solid var(--ui-ring);
		outline-offset: 2px;
	}
	/* Every control sits ABOVE the overlay: a positioned element later in the
	   DOM (the overlay is in the title, after the top row) would otherwise
	   paint over and swallow the earlier ones. Popovers are portaled to <body>,
	   so they are not affected. */
	.item-card :global(button),
	.item-card :global(a:not(.card-link)) {
		position: relative;
		z-index: 1;
	}

	/* Selected-in-pane ring (the mock's violet glow). E2E asserts the
	   .focused CLASS, not these styles — keep the class name stable. */
	.item-card.focused {
		border-color: color-mix(in srgb, var(--ui-primary) 60%, transparent);
		box-shadow:
			0 0 0 1px color-mix(in srgb, var(--ui-primary) 45%, transparent),
			0 4px 18px color-mix(in srgb, var(--ui-primary) 22%, transparent);
		text-decoration: none;
	}

	.item-card.compact {
		padding: 6px 12px 11px;
	}

	.card-top-row {
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: 20px;
		/* The avatar sits 8px from the card's right edge, not 12. */
		margin-right: -4px;
	}

	/* The star, the ⋮ and the avatar form the right cluster; the spacer pushes
	   them right. */
	.top-spacer {
		flex: 1 1 0;
		min-width: 0;
	}

	/* Status chip touch extender (TASK-2244, Dave's ruling day 83). At phone
	   width the chip's tappable area grows to 44x44 through an invisible ::after,
	   so the chip does not change size. It grows UPWARD only, into the title,
	   which is the card link and not a control. The row below can be tag
	   BUTTONS, and a centred extender took the top of the first tag (measured).
	   The e2e probes both sides: the area hits the chip, and no neighbour
	   control (a tag, the card ⋯) loses any of its own area to it. */
	.status-hit {
		display: contents;
	}
	@media (max-width: 768px) {
		.status-hit :global(button) {
			position: relative;
		}
		.status-hit :global(button)::after {
			content: '';
			position: absolute;
			left: 50%;
			bottom: 0;
			width: max(100%, 44px);
			height: 44px;
			transform: translateX(-50%);
		}
	}

	/* The passive starred mark beside the ref (TASK-2244). Not a control. */
	.starred-mark {
		color: var(--accent-amber);
		font-size: 0.95em;
		flex-shrink: 0;
		line-height: 1;
	}

	.collection-badge {
		background: var(--ui-tab);
		padding: 1px 7px;
		border-radius: 10px;
		font-size: 11px;
		color: var(--ui-muted-foreground);
		white-space: nowrap;
	}

	.item-ref-wrap {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		min-width: 0;
	}

	.item-ref {
		font-size: 12px;
		letter-spacing: 0.04em;
		color: var(--ui-muted-foreground);
		font-weight: 400;
		white-space: nowrap;
	}

	/* Copy-ID affordance sits just right of the item ref. Hidden until the
	   card is hovered/focused to keep dense boards clean; the check state
	   stays visible through its 1.5s window regardless of hover. */
	.copy-ref-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		padding: 0;
		background: none;
		border: none;
		border-radius: 4px;
		color: var(--ui-muted-foreground);
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.15s, color 0.15s, background 0.15s;
		flex-shrink: 0;
	}

	/* Copy-ref, the star and the ⋮ show on hover, or while anything in the card
	   has focus, so the keyboard reaches them too. A starred star stays: it is
	   state, not only an action. */
	.item-card:hover .copy-ref-btn,
	.item-card:focus-within .copy-ref-btn,
	.copy-ref-btn.copied {
		opacity: 1;
	}

	.copy-ref-btn:hover {
		color: var(--ui-foreground);
		background: color-mix(in oklch, var(--ui-foreground) 8%, transparent);
	}

	.copy-ref-btn.copied {
		color: var(--ui-status-review);
	}

	.hover-action {
		display: inline-flex;
		opacity: 0;
		transition: opacity 0.15s;
	}
	.item-card:hover .hover-action,
	.item-card:focus-within .hover-action,
	.hover-action:has(:global(.iam-trigger.open)) {
		opacity: 1;
	}

	/* Touch devices have no hover and don't reliably match :focus-visible on
	   tap, so a purely hover-revealed control would be invisible there. Keep
	   them at a low resting opacity (IDEA-1904). A coarse pointer too: a
	   headless desktop browser reports `hover: none` with a mouse. */
	@media (hover: none) and (pointer: coarse) {
		.copy-ref-btn,
		.hover-action {
			opacity: 0.65;
		}
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	/* The assignee: an 18px initial disc, or Linear's dashed "no assignee". */
	.card-assignee {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		color: #fff;
		font-size: 10px;
		font-weight: 600;
		line-height: 1;
	}
	.card-assignee.unassigned {
		color: var(--ui-subtle-foreground);
	}

	/* The status icon and the title, wrapping to two lines at most. */
	.card-title-row {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		margin-top: 3px;
		min-width: 0;
	}
	.card-title {
		flex: 1 1 auto;
		font-size: 13px;
		line-height: 16px;
		font-weight: 500;
		color: var(--ui-foreground);
		/* Long titles without spaces (URLs, identifiers like
		   `WorkspaceTemplateRegistryConfiguration`, code snippets pasted
		   into a title) used to push the card past its container. Allow
		   breaks at any character when there's no other option. */
		overflow-wrap: anywhere;
		min-width: 0;
	}
	.card-title .card-link {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
		min-width: 0;
	}

	.card-status {
		display: inline-flex;
		flex: none;
		height: 16px;
		align-items: center;
	}
	.card-status :global(.picker-icon) {
		width: 16px;
		height: 16px;
		margin: 0 -1px;
		border-radius: 4px;
	}
	.card-status :global(.picker-icon:hover) {
		background: color-mix(in oklch, var(--ui-foreground) 8%, transparent);
	}

	/* The property chips: a row of 24px pills with a 1px border, the
	   priority first as a round box. */
	.card-meta {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-wrap: wrap;
		margin-top: 10px;
		/* Allow flex children with intrinsic content wider than the card
		   (e.g. a long parent title from an `implements` link to an idea)
		   to shrink instead of pushing the card past its column. */
		min-width: 0;
	}

	.card-chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		height: 24px;
		max-width: 100%;
		min-width: 0;
		padding: 0 8px;
		/* Lighter than the card's own border, as Linear's chips are. */
		border: 1px solid color-mix(in oklch, var(--ui-foreground) 13%, transparent);
		border-radius: 999px;
		background: none;
		color: var(--ui-muted-foreground);
		font-size: 12px;
		font-weight: 500;
		line-height: 1;
		white-space: nowrap;
	}
	button.card-chip {
		cursor: pointer;
		font-family: inherit;
	}
	button.card-chip:hover {
		color: var(--ui-foreground);
		background: color-mix(in oklch, var(--ui-foreground) 4%, transparent);
	}

	.chip-text,
	.card-tag-text {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* The priority box: a 24px circle, the picker filling it. */
	.card-priority {
		justify-content: center;
		width: 24px;
		padding: 0;
		flex: none;
	}
	.card-priority :global(.picker-icon) {
		width: 100%;
		height: 100%;
		border-radius: 50%;
	}
	.card-priority :global(.picker-icon:hover) {
		background: color-mix(in oklch, var(--ui-foreground) 6%, transparent);
	}

	.meta-parent {
		/* Long parent titles (e.g. a task that implements an idea whose
		   title is a paragraph) used to push the card outside its
		   container on Board view (BUG-630). The chip caps to the card
		   width and truncates; the full label is in the tooltip. */
		max-width: 100%;
	}
	.meta-parent :global(.pad-icon) {
		color: var(--accent-orange, #f2994a);
	}

	.meta-role :global(.pad-icon) {
		color: var(--accent-teal, var(--accent-blue));
	}

	.pr-badge :global(.pad-icon) {
		color: var(--pr-color);
	}

	.card-tag {
		max-width: 12rem;
	}
	.tag-dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent-purple);
	}

	/* Phone width (TASK-3311): each tag is a 44x44 touch target. It grows
	   visibly to 44 wide and 28 tall (Dave's ruling: not bigger pills), and an
	   invisible extender adds the last 16px, 8 above and 8 below. That fills the
	   16px gap between wrapped rows and the card's gap above the row (the
	   status chip's extender grows UP, away from the tags), so no neighbouring
	   control loses area to it. */
	@media (max-width: 768px) {
		.card-meta {
			row-gap: 16px;
		}
		.card-tag {
			position: relative;
			justify-content: center;
			min-width: 44px;
			min-height: 28px;
		}
		.card-tag::after {
			content: '';
			position: absolute;
			left: 0;
			right: 0;
			top: 50%;
			height: 44px;
			transform: translateY(-50%);
		}
	}

	.card-progress {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 10px;
	}
	.card-progress-bar {
		flex: 1;
		height: 4px;
		background: var(--ui-tab);
		border-radius: 2px;
		overflow: hidden;
	}
	.card-progress-fill {
		height: 100%;
		background: var(--ui-status-review);
		border-radius: 2px;
		transition: width 0.3s ease;
	}
	.card-progress-text {
		font-size: 12px;
		color: var(--ui-muted-foreground);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.meta-age {
		margin-top: 10px;
		font-size: 12px;
		line-height: 16px;
		color: var(--ui-muted-foreground);
		white-space: nowrap;
		align-self: flex-start;
	}

	.star-btn {
		border: none;
		background: none;
		cursor: pointer;
		padding: 0;
		font-size: 13px;
		line-height: 1;
		color: var(--ui-muted-foreground);
		opacity: 0;
		transition: opacity 0.15s, color 0.15s;
		flex-shrink: 0;
	}

	.item-card:hover .star-btn,
	.item-card:focus-within .star-btn,
	.star-btn.starred {
		opacity: 1;
	}

	@media (hover: none) and (pointer: coarse) {
		.star-btn {
			opacity: 0.65;
		}
	}

	.star-btn:hover {
		color: var(--accent-amber);
	}

	.star-btn.starred {
		color: var(--accent-amber);
	}
	/* ── Linear's list row (TASK-29) ───────────────────────────────────────
	   Measured from Linear's list at 1:1: 44px, no border or fill, +4% white
	   on hover; the priority starts 35px in (Linear keeps that gutter for its
	   selection checkbox), then a 7px gap to the ref, the 14px status and the
	   title 8px after it. The right side is the chips, the 18px assignee and
	   the date in a fixed column 18px from the edge. */
	.item-card.row {
		flex-direction: row;
		align-items: center;
		gap: 0;
		height: 44px;
		padding: 0 18px 0 35px;
		background: none;
		border: none;
		border-radius: 6px;
		box-shadow: none;
		font-size: 13px;
	}
	.item-card.row:hover {
		background: color-mix(in oklch, var(--ui-foreground) 4%, transparent);
	}
	.item-card.row.focused {
		background: color-mix(in oklch, var(--ui-foreground) 7%, transparent);
		box-shadow: inset 2px 0 0 var(--ui-primary);
	}
	.item-card.row:has(.card-link:focus-visible) {
		outline-offset: -2px;
	}
	.row-priority {
		display: inline-flex;
		flex: none;
		width: 16px;
		height: 16px;
		align-items: center;
		justify-content: center;
		margin-right: 7px;
	}
	/* No box around the row's priority: Linear draws the bars alone. */
	.row-priority .card-priority {
		width: 16px;
		height: 16px;
		border: none;
		border-radius: 4px;
	}
	.row-priority .card-priority :global(.picker-icon) {
		border-radius: 4px;
	}
	.row-ref {
		flex: none;
		width: var(--list-ref-width, 56px);
		margin-right: 7px;
		overflow: hidden;
	}
	.row-ref .item-ref {
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.02em;
	}
	.row-status {
		display: inline-flex;
		flex: none;
		width: 16px;
		margin-right: 8px;
		justify-content: center;
	}
	.row-status .card-status {
		height: 16px;
	}
	.item-card.row .card-title {
		flex: 0 1 auto;
		min-width: 0;
		line-height: 20px;
		overflow-wrap: normal;
	}
	.item-card.row .card-title .card-link {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* Copy-ref, the star and the ⋮ sit right after the title, shown on hover
	   or focus as on the card. */
	.row-actions {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 2px;
		margin-left: 6px;
	}
	.row-meta {
		display: flex;
		flex: 1 1 0;
		min-width: 0;
		align-items: center;
		justify-content: flex-end;
		gap: 4px;
		margin: 0 12px 0 16px;
		overflow: hidden;
	}
	.row-meta .card-chip {
		flex: 0 1 auto;
	}
	.row-meta .meta-parent,
	.row-meta .card-tag {
		max-width: 14rem;
	}
	.row-progress-ring {
		flex: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: conic-gradient(var(--ui-status-review) var(--p), var(--ui-tab) 0);
	}
	.item-card.row .card-assignee {
		margin-right: 18px;
	}
	.item-card.row .row-date {
		flex: none;
		width: 48px;
		margin: 0;
		text-align: right;
		align-self: center;
		line-height: 20px;
	}
</style>
