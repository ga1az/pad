<script lang="ts">
	import Icon from '$lib/icons/Icon.svelte';
	import { Add01Icon, Archive01Icon, MoreHorizontalIcon } from '@hugeicons/core-free-icons';
	import { viewport } from '$lib/stores/breakpoint.svelte';
	import { relationGroupingRefusal, relationGroupingRefusalMessage } from '$lib/collections/relationGroups';
	import type { Item, Collection } from '$lib/types';
	import { parseSchema, parseFields, formatItemRef } from '$lib/types';
	import StatusIcon from '$lib/components/status/StatusIcon.svelte';
	import PriorityIcon from '$lib/components/status/PriorityIcon.svelte';
	import { priorityLevel, statusCategory } from '$lib/components/status/statusCategory';
	import { draftKey } from '$lib/collections/laneDrafts';
	import { itemComparator, type SortMode } from '$lib/collections/itemSort';
	import { formatLaneLabel, isUngrouped, laneKey, laneValue } from '$lib/collections/boardColumns';
	import { laneOrderAfterMove, disabledDirections, type ReorderDirection } from '$lib/collections/reorder';
	import {
		narrowRelationRow,
		relationLaneAcceptsDrop,
		relationLaneValueFor,
		relationLanes,
		type RelationLane,
	} from '$lib/collections/relationGroups';
	import { localIndex } from '$lib/stores/localIndex.svelte';
	import { collectionStore } from '$lib/stores/collections.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { dndzone, TRIGGERS, SHADOW_ITEM_MARKER_PROPERTY_NAME } from 'svelte-dnd-action';
	import { workspaceStore } from '$lib/stores/workspace.svelte';
	import { lockableDndzone } from '$lib/collections/lockableDndzone';
	import type { DndEvent } from 'svelte-dnd-action';
	import ItemCard from './ItemCard.svelte';
	import EmptyState from '../common/EmptyState.svelte';
	import { uniqueStrings } from '$lib/utils/unique';
	import LaneActionsMenu from './LaneActionsMenu.svelte';
	import { clickOutside } from '$lib/utils/clickOutside';


	interface Props {
		items: Item[];
		collection: Collection;
		wsSlug?: string;
		groupField?: string;
		focusedItemId?: string | null;
		statusOptions?: string[];
		/**
		 * A DROP BETWEEN GROUPS — "put this item in this lane", which names the
		 * GROUP field. Distinct from `onStatusChange` below, which names `status`,
		 * and the two were one prop until BUG-3068: this component passed its
		 * single `onStatusChange` to BOTH the drop handler and the card's status
		 * chip, so on a list grouped by anything but `status` a chip click sent a
		 * status word to the group field.
		 */
		onLaneChange?: (item: Item, laneValue: string) => void | Promise<void>;
		/**
		 * A STATUS CHIP CLICK — names the `status` field and nothing else, at every
		 * grouping. `ItemCard`'s chip has always meant exactly this (it renders
		 * `fields.status` and offers `statusOptions` in a picker, BUG-3157); what it lacked was a caller
		 * that agreed.
		 */
		onStatusChange?: (item: Item, newStatus: string) => void | Promise<void>;
		onReorder?: (updates: { slug: string; sort_order: number }[], movedId?: string) => void;
		onArchiveGroup?: (items: Item[]) => void;
		/**
		 * The board's other bulk lane actions on a group (TASK-2222), each on the
		 * group's CURRENTLY-FILTERED items via the bulk endpoint, in the same ⋯
		 * LaneActionsMenu. Archive keeps its own header button. Gated by the
		 * caller, as onArchiveGroup is.
		 */
		onMoveGroup?: (items: Item[], status: string) => void;
		onTagGroup?: (items: Item[], tag: string) => void;
		onUntagGroup?: (items: Item[], tag: string) => void;
		onSetPriorityGroup?: (items: Item[], priority: string) => void;
		onAssignGroup?: (items: Item[], userId: string) => void;
		/** Workspace members (for "Assign all") and tag suggestions (for "Tag all"). */
		members?: { user_id: string; user_name?: string }[];
		tagSuggestions?: string[];
		/** True when a search/filter is narrowing the groups: shown in menu labels. */
		filtered?: boolean;
		onGroupReorder?: (newOrder: string[]) => void;
		oncreate?: () => void;
		/**
		 * The group header's `+` (TASK-29), the board's per-lane create: the
		 * page resolves the group value into the item's fields
		 * (`quickCreateInColumn`). The draft it types into is the page's
		 * `draftText` / `draftOpen`, shared with the board's lane drafts, so a
		 * draft survives a list↔board switch and the leave guard covers it.
		 */
		onCreateInColumn?: (groupValue: string, title: string, reveal: boolean) => Promise<unknown> | void;
		draftText?: Record<string, string>;
		draftOpen?: Record<string, boolean>;
		itemProgress?: Record<string, { total: number; done: number }>;
		progressLabel?: string;
		/**
		 * canEdit gates drag-to-reorder and drag-to-lane-change (the drop that
		 * writes the GROUP field). Default true preserves existing behavior in
		 * call sites that don't pass it. Pass `workspaceStore.canEditCollection(collection.id)`
		 * (PLAN-1100 / TASK-1106) — the gate is collection-level because
		 * svelte-dnd-action only supports zone-level dragDisabled.
		 *
		 * NOT the status CHIP, which is gated per ITEM inside `ItemCard` on
		 * `canEditItem` (BUG-3068 round 2). The distinction is load-bearing rather
		 * than pedantic: this flag is `canEditCollection`, item grants
		 * deliberately do not promote to collection-level write, and gating the
		 * chip here withheld it from a guest whose per-item grant the server would
		 * have honoured. A DRAG is still gated here — svelte-dnd-action disables a
		 * whole zone, so it has no per-item answer to give.
		 *
		 * Per-item gating (e.g. a guest with `ItemGrant.edit` on a single
		 * item dragging just that one card) would require switching to
		 * `dragHandleZone` + `dragHandle` actions, which changes the drag
		 * UX for everyone (whole-card → explicit-handle). Documented as a
		 * follow-up if needed; the server already enforces per-item edit
		 * on the resulting mutations, so no security gap here.
		 */
		canEdit?: boolean;
		/**
		 * When true, the in-group `sort_order` sort is skipped and the
		 * parent's item order is preserved. Used by the collection page
		 * to surface localSearch's relevance ranking (exact-ref hoist
		 * + boost tuning, TASK-1367) — otherwise the per-group sort
		 * would clobber the rank order whenever two matches share a
		 * status column.
		 */
		preserveOrder?: boolean;
		/**
		 * Page-wide sort applied within each group (TASK-1670). 'manual'
		 * (default) keeps the stored sort_order — the drag order. Any
		 * other mode also disables item drag, since reordering a sorted
		 * group would be meaningless.
		 */
		sortMode?: SortMode;
		/**
		 * Opt-in split-pane open (PLAN-2105 / TASK-2111). Threaded straight
		 * through to each ItemCard; omitted everywhere except the collection
		 * page, so other surfaces keep full-page anchor navigation.
		 */
		onItemOpen?: (item: Item) => void;
		/**
		 * Reports the ids of the rows this view RENDERS, in on-screen order
		 * (BUG-3492). The page's j/k step this list: re-deriving the order
		 * there had the list rendered in sortMode order while j/k walked
		 * `filteredItems` (updated order), so j landed on a row that was not
		 * the one below.
		 */
		onOrderRendered?: (ids: string[]) => void;
	}

	let {
		items,
		collection,
		wsSlug = '',
		groupField = 'status',
		focusedItemId = null,
		statusOptions,
		onLaneChange,
		onStatusChange,
		onReorder,
		onArchiveGroup,
		onMoveGroup,
		onTagGroup,
		onUntagGroup,
		onSetPriorityGroup,
		onAssignGroup,
		members = [],
		tagSuggestions = [],
		filtered = false,
		onGroupReorder,
		oncreate,
		onCreateInColumn,
		draftText = $bindable({}),
		draftOpen = $bindable({}),
		itemProgress,
		progressLabel = 'tasks',
		canEdit = true,
		preserveOrder = false,
		sortMode = 'manual',
		onItemOpen,
		onOrderRendered
	}: Props = $props();

	let confirmArchiveGroup = $state<string | null>(null);

	const flipDurationMs = 200;
	const touchDragDelayMs = 500;

	let schema = $derived(parseSchema(collection));
	let field = $derived(schema.fields.find((f) => f.key === groupField));

	// GROUPING BY A RELATION (TASK-2998 / PLAN-2857 U7, codex round 4).
	//
	// This component discovers extra group values from the ITEMS already, which
	// is what makes a text field groupable — and is exactly why a relation
	// grouped here rendered one group per stored ITEM ID. The board was fixed
	// and this was not: the same class, one component over.
	//
	// Same three pieces as BoardView, from the same module: lanes derived from
	// the targets, values folded onto a sentinel before bucketing, and the
	// chip vocabulary for the label.
	let isRelationGroup = $derived(field?.type === 'relation' && !!field?.collection);
	/**
	 * The icon in a group header (TASK-29), the board's lane rule: the status
	 * shape when grouped by a workflow field (`status`, or a select that
	 * declares terminal options), the priority bars when grouped by
	 * `priority`, and nothing for any other grouping.
	 */
	let groupIcon = $derived.by((): 'status' | 'priority' | null => {
		if (field?.type !== 'select') return null;
		if (groupField === 'priority') return 'priority';
		if (groupField === 'status' || (Array.isArray(field.terminal_options) && field.terminal_options.length > 0)) return 'status';
		return null;
	});
	// The rows' ref column is as wide as the longest ref in the list, so every
	// title starts at the same x (Linear's list). Refs are short ASCII, and at
	// 12px tabular figures a character is about 0.62em.
	let refWidth = $derived(
		`${Math.max(4, ...items.map((i) => formatItemRef(i)?.length ?? 0)) * 7.4 + 2}px`,
	);
	/**
	 * Why grouping is refused for this field, or null (U4).
	 *
	 * Replaces `relationWithoutTarget`, which covered one of the two reasons.
	 * A `multi_relation` joins it by lead ruling: one item belongs to as many
	 * lanes as it has references, and `bucketByColumn`'s invariant is exactly
	 * one. See relationGroupingRefusal for the alternatives and why both were
	 * rejected.
	 */
	let groupingRefusal = $derived(relationGroupingRefusal(field));
	/**
	 * A relation field with no declared target (legacy or half-written) is not
	 * groupable AT ALL here (codex round 5).
	 *
	 * The board falls into UNCATEGORIZED for this, because its lanes come from
	 * `field.options` and a relation has none. This view DISCOVERS values from
	 * the items, so the same schema produced one group per raw ITEM ID — the
	 * two siblings disagreeing about a malformed field, with the list landing
	 * on the one outcome this whole unit exists to prevent.
	 */
	let relationWithoutTarget = $derived(groupingRefusal !== null);
	let knownCollectionSlugs = $derived(
		new Set(collectionStore.collections.map((c) => c.slug)),
	);
	let resolveRelation = $derived((id: string) =>
		wsSlug
			? narrowRelationRow(
					localIndex.findByIdOrSlug(wsSlug, id),
					id,
					field?.collection,
					knownCollectionSlugs,
				)
			: null,
	);
	let relationLaneList = $derived<RelationLane[]>(
		isRelationGroup ? relationLanes(items, groupField, resolveRelation) : [],
	);
	let relationLaneByValue = $derived(
		new Map(relationLaneList.map((lane) => [lane.value, lane])),
	);
	// THE STATUS CHIP IS NO LONGER WITHHELD ON A RELATION-GROUPED LIST (BUG-3068).
	// It used to be, because the single `onStatusChange` prop wrote what it
	// received into `fields[groupField]`, so a status click on a list grouped by
	// a relation wrote a STATUS STRING into the relation field. The chip showed
	// the right options — this component takes real `statusOptions` as a prop
	// rather than reusing its lanes — and sent them to the wrong field.
	//
	// The withholding was the narrow answer to that: correct, and it left the
	// chip missing on every relation-grouped list. The lane write is now a
	// separate prop, so the chip's callback names `status` at every grouping and
	// the group field is not reachable from it at all. Nothing about a relation
	// lane makes an item's status unwritable, so nothing withholds it.

	/**
	 * The value an item is grouped under — sentinel-folded for a relation.
	 *
	 * Normalised through the board's `laneValue` (BUG-3053) rather than cast with
	 * `as string`, which was a lie for every non-string field: a number field
	 * returned a NUMBER, and the two places that consumed it disagreed about what
	 * to do with it. Bucketing coerced it to an object key (`'0'`) while the lane
	 * list tested it for FALSINESS and filed it as ungrouped, so an item scoring
	 * zero went into a bucket no lane pointed at and disappeared from the view.
	 *
	 * NO TEST DISTINGUISHES the `laneValue` call here from leaving the cast in
	 * place (E5 and E6 on the BUG-3053 trail, both survive). That is true and it
	 * is not a reason to drop it: `isUngrouped` now normalises at its own door, so
	 * the DROP cannot come back either way, and what remains is JS object-key
	 * coercion silently agreeing that `result[0]` and `result['0']` are the same
	 * bucket. Normalising here is what makes this function's declared return type
	 * true and keeps the conversion at ONE point — rather than resting on a
	 * coincidence of key coercion plus every downstream consumer remembering to
	 * normalise, which is the arrangement that produced this bug.
	 */
	function groupValueFor(item: Item): string {
		if (relationWithoutTarget) return '';
		if (isRelationGroup) return relationLaneValueFor(item, groupField, resolveRelation);
		return laneValue(parseFields(item)[groupField]);
	}
	// Each once, never '' (the ungrouped lane's id): a keyed each throws on a
	// repeat (TASK-3539).
	let groupOptions = $derived(uniqueStrings((field?.options ?? []).filter((o) => o !== '')));

	/**
	 * Display groups: predefined options first, then any additional
	 * values discovered from items (handles text fields with no options).
	 */
	let displayGroups = $derived.by(() => {
		if (relationWithoutTarget) return [''];
		if (isRelationGroup) {
			const lanes = relationLaneList.map((lane) => lane.value);
			// `isUngrouped` rather than `!`: EQUIVALENT here, since `groupValueFor`
			// always returns a string and no test can tell them apart (E6 on the
			// BUG-3053 trail). Spelled this way because the difference is only ever
			// invisible while every caller normalises first — which is the exact
			// assumption that stopped holding and produced this bug.
			const hasEmpty = items.some((i) => isUngrouped(groupValueFor(i)));
			return hasEmpty ? [...lanes, ''] : lanes;
		}
		const known = new Set(groupOptions);
		const extra: string[] = [];
		let hasUngrouped = false;
		for (const item of items) {
			// The SAME function the bucketing pass uses, and the same emptiness
			// question (BUG-3053). This pass used to read the raw field itself and
			// ask `!value`, which put `0` and `false` in the ungrouped lane while
			// the bucketer filed them under `'0'` and `'false'`.
			const value = groupValueFor(item);
			if (isUngrouped(value)) {
				hasUngrouped = true;
			} else if (!known.has(value)) {
				known.add(value);
				extra.push(value);
			}
		}
		const groups = [...groupOptions, ...extra.sort()];
		if (hasUngrouped) groups.push('');
		return groups;
	});

	let collapsedGroups = new SvelteSet<string>();

	// The group ⋯ menu (TASK-2222): which group's is open, at most one.
	let openGroupMenu = $state<string | null>(null);
	function closeGroupMenu() {
		openGroupMenu = null;
	}
	let hasGroupVerbs = $derived(
		!!(onMoveGroup || onTagGroup || onUntagGroup || onSetPriorityGroup || onAssignGroup),
	);
	/** A click in the header's actions (count, archive, ⋯ menu) is theirs, not the toggle's. */
	function inGroupActions(e: Event): boolean {
		return e.target instanceof Element && !!e.target.closest('.group-actions');
	}

	// Group reordering state
	interface GroupItem { id: string }
	let groupItems = $state<GroupItem[]>([]);
	let isDraggingGroup = $state(false);

	$effect(() => {
		if (!isDraggingGroup) {
			groupItems = displayGroups.map((g) => ({ id: g }));
		}
	});

	function handleGroupConsider(e: CustomEvent<DndEvent<GroupItem>>) {
		groupItems = e.detail.items;
		isDraggingGroup = true;
	}

	function handleGroupFinalize(e: CustomEvent<DndEvent<GroupItem>>) {
		groupItems = e.detail.items;
		isDraggingGroup = false;
		// NO GROUP REORDER UNDER RELATION GROUPING (TASK-2998). The order is
		// alphabetical by target title, not schema-held, so there is nowhere to
		// persist it — and what `handleGroupReorder` WOULD persist is the lane
		// values, which for a relation are item ids going into the schema's
		// `options`. The page refuses that write at its own end; this stops the
		// gesture from looking like it worked and then snapping back on the
		// next derivation.
		if (onGroupReorder && !isRelationGroup) {
			const newOrder = groupItems
				.filter((g: any) => !g[SHADOW_ITEM_MARKER_PROPERTY_NAME])
				.map((g) => g.id);
			onGroupReorder(newOrder);
		}
	}

	let isDragging = $state(false);
	/**
	 * Lanes keyed by `laneKey(value)`, never by the raw value (BUG-3054). The value
	 * is user data (a text field's contents), and a plain object keyed by it
	 * finds an INHERITED member for `toString`, `constructor` or `__proto__`: the
	 * push threw, or `__proto__` re-parented the object and the lane vanished.
	 * A prefix no Object.prototype member starts with makes every value an own
	 * key. Not `Object.create(null)`: this is `$state`, and Svelte proxies only
	 * objects whose prototype is Object.prototype, so a null-prototype object
	 * would silently drop the drag handlers' reactivity.
	 */
	let groupData: Record<string, Item[]> = $state({});

	/**
	 * Derived group data from props, grouped by the groupField value
	 * and sorted by sort_order within each group.
	 */
	let propGroupData = $derived.by(() => {
		const result: Record<string, Item[]> = {};
		for (const opt of groupOptions) {
			result[laneKey(opt)] = [];
		}
		for (const item of items) {
			const key = laneKey(groupValueFor(item));
			if (Object.hasOwn(result, key)) {
				result[key].push(item);
			} else {
				result[key] = [item];
			}
		}
		// `preserveOrder` opts out of the in-group sort so a parent that
		// already sorted by relevance (search active) doesn't get its
		// ranking clobbered when two matches share a column. TASK-1367.
		// Otherwise sort each group by the page-wide sort mode
		// (TASK-1670); 'manual' resolves to the stored sort_order.
		if (!preserveOrder) {
			const cmp = itemComparator(sortMode, collection);
			for (const key of Object.keys(result)) {
				result[key].sort(cmp);
			}
		}
		return result;
	});

	// The rows on screen, in order (BUG-3492): group order × each group's
	// rendered rows, skipping collapsed groups and DnD shadow placeholders, so
	// j/k never land on a row the user cannot see or a phantom mid-drag.
	let renderedOrder = $derived(
		groupItems
			.filter((g: any) => !g[SHADOW_ITEM_MARKER_PROPERTY_NAME])
			.flatMap((g) =>
				collapsedGroups.has(g.id)
					? []
					: (groupData[laneKey(g.id)] ?? [])
							.filter((i: any) => !i[SHADOW_ITEM_MARKER_PROPERTY_NAME])
							.map((i) => i.id)
			)
	);
	$effect(() => {
		onOrderRendered?.(renderedOrder);
	});

	/**
	 * Sync the mutable groupData from the derived prop data,
	 * but only when the user is not actively dragging.
	 */
	$effect(() => {
		const data = propGroupData;
		if (!isDragging) {
			groupData = data;
		}
	});

	function handleConsider(groupName: string, e: CustomEvent<DndEvent<Item>>) {
		groupData[laneKey(groupName)] = e.detail.items;
		if (!isDragging && e.detail.info.trigger === TRIGGERS.DRAG_STARTED) {
			if (typeof navigator !== 'undefined' && navigator.vibrate) {
				navigator.vibrate(50);
			}
		}
		isDragging = true;
	}

	async function handleFinalize(groupName: string, e: CustomEvent<DndEvent<Item>>) {
		groupData[laneKey(groupName)] = e.detail.items;

		// Capture the desired order BEFORE setting isDragging = false or awaiting,
		// because both can trigger reactive effects that overwrite groupData.
		const reorderUpdates = groupData[laneKey(groupName)]
			.filter((i: any) => !i[SHADOW_ITEM_MARKER_PROPERTY_NAME])
			.map((item, index) => ({ slug: item.id, sort_order: index }));

		isDragging = false;

		const { id: itemId, trigger } = e.detail.info;

		if (trigger === TRIGGERS.DROPPED_INTO_ZONE) {
			const originalItem = items.find((i) => i.id === itemId);
			// A RELATION GROUP ONLY ACCEPTS A DROP WHEN ITS TARGET IS LIVE
			// (TASK-2998) — same rule as the board. The other three would clear
			// the field or write a reference the validator refuses.
			const relLane = isRelationGroup ? relationLaneByValue.get(groupName) : undefined;
			const dropAllowed = !isRelationGroup || (!!relLane && relationLaneAcceptsDrop(relLane));
			if (!dropAllowed) {
				// AND NO REORDER EITHER (codex round 5). Skipping only the
				// relation write left `onReorder` running unconditionally, so a
				// refused cross-group drop still rewrote every `sort_order` in
				// the destination — a persisted side effect of a gesture the
				// component had just declined. Re-deriving from props puts the
				// card back, as the board's refusal does.
				groupData = propGroupData;
				return;
			}
			if (originalItem && onLaneChange) {
				const fields = parseFields(originalItem);
				// TRIMMED, like every other comparison against a stored relation
				// value: an item holding `" id-red "` is already in this group,
				// and a raw `!==` would fire a pointless write for it.
				// NORMALISED on both sides (BUG-3053). `groupName` is a lane key, so
				// comparing it against the RAW field value makes an item already in
				// its own lane look like it moved: `0 !== '0'` and
				// `false !== 'false'`, and the "move" then writes the STRING '0'
				// into a number field. Unreachable before this fix only because the
				// item was dropped from the view and could not be dragged at all —
				// which is why it arrives with the fix rather than before it.
				const current = isRelationGroup
					? relationLaneValueFor(originalItem, groupField, resolveRelation)
					: laneValue(fields[groupField]);
				// A REFUSED grouping has no group value to change, so a drop in
				// its fallback lane is a REORDER and nothing else — the same
				// guard BoardView carries, and this view needed it too (codex
				// round 5). Fixing one view and not the other is the same
				// surface-count mistake as the type-dispatch sweep that started
				// this review: two views implement grouping, and a behaviour's
				// surface count is a number that gets ENUMERATED.
				if (!groupingRefusal && current !== groupName) {
					await onLaneChange(originalItem, groupName);
				}
			}
		}

		if (onReorder && reorderUpdates.length > 0) {
			onReorder(reorderUpdates, itemId);
		}
	}

	function itemCount(groupItems: Item[]): number {
		return groupItems.filter((i: any) => !i[SHADOW_ITEM_MARKER_PROPERTY_NAME]).length;
	}

	// Menu-driven reorder (IDEA-1898) — the non-drag counterpart. Gated on
	// the same conditions as item drag: edit permission, manual sort
	// (sort_order is only honored then), and not while search is
	// preserving relevance order.
	let canReorderItems = $derived(canEdit && sortMode === 'manual' && !preserveOrder);
	// Per card, the menu also needs canEditItem (BUG-3259): an item grant beats
	// a collection grant, so a card in an editable collection can be view-only.

	function reorderItem(groupName: string, item: Item, dir: ReorderDirection) {
		if (!onReorder) return;
		const grp = (groupData[laneKey(groupName)] ?? []).filter(
			(i: any) => !i[SHADOW_ITEM_MARKER_PROPERTY_NAME]
		);
		const lane = laneOrderAfterMove(grp, item.id, dir);
		if (lane.length > 0) onReorder(lane, item.id);
	}

	// The group header's `+` (TASK-29): an inline draft row under the header,
	// the board's draft card in a list's shape. No item exists until Enter;
	// Escape hides the row and keeps the text (it is the page's).
	let draftInputs: Record<string, HTMLInputElement | undefined> = {};
	let savingDraft = $state(false);

	/** Whether a group offers `+`: the board's gate for its lane `+`. */
	function canAddTo(groupName: string): boolean {
		return !!onCreateInColumn && !isUngrouped(groupName) && !isRelationGroup && !groupingRefusal;
	}

	function openDraft(groupName: string) {
		if (!canAddTo(groupName)) return;
		collapsedGroups.delete(groupName);
		const key = draftKey(groupField, groupName);
		draftOpen[key] = true;
		requestAnimationFrame(() => draftInputs[key]?.focus());
	}

	async function submitDraft(key: string) {
		const title = (draftText[key] ?? '').trim();
		if (!title || savingDraft || !onCreateInColumn) return;
		savingDraft = true;
		// As the board's composer: cleared before the await so the leave guard
		// never sees an in-flight create as unsaved, restored on failure (the
		// page toasts the error).
		const prior = draftText[key];
		delete draftText[key];
		draftOpen[key] = false;
		try {
			await onCreateInColumn(key, title, true);
		} catch {
			draftText[key] = prior;
			draftOpen[key] = true;
		} finally {
			savingDraft = false;
		}
	}

	function toggleGroup(groupName: string) {
		if (collapsedGroups.has(groupName)) {
			collapsedGroups.delete(groupName);
		} else {
			collapsedGroups.add(groupName);
		}
	}

</script>

{#if items.length === 0}
	<EmptyState {collection} {wsSlug} {oncreate} />
{:else}
	<!--
		GROUPING REFUSED — say so (U4). The view falls back to ungrouped, and
		silence there reads as "nobody set a grouping", or worse, the single
		Uncategorized lane reads as "none of these items has a value". Both are
		false and neither is actionable; the sentence names the field and what to
		do about it.
	-->
	{#if groupingRefusal}
		<p class="grouping-refused" role="status">
			<strong>Not grouped by {field?.label || groupField}.</strong>
			{relationGroupingRefusalMessage(groupingRefusal)}
		</p>
	{/if}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="list-view"
		style:--list-ref-width={refWidth}
		use:dndzone={{
			items: groupItems,
			flipDurationMs,
			type: 'list-group',
			dropTargetClasses: ['group-drop-target'],
			morphDisabled: true,
			/* On mobile, touching a group header to scroll the page used to
			   immediately seize the touch as the start of a group-reorder drag,
			   so the page wouldn't scroll and the group would fly around with
			   the finger. Mirror the inner item dndzone's `delayTouchStart`
			   (BUG-641): a 500ms long-press is required before drag activates,
			   which matches the existing intra-group item behaviour and lets
			   ordinary taps/scrolls pass through unmolested. */
			delayTouchStart: touchDragDelayMs,
			// Off by input, not width, like every drag zone (BUG-3158): a group
			// reorder persists the lane order for the whole collection. Off while
			// a group's ⋯ menu is open, too (TASK-2222, codex round 2): the menu
			// lives inside a draggable group, so a press-and-drag on it would
			// otherwise reorder the groups mid-action.
			dragDisabled: viewport.dragDisabled || !canEdit || openGroupMenu !== null
		}}
		onconsider={handleGroupConsider}
		onfinalize={handleGroupFinalize}
	>
		{#each groupItems as group (group.id)}
			{@const groupName = group.id}
			{@const grpItems = groupData[laneKey(groupName)] ?? []}
			<div class="item-group" class:menu-open={openGroupMenu === groupName}>
				<!-- The header's empty space toggles on a click, as it always has; the
				     KEYBOARD and assistive-tech control is the .group-toggle button,
				     whose Enter/Space click bubbles here. The action buttons are its
				     siblings, not its children (TASK-2222, codex round 1: a role=button
				     header made every action a nested interactive control). -->
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<div
					class="group-header"
					onclick={(e) => { if (inGroupActions(e)) return; toggleGroup(groupName); }}
				>
					{#if canEdit}
						<span class="group-drag-handle" title="Drag to reorder">⠿</span>
					{/if}
					<button
						type="button"
						class="group-toggle"
						aria-expanded={!collapsedGroups.has(groupName)}
					>
					<span class="collapse-icon" class:collapsed={collapsedGroups.has(groupName)} aria-hidden="true"
						><svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 2.25h6L4 6.25z" fill="currentColor" /></svg></span
					>
					{#if groupIcon === 'status' && !isUngrouped(groupName)}
						<StatusIcon category={statusCategory(groupName, field)} />
					{:else if groupIcon === 'priority' && !isUngrouped(groupName)}
						<PriorityIcon level={priorityLevel(groupName)} />
					{/if}
					<span class="group-title">
						{#if relationLaneByValue.get(groupName)?.ref}<span class="group-ref"
							>{relationLaneByValue.get(groupName)?.ref}</span
						>{/if}{relationLaneByValue.get(groupName)
							? (relationLaneByValue.get(groupName)?.title ??
								relationLaneByValue.get(groupName)?.label)
							: formatLaneLabel(groupName)}
						{#if relationLaneByValue.get(groupName)?.state === 'deleted'}<span
								class="group-note"
								title="This item has been deleted.">(deleted)</span
							>{/if}
					</span>
					<span class="group-count">{itemCount(grpItems)}</span>
					</button>
					<span class="group-actions">
						<!-- Gate on onArchiveGroup alone (not canEdit): archive-all
						     is owner/editor-gated by the page via the callback, so
						     an owner/editor without a collection edit grant
						     (canEdit false) can still bulk-archive. TASK-1672 /
						     Codex round 4. -->
						{#if onArchiveGroup && itemCount(grpItems) > 0}
							{#if confirmArchiveGroup === groupName}
								<span class="archive-confirm">
									<button class="archive-yes" onclick={(e) => { e.stopPropagation(); onArchiveGroup(grpItems); confirmArchiveGroup = null; }}>Archive {itemCount(grpItems)}?</button>
									<button class="archive-no" onclick={(e) => { e.stopPropagation(); confirmArchiveGroup = null; }}>Cancel</button>
								</span>
							{:else}
								<button
									class="archive-group-btn"
									title="Archive all {formatLaneLabel(groupName).toLowerCase()} items"
									aria-label="Archive all {formatLaneLabel(groupName).toLowerCase()} items"
									onclick={(e) => { e.stopPropagation(); confirmArchiveGroup = groupName; }}
								><Icon icon={Archive01Icon} /></button>
							{/if}
						{/if}
						{#if hasGroupVerbs && itemCount(grpItems) > 0}
							<!-- clickOutside dismisses only on a press that STARTS outside (BUG-3231). -->
							<span
								class="group-menu-wrap"
								use:clickOutside={{ enabled: openGroupMenu === groupName, onOutside: closeGroupMenu }}
							>
								<button
									class="group-menu-btn"
									title="Group actions"
									aria-label="{formatLaneLabel(groupName)} group actions"
									aria-haspopup="menu"
									aria-expanded={openGroupMenu === groupName}
									onclick={(e) => { e.stopPropagation(); openGroupMenu = openGroupMenu === groupName ? null : groupName; }}
								><Icon icon={MoreHorizontalIcon} size={14} /></button>
								{#if openGroupMenu === groupName}
									<LaneActionsMenu
										items={grpItems}
										groupValue={groupName}
										{groupField}
										{collection}
										{filtered}
										{members}
										{tagSuggestions}
										{sortMode}
										onClose={closeGroupMenu}
										onMove={onMoveGroup && !isRelationGroup && !relationWithoutTarget
											? (status) => onMoveGroup?.(grpItems, status)
											: undefined}
										onTag={onTagGroup ? (tag) => onTagGroup?.(grpItems, tag) : undefined}
										onUntag={onUntagGroup ? (tag) => onUntagGroup?.(grpItems, tag) : undefined}
										onSetPriority={onSetPriorityGroup ? (p) => onSetPriorityGroup?.(grpItems, p) : undefined}
										onAssign={onAssignGroup ? (userId) => onAssignGroup?.(grpItems, userId) : undefined}
									/>
								{/if}
							</span>
						{/if}
						{#if canAddTo(groupName)}
							<button
								type="button"
								class="group-add-btn"
								title="Add item to {formatLaneLabel(groupName).toLowerCase()}"
								aria-label="Add item to {formatLaneLabel(groupName)}"
								onclick={(e) => { e.stopPropagation(); openDraft(groupName); }}
							><Icon icon={Add01Icon} size={14} /></button>
						{/if}
					</span>
				</div>

				{#if canAddTo(groupName) && draftOpen[draftKey(groupField, groupName)]}
					{@const key = draftKey(groupField, groupName)}
					<!-- The inline draft (TASK-29). Outside the dndzone, so it is not a
					     row and cannot be dragged; it is not an item until Enter. -->
					<div class="group-draft">
						{#if groupIcon === 'status'}
							<StatusIcon category={statusCategory(groupName, field)} />
						{:else if groupIcon === 'priority'}
							<PriorityIcon level={priorityLevel(groupName)} />
						{/if}
						<input
							aria-label="New item title"
							bind:this={draftInputs[key]}
							bind:value={draftText[key]}
							class="group-draft-input"
							placeholder="Enter a title…"
							disabled={savingDraft}
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									submitDraft(key);
								} else if (e.key === 'Escape') {
									e.preventDefault();
									e.stopPropagation();
									draftOpen[key] = false;
								}
							}}
						/>
						<button
							type="button"
							class="group-draft-add"
							disabled={!draftText[key]?.trim() || savingDraft}
							onclick={() => submitDraft(key)}
						>Add</button>
						<button type="button" class="group-draft-close" onclick={() => (draftOpen[key] = false)}>Close</button>
					</div>
				{/if}

				{#if !collapsedGroups.has(groupName)}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="group-items"
						use:lockableDndzone={{
							items: grpItems,
							flipDurationMs,
							type: 'list-item',
							dropTargetClasses: ['drop-target'],
							delayTouchStart: touchDragDelayMs,
							// Disable item DnD whenever the parent has
							// requested rank-preserving order (search
							// active) — otherwise a drag would persist
							// the relevance-ranked subset order as the
							// stored `sort_order`. TASK-1367 / Codex R5.
							// Also disable under any non-manual page sort
							// (TASK-1670) — the group is comparator-ordered.
							// BUG-3158: this zone had no touch gate at all, so a held
							// finger moved a row into another group — on a status-
							// grouped list, another status — at any width.
							dragDisabled: viewport.dragDisabled || !canEdit || preserveOrder || sortMode !== 'manual'
						}}
						onconsider={(e) => handleConsider(groupName, e)}
						onfinalize={(e) => handleFinalize(groupName, e)}
						oncontextmenu={(e) => e.preventDefault()}
					>
						{#each grpItems as item, i (item.id)}
							<!-- data-drag-locked: a row the caller may only view cannot be
							     dragged, though the group allows it (BUG-3259). -->
							<div
								class="list-row"
								class:kb-focused={focusedItemId === item.id}
								class:drag-locked={!workspaceStore.canEditItem(item)}
								data-drag-locked={!workspaceStore.canEditItem(item)}
							>
								<ItemCard
									{item}
									{collection}
									variant="row"
									compact={false}
									focused={focusedItemId === item.id}
									{statusOptions}
									onStatusClick={onStatusChange}
									progress={itemProgress?.[item.id] ?? null}
									{progressLabel}
									onReorderItem={canReorderItems && workspaceStore.canEditItem(item) ? (it, dir) => reorderItem(groupName, it, dir) : undefined}
									reorderDisabledDirs={canReorderItems && workspaceStore.canEditItem(item) ? disabledDirections(i, grpItems.length) : undefined}
									{onItemOpen}
								/>
							</div>
						{/each}
						{#if grpItems.length === 0}
							<div class="group-empty">No {formatLaneLabel(groupName).toLowerCase()} items</div>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	/* U4: the grouping-refused notice. Deliberately plain and inline rather
	   than a dismissible toast — it describes a standing property of the view's
	   configuration, not an event, so it must still be there on reload. */
	.grouping-refused {
		margin: 0 0 0.75rem;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		background: var(--surface-2, rgba(127, 127, 127, 0.1));
		color: var(--text-2, inherit);
		font-size: 0.85rem;
		line-height: 1.4;
	}

	/* Linear's list (SPEC-24 / TASK-29), measured at 1:1: each group is a
	   36px header one step above the panel with 6px corners, then its 44px
	   rows with no borders between them. At phone width the groups keep their
	   bordered boxes and the rows their cards (below). */
	.list-view {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.item-group {
		display: flex;
		flex-direction: column;
	}

	.group-menu-wrap {
		position: relative;
		display: inline-flex;
	}

	/* The ⋯ and the `+`: bare 28px glyph buttons, 44px on touch widths
	   (TASK-3311). On desktop the ⋯ shows on the header's hover or focus
	   (Linear's list header shows only the `+`); a touch device, which cannot
	   hover, always shows it, the board's rule there (TASK-1671). */
	.group-menu-btn,
	.group-add-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 28px;
		height: 28px;
		padding: 0 4px;
		background: none;
		border: none;
		color: var(--ui-muted-foreground);
		font-size: 1em;
		line-height: 1;
		cursor: pointer;
		border-radius: 6px;
	}

	.group-menu-btn:hover,
	.group-add-btn:hover {
		color: var(--ui-foreground);
		background: color-mix(in oklch, var(--ui-foreground) 6%, transparent);
	}

	@media (min-width: 769px) {
		.group-menu-btn {
			opacity: 0;
		}
		.group-header:hover .group-menu-btn,
		.group-header:focus-within .group-menu-btn,
		.group-menu-btn[aria-expanded='true'] {
			opacity: 1;
		}
	}
	/* A coarse pointer too, as the card's hover actions: a headless desktop
	   browser reports `hover: none` with a mouse. */
	@media (hover: none) and (pointer: coarse) {
		.group-menu-btn {
			opacity: 1;
		}
	}

	@media (max-width: 768px) {
		.group-menu-btn,
		.group-add-btn {
			min-width: 44px;
			height: 44px;
		}
		/* The archive button's 44px extender overhangs its ~20px glyph by about
		   12px a side; the ⋯ starts past that overhang, so neither target takes
		   a tap meant for the other (TASK-3311 measures it). On the WRAPPER:
		   a margin there sits outside every box, where a margin on the button
		   widened the wrapper over the overhang and the wrapper took the tap. */
		.group-menu-wrap {
			margin-left: 14px;
		}
	}

	/* In the header's left gutter, so it does not move the chevron. */
	.group-drag-handle {
		position: absolute;
		left: 1px;
		color: var(--ui-subtle-foreground);
		font-size: 0.75em;
		opacity: 0;
		transition: opacity 0.15s;
		user-select: none;
		cursor: grab;
	}

	.group-header:hover .group-drag-handle {
		opacity: 1;
	}

	.group-drag-handle:active {
		opacity: 1;
		cursor: grabbing;
	}

	/* Sticky while its group scrolls under it; opaque, so rows pass beneath. */
	.group-header {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		height: 36px;
		padding: 0 8px 0 12px;
		background: var(--ui-secondary);
		border: none;
		border-radius: 6px;
		cursor: pointer;
		text-align: left;
		color: var(--ui-foreground);
		font-weight: 500;
		font-size: 13px;
	}

	.group-toggle {
		display: flex;
		align-items: center;
		gap: 9px;
		flex: 1;
		min-width: 0;
		height: 100%;
		padding: 0;
		background: none;
		border: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.group-toggle:focus-visible {
		outline: 2px solid var(--ui-ring);
		outline-offset: 2px;
		border-radius: 4px;
	}

	.group-actions {
		display: flex;
		align-items: center;
		gap: 2px;
		flex-shrink: 0;
	}

	.group-header:hover .archive-group-btn {
		opacity: 1;
	}

	.archive-group-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 0.8em;
		cursor: pointer;
		padding: 2px 4px;
		border-radius: var(--radius-sm);
		opacity: 0;
		transition: opacity 0.15s;
		line-height: 1;
	}

	/* Hover-revealed, so a keyboard user and a touch user need their own way
	   to see it (TASK-3311): focus reveals it everywhere, and a device with no
	   hover shows it at the resting opacity the card's copy button uses. */
	.archive-group-btn:focus-visible {
		opacity: 1;
	}
	@media (hover: none) and (pointer: coarse) {
		.archive-group-btn {
			opacity: 0.65;
		}
	}
	/* Phone width: a 44x44 touch target through an invisible extender, so the
	   group header keeps its height (TASK-3311). The label and the count are
	   not controls; the ⋯ group menu (TASK-2222) is, and keeps clear of the
	   extender's overhang with its own margin below. */
	@media (max-width: 768px) {
		.archive-group-btn {
			position: relative;
		}
		.archive-group-btn::after {
			content: '';
			position: absolute;
			left: 50%;
			top: 50%;
			width: 44px;
			height: 44px;
			transform: translate(-50%, -50%);
		}
	}

	.archive-group-btn:hover {
		color: var(--text-primary);
		background: var(--bg-hover);
	}

	.archive-confirm {
		display: flex;
		gap: var(--space-1);
		align-items: center;
	}

	.archive-yes {
		background: none;
		border: none;
		color: var(--accent-red);
		font-size: 0.78em;
		cursor: pointer;
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		white-space: nowrap;
	}

	.archive-yes:hover {
		background: color-mix(in srgb, var(--accent-red) 10%, transparent);
	}

	.archive-no {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 0.78em;
		cursor: pointer;
		padding: 2px 6px;
		border-radius: var(--radius-sm);
	}

	.archive-no:hover {
		color: var(--text-primary);
	}

	.collapse-icon {
		display: inline-flex;
		flex: none;
		width: 14px;
		justify-content: center;
		transition: transform 0.15s ease;
		color: var(--ui-subtle-foreground);
	}
	.group-header:hover .collapse-icon {
		color: var(--ui-muted-foreground);
	}

	.collapse-icon.collapsed {
		transform: rotate(-90deg);
	}

	.group-ref {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.85em;
		opacity: 0.7;
		margin-right: 0.35em;
	}

	.group-note {
		font-size: 0.85em;
		opacity: 0.7;
		margin-left: 0.35em;
		font-style: italic;
	}

	.group-title {
		flex: 0 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.group-count {
		font-weight: 400;
		color: var(--ui-muted-foreground);
		flex-shrink: 0;
	}

	.group-items {
		display: flex;
		flex-direction: column;
		min-height: 8px;
		padding: 1px 0;
		border-radius: 6px;
		transition: background 0.15s ease;
	}

	.group-items:global(.drop-target) {
		background: color-mix(in srgb, var(--ui-primary) 6%, transparent);
	}

	/* The `+`'s inline draft: a row's height and gutter, the title as an input. */
	.group-draft {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 44px;
		padding: 0 18px 0 35px;
		color: var(--ui-muted-foreground);
	}
	.group-draft-input {
		flex: 1;
		min-width: 0;
		height: 28px;
		padding: 0 8px;
		background: none;
		border: 1px solid var(--ui-border);
		border-radius: 6px;
		color: var(--ui-foreground);
		font: inherit;
		font-size: 13px;
	}
	.group-draft-input:focus {
		outline: none;
		border-color: var(--ui-ring);
	}
	.group-draft-add,
	.group-draft-close {
		height: 28px;
		padding: 0 10px;
		background: none;
		border: none;
		border-radius: 6px;
		color: var(--ui-muted-foreground);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}
	.group-draft-add {
		background: var(--ui-primary);
		color: var(--ui-primary-foreground);
	}
	.group-draft-add:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.group-draft-close:hover {
		color: var(--ui-foreground);
		background: color-mix(in oklch, var(--ui-foreground) 6%, transparent);
	}

	.list-row {
		cursor: grab;
		-webkit-touch-callout: none;
		-webkit-user-select: none;
		user-select: none;
		/*
		 * Virtualization (TASK-1346 / PLAN-1343 Phase 1).
		 *
		 * `content-visibility: auto` lets the browser skip layout, style,
		 * and paint work for any row that is off-screen, which is the
		 * dominant cost at large collection sizes (5,000+ items target
		 * 60fps scroll per the task acceptance). All DOM nodes stay
		 * mounted so:
		 *   - svelte-dnd-action keeps every reorder target in the tree
		 *   - window-level scrollTo (parent page's scroll restoration
		 *     and keyboard scrollIntoView) finds the right offsets
		 *   - keyboard focus on an "off-screen" row still works — the
		 *     browser brings it into view on focus and rehydrates paint
		 *
		 * `contain-intrinsic-size: auto 60px` gives the browser a layout
		 * placeholder for unrendered rows. The `auto` keyword (Chrome 99+,
		 * Firefox 125+, Safari 18+) caches the last measured size, so a
		 * row that paints once retains its real height even after it
		 * scrolls back off-screen — eliminating the layout shift that
		 * a fixed intrinsic size would cause for taller rows (cards with
		 * many tags, long titles, or a progress bar). The fallback `60px`
		 * matches the median ItemCard height for the common
		 * single-line case.
		 *
		 * We evaluated `@tanstack/svelte-virtual` and a hand-rolled
		 * IntersectionObserver windowing scheme. Both shipping shape
		 * options remove off-screen rows from the DOM, which collides
		 * head-on with all three preservation requirements: DnD needs
		 * the source node mounted on drop; window.scrollTo can't find
		 * an anchor that isn't there; keyboard nav's
		 * scrollIntoView(`.item-card.focused`) returns null for a row
		 * the windowing layer has unmounted. `content-visibility` is
		 * the only option that hits the perf target without forcing a
		 * rewrite of those three call sites.
		 */
		content-visibility: auto;
		contain-intrinsic-size: auto 44px;
	}

	.list-row:active {
		cursor: grabbing;
	}

	/* A row the caller may only view does not drag (BUG-3259). */
	.list-row.drag-locked,
	.list-row.drag-locked:active {
		cursor: default;
	}

	.group-empty {
		padding: 12px 18px 12px 35px;
		color: var(--ui-muted-foreground);
		font-size: 13px;
	}

	/* Phone width keeps the pre-TASK-29 list: a bordered box per group, the
	   cards as borderless rows with a rule between them (TASK-2244 measured
	   its touch targets), a 44px header. Not sticky: the mobile chrome is
	   fixed above it. */
	@media (max-width: 768px) {
		.list-view {
			gap: var(--space-3);
		}
		.item-group {
			background: var(--bg-secondary);
			border: 1px solid var(--border);
			border-radius: var(--radius);
			overflow: hidden;
		}
		/* The group menu is absolutely positioned; an open one must not be
		   clipped by a short group (TASK-2222). */
		.item-group.menu-open {
			overflow: visible;
		}
		.group-header {
			position: relative;
			height: auto;
			min-height: 44px;
			padding: 0 var(--space-2) 0 var(--space-4);
			border-radius: 0;
		}
		.group-items {
			border-top: 1px solid var(--border);
			min-height: 32px;
			padding: 0;
			border-radius: 0;
		}
		.list-row {
			border-bottom: 1px solid var(--border);
			contain-intrinsic-size: auto 60px;
		}
		.list-row:last-child {
			border-bottom: none;
		}
		.list-row :global(.item-card) {
			border: none;
			border-radius: 0;
			background: transparent;
			box-shadow: none;
		}
		.list-row :global(.item-card:hover) {
			background: var(--bg-hover);
		}
		.group-draft {
			padding: 0 var(--space-3);
		}
	}
</style>
