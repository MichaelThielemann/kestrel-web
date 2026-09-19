<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const { theme } = useTheme()
const host = ref<HTMLElement | null>(null)

onMounted(() => setAdminPortalHost(host.value))
onUnmounted(() => setAdminPortalHost(null))
</script>

<template>
  <Teleport to="body">
    <div :id="ADMIN_PORTAL_ID" ref="host" class="admin-portal" :data-theme="theme" />
  </Teleport>
</template>
