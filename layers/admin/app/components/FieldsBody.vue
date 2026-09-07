<script setup lang="ts">

const ctx = useEditorFormContext()
</script>

<template>
  <div class="editor__flat">
    <KestrelPageFieldsPane v-bind="ctx.pageFieldsBindings.value" v-on="ctx.pageFieldsHandlers" />
  </div>
</template>

<style lang="scss">

.editor__flat {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
</style>
