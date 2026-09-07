<script setup lang="ts">

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

const route = useRoute()
await navigateTo({ path: '/admin/system', query: { ...route.query, tab: 'references' } }, { replace: true })
</script>

<template>
  <div />
</template>
