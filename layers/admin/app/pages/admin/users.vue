<script setup lang="ts">

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

const route = useRoute()
await navigateTo({ path: '/admin/system', query: { ...route.query, tab: 'users' } }, { replace: true })
</script>

<template>
  <div />
</template>
