<script setup lang="ts">
import { ref, computed } from 'vue'
import { splitPathInput, joinFolder, displayFolderPath } from '../utils/library'

const props = defineProps<{ folder: string; folders: string[] }>()
const emit = defineEmits<{ navigate: [string] }>()

const { t } = useT()

const editing = ref(false)
const draft = ref('')

const segments = computed(() => {
  const out: { label: string; path: string }[] = []
  let acc = ''
  for (const s of props.folder.split('/').filter(Boolean)) { acc = acc ? `${acc}/${s}` : s; out.push({ label: s, path: acc }) }
  return out
})

const suggestions = computed(() => {
  if (!editing.value) return []
  const { parent, fragment } = splitPathInput(draft.value)
  const base = joinFolder(parent)
  const frag = fragment.toLowerCase()
  return props.folders.filter((path) => {
    const at = path.lastIndexOf('/')
    const inParent = (at === -1 ? '' : path.slice(0, at)) === base
    return inParent && path.slice(at + 1).toLowerCase().includes(frag)
  })
})

function startEdit() { draft.value = displayFolderPath(props.folder); editing.value = true }
function commit(path: string) { editing.value = false; emit('navigate', path) }
function cancel() { editing.value = false }
</script>

<template>
  <div class="media-pathbar">
    <template v-if="!editing">
      <nav class="media-pathbar__segments" :aria-label="t('mediaPath.navAriaLabel')">
        <KestrelUiButton type="button" variant="ghost" size="sm" class="media-pathbar__seg media-pathbar__seg--root" @click="emit('navigate', '')">/</KestrelUiButton>
        <template v-for="seg in segments" :key="seg.path">
          <KestrelUiButton type="button" variant="ghost" size="sm" class="media-pathbar__seg" @click="emit('navigate', seg.path)">{{ seg.label }}</KestrelUiButton>
          <span class="media-pathbar__sep" aria-hidden="true">/</span>
        </template>
      </nav>
      <KestrelUiButton type="button" data-test="path-edit" variant="ghost" size="sm" icon="pencil" :aria-label="t('mediaPath.editAriaLabel')" @click="startEdit" />
    </template>
    <div v-else class="media-pathbar__editor">
      <KestrelUiTextInput
        v-model="draft"
        class="media-pathbar__input"
        slim
        :aria-label="t('mediaPath.inputAriaLabel')"
        @keydown.enter="commit(joinFolder(draft))"
        @keydown.esc="cancel"
      />
      <ul v-if="suggestions.length" class="media-pathbar__suggestions">
        <li v-for="s in suggestions" :key="s">
          <button type="button" @click="commit(s)">{{ displayFolderPath(s) }}</button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.media-pathbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  position: relative;

  &__segments {
    display: flex;
    align-items: center;
    gap: 0;
    flex-wrap: wrap;
  }

  &__seg--root {
    color: var(--color-text-muted);
  }

  &__sep {
    color: var(--color-text-muted);
  }

  &__input {
    min-width: 18rem;
  }

  &__suggestions {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: var(--z-dropdown);
    list-style: none;
    margin: var(--space-1) 0 0;
    padding: var(--space-1);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    min-width: 18rem;

    button {
      display: block;
      width: 100%;
      text-align: left;
      background: none;
      border: 0;
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-sm);
      cursor: pointer;

      &:hover {
        background: var(--color-hover);
      }
    }
  }
}
</style>
