import type { Component } from 'vue'

export const editorComponents: Record<string, Component> = {}

export const resolveCollectionEditor = (type: string): Component | undefined => editorComponents[type]

export function registerCollectionEditor(type: string, component: Component): void {
  editorComponents[type] = component
}
