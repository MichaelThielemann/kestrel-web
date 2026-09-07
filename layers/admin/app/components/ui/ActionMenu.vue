<script setup lang="ts">
import { DropdownMenuRoot, DropdownMenuTrigger, DropdownMenuPortal, DropdownMenuContent, DropdownMenuItem } from 'reka-ui'
import type { MenuItem } from './Menu.vue'

defineProps<{ items: MenuItem[]; label: string; disabled?: boolean; triggerClass?: string }>()
const emit = defineEmits<{ select: [string] }>()
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <button type="button" :class="triggerClass" :disabled="disabled" :aria-label="label">
        <slot />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent class="ui-menu" align="end" :side-offset="4" :collision-padding="8">
        <DropdownMenuItem
          v-for="it in items"
          :key="it.value"
          :disabled="it.disabled"
          class="ui-menu__item"
          :class="{ 'ui-menu__item--danger': it.danger }"
          @select="emit('select', it.value)"
        >{{ it.label }}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
