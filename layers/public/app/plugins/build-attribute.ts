import { BUILD_ATTRIBUTE } from '@michaelthielemann/kestrel-renderer-nuxt/static-marker'

export default defineNuxtPlugin({
  name: 'kestrel:build-attribute',
  setup() {
    useHead({ htmlAttrs: { [BUILD_ATTRIBUTE]: useRuntimeConfig().app.buildId } })
  },
})
