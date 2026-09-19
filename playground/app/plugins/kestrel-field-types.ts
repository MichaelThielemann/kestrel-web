import { defineAsyncComponent } from 'vue'

export default defineNuxtPlugin(() => {
  registerFieldComponent('color', defineAsyncComponent(() => import('../components/ColorField.vue')))
})
