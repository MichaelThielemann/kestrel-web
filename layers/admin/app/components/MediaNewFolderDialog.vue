<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { isValidFolderName } from '../utils/library'

const props = defineProps<{ open: boolean; busy?: boolean; error?: string | null }>()
const emit = defineEmits<{ create: [string]; 'update:open': [boolean] }>()

const { t } = useT()
const name = ref('')

watch(() => props.open, (o) => { if (o) name.value = '' })

const invalid = computed(() => !!name.value.trim() && !isValidFolderName(name.value.trim()))
const canCreate = computed(() => !!name.value.trim() && !invalid.value)

function onCreate() {
  if (!canCreate.value || props.busy) return
  emit('create', name.value.trim())
}
</script>

<template>
  <KestrelUiDialog :open="open" :title="t('media.newFolder')" @update:open="(v) => emit('update:open', v)">
    <KestrelUiField :label="t('media.folderName')" :error="invalid ? t('media.folderNameInvalid') : null">
      <template #default="f">
        <KestrelUiTextInput v-model="name" :placeholder="t('media.folderNamePlaceholder')" v-bind="f" @keydown.enter="onCreate" />
      </template>
    </KestrelUiField>
    <KestrelUiAlert v-if="error" variant="error">{{ error }}</KestrelUiAlert>
    <template #footer>
      <KestrelUiButton :disabled="busy" @click="emit('update:open', false)">{{ t('common.cancel') }}</KestrelUiButton>
      <KestrelUiButton variant="primary" :disabled="busy || !canCreate" @click="onCreate">{{ t('common.create') }}</KestrelUiButton>
    </template>
  </KestrelUiDialog>
</template>
