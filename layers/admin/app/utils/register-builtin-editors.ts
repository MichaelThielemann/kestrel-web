import type { Component } from 'vue'
import { registerCollectionEditor } from './editor-registry'
import FieldsBody from '../components/FieldsBody.vue'
import BlocksBody from '../components/BlocksBody.vue'

registerCollectionEditor('fields', FieldsBody as Component)
registerCollectionEditor('blocks', BlocksBody as Component)
