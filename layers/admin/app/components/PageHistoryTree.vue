<script setup lang="ts">
import type { RevisionLayout, RevisionRow } from '../utils/revision-lanes'
import { revisionAuthorName } from '../utils/revision-author'

const props = defineProps<{
  layout: RevisionLayout
  selectedId: string | null
  hasMore: boolean
  loadingMore: boolean
  busy: boolean
}>()
const emit = defineEmits<{ select: [string]; loadMore: [] }>()

const { t, lang } = useT()

const ROW_HEIGHT = 44
const LANE_WIDTH = 16
const LANE_INSET = 10
const NODE_RADIUS = 5
const BEND = 8

const dateFmt = computed(() => new Intl.DateTimeFormat(lang.value, { dateStyle: 'medium', timeStyle: 'medium' }))

const laneWidth = computed(() => LANE_INSET + Math.max(props.layout.lanes, 1) * LANE_WIDTH)
const rows = computed(() => props.layout.rows)

const activeId = computed(() => props.selectedId ?? rows.value[0]?.revision.id ?? null)

const listRef = ref<HTMLElement | null>(null)

function centre(lane: number): number {
  return LANE_INSET + lane * LANE_WIDTH
}

function connector(from: number, to: number): string {
  const x1 = centre(from)
  const x2 = centre(to)
  const mid = ROW_HEIGHT / 2
  const bend = Math.min(BEND, Math.abs(x1 - x2))
  const turn = x1 > x2 ? x1 - bend : x1 + bend
  return `M ${x1} 0 L ${x1} ${mid - bend} Q ${x1} ${mid} ${turn} ${mid} L ${x2} ${mid}`
}

function laneColour(colour: number): string {
  return `var(--color-lane-${colour + 1})`
}

function timeOf(row: RevisionRow): string {
  return dateFmt.value.format(new Date(row.revision.createdAt))
}

function authorOf(row: RevisionRow): string {
  return revisionAuthorName(t, row.revision.author)
}

function describe(row: RevisionRow): string {
  const parts = [
    timeOf(row),
    authorOf(row),
    t('revisions.branchN', { n: row.branch }),
    row.revision.kind === 'restore' ? t('revisions.kindRestore') : t('revisions.kindSave'),
  ]
  if (row.head) parts.push(t('revisions.headMarker'))
  if (row.revision.live) parts.push(t('revisions.liveMarker'))
  if (row.fork) parts.push(t('revisions.forkMarker'))
  if (row.revision.label) parts.push(row.revision.label)
  if (row.revision.skipped) parts.push(t('revisions.skippedMarker'))
  return parts.join(', ')
}

function focusRow(id: string): void {
  const element = listRef.value?.querySelector<HTMLElement>(`[data-revision="${CSS.escape(id)}"]`)
  element?.focus()
}

function move(delta: number): void {
  const list = rows.value
  const index = list.findIndex((row) => row.revision.id === activeId.value)
  const next = list[Math.min(list.length - 1, Math.max(0, (index === -1 ? 0 : index) + delta))]
  if (!next) return
  emit('select', next.revision.id)
  void nextTick(() => focusRow(next.revision.id))
}

function jump(to: 'first' | 'last'): void {
  const next = to === 'first' ? rows.value[0] : rows.value[rows.value.length - 1]
  if (!next) return
  emit('select', next.revision.id)
  void nextTick(() => focusRow(next.revision.id))
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') { event.preventDefault(); move(1) }
  else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1) }
  else if (event.key === 'Home') { event.preventDefault(); jump('first') }
  else if (event.key === 'End') { event.preventDefault(); jump('last') }
}

function onActivate(row: RevisionRow, event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  emit('select', row.revision.id)
}
</script>

<template>
  <div class="history-tree">
    <ul
      ref="listRef"
      class="history-tree__list"
      role="listbox"
      :aria-label="t('revisions.treeLabel')"
      :aria-busy="busy"
      @keydown="onKeydown"
    >
      <li
        v-for="row in rows"
        :key="row.revision.id"
        :data-revision="row.revision.id"
        class="history-tree__row"
        :class="{ 'history-tree__row--selected': row.revision.id === selectedId }"
        :style="{ '--lane-indent': `${row.lane * 12}px`, '--lane-colour': `var(--color-lane-${row.colour + 1})` }"
        role="option"
        :aria-selected="row.revision.id === selectedId"
        :tabindex="row.revision.id === activeId ? 0 : -1"
        @click="emit('select', row.revision.id)"
        @keydown="onActivate(row, $event)"
      >
        <svg
          class="history-tree__lanes"
          :width="laneWidth"
          :height="ROW_HEIGHT"
          :viewBox="`0 0 ${laneWidth} ${ROW_HEIGHT}`"
          aria-hidden="true"
          focusable="false"
        >
          <line
            v-for="arm in row.through"
            :key="`through-${arm.lane}`"
            class="history-tree__line"
            :style="{ color: laneColour(arm.colour) }"
            :x1="centre(arm.lane)"
            :x2="centre(arm.lane)"
            y1="0"
            :y2="ROW_HEIGHT"
          />
          <path
            v-for="arm in row.merges"
            :key="`merge-${arm.lane}`"
            class="history-tree__line"
            :style="{ color: laneColour(arm.colour) }"
            :d="connector(arm.lane, row.lane)"
            fill="none"
          />
          <g :style="{ color: laneColour(row.colour) }">
            <line
              v-if="row.hasChild"
              class="history-tree__line"
              :x1="centre(row.lane)"
              :x2="centre(row.lane)"
              y1="0"
              :y2="ROW_HEIGHT / 2"
            />
            <line
              v-if="row.hasParent"
              class="history-tree__line"
              :x1="centre(row.lane)"
              :x2="centre(row.lane)"
              :y1="ROW_HEIGHT / 2"
              :y2="ROW_HEIGHT"
            />
            <circle
              class="history-tree__node"
              :class="{ 'history-tree__node--head': row.head }"
              :cx="centre(row.lane)"
              :cy="ROW_HEIGHT / 2"
              :r="row.head ? NODE_RADIUS + 1.5 : NODE_RADIUS"
            />
          </g>
        </svg>

        <span class="history-tree__text">
          <span class="history-tree__line-1">
            <span class="history-tree__time">{{ timeOf(row) }}</span>
            <span class="history-tree__branch">{{ t('revisions.branchN', { n: row.branch }) }}</span>
            <span v-if="row.head" class="history-tree__badge history-tree__badge--head">{{ t('revisions.headMarker') }}</span>
            <span v-if="row.revision.live" class="history-tree__badge history-tree__badge--live">{{ t('revisions.liveMarker') }}</span>
            <span v-if="row.revision.kind === 'restore'" class="history-tree__badge">{{ t('revisions.kindRestore') }}</span>
            <span v-if="row.revision.skipped" class="history-tree__badge history-tree__badge--skipped">{{ t('revisions.skippedMarker') }}</span>
          </span>
          <span class="history-tree__line-2">
            <span>{{ authorOf(row) }}</span>
            <span v-if="row.revision.label" class="history-tree__label">{{ row.revision.label }}</span>
          </span>
        </span>
        <span class="history-tree__sr">{{ describe(row) }}</span>
      </li>
    </ul>

    <p v-if="layout.truncated && !hasMore" class="history-tree__note">{{ t('revisions.prunedNote') }}</p>
    <div v-if="hasMore" class="history-tree__more">
      <KestrelUiButton variant="secondary" size="sm" :loading="loadingMore" @click="emit('loadMore')">{{ t('revisions.loadOlder') }}</KestrelUiButton>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '../assets/scss/mixins';

.history-tree {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.history-tree__list {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  min-height: 0;
  flex: 1 1 auto;
}
.history-tree__row {
  @include mixins.accent-slot;
  @include mixins.focus-ring;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-inline: var(--space-2);
  min-height: 44px;
  cursor: pointer;
  transition: background-color 120ms ease;

  &:hover { background: var(--color-hover); }
}
.history-tree__row--selected {
  @include mixins.selected-accent;
}
.history-tree__lanes {
  flex: 0 0 auto;
  overflow: visible;
}
.history-tree__line {
  stroke: currentColor;
  stroke-width: 2;
  fill: none;
}
.history-tree__node {
  fill: var(--color-surface);
  stroke: currentColor;
  stroke-width: 2.5;
}
.history-tree__node--head {
  fill: currentColor;
}
.history-tree__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
  font-size: var(--text-sm);
}
.history-tree__line-1,
.history-tree__line-2 {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.history-tree__line-2 {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}
.history-tree__time {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.history-tree__branch {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  white-space: nowrap;
}
.history-tree__badge {
  flex: 0 0 auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 0 var(--space-1);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  white-space: nowrap;
}
.history-tree__badge--head {
  border-color: var(--color-primary);
  color: var(--color-primary-text);
}
.history-tree__badge--live {
  border-color: var(--color-success);
  color: var(--color-success);
}
.history-tree__badge--skipped {
  border-color: var(--color-warning);
  color: var(--color-warning-text);
}
.history-tree__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
}
.history-tree__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
.history-tree__note {
  margin: var(--space-2) 0 0;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.history-tree__more {
  flex: 0 0 auto;
  padding-block: var(--space-2);
}
@media (prefers-reduced-motion: reduce) {
  .history-tree__row { transition: none; }
}
@media (max-width: 48rem) {
  .history-tree__list {
    overflow-y: visible;
    flex: 0 0 auto;
  }
}
@media (max-width: 30rem) {
  .history-tree__lanes { display: none; }
  .history-tree__row {
    margin-inline-start: var(--lane-indent, 0);
    border-inline-start: 3px solid var(--lane-colour, var(--color-border));
    border-start-start-radius: 0;
    border-end-start-radius: 0;
  }
}
</style>
