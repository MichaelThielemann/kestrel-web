<script setup lang="ts">
import { watch, watchEffect } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { StarterKit } from '@tiptap/starter-kit'
import { Highlight } from '@tiptap/extension-highlight'
import { Subscript } from '@tiptap/extension-subscript'
import { Superscript } from '@tiptap/extension-superscript'
import { TextAlign } from '@tiptap/extension-text-align'
import RichtextToolbar from './RichtextToolbar.vue'
import { RichtextSpanClass, RichtextBlockClass } from '../../utils/richtext-preserve-class'
import { RICHTEXT_LINK_SCHEME } from '#kestrel/utils/kestrel'

const props = withDefaults(
  defineProps<{
    disabled?: boolean
    locale?: string

    ariaLabel?: string
    describedby?: string
    invalid?: boolean
    required?: boolean
  }>(),
  { disabled: false },
)
const model = defineModel<string | null>()

let lastDoc: unknown = null

const editor = useEditor({
  content: model.value ?? '',
  editable: !props.disabled,

  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },

      link: { openOnClick: false, protocols: [RICHTEXT_LINK_SCHEME], HTMLAttributes: { target: null, rel: null } },
    }),
    Highlight,
    Subscript,
    Superscript,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    RichtextSpanClass, RichtextBlockClass,
  ],
  onCreate: ({ editor }) => {
    lastDoc = editor.state.doc
  },
  onUpdate: ({ editor }) => {
    if (editor.state.doc === lastDoc) return
    lastDoc = editor.state.doc
    model.value = editor.isEmpty ? '' : editor.getHTML()
  },
})

watch(model, (value) => {
  const e = editor.value
  if (!e) return
  const next = value ?? ''
  const current = e.isEmpty ? '' : e.getHTML()

  if (next !== current) {
    e.commands.setContent(next, { emitUpdate: false })
    lastDoc = e.state.doc
  }
})

watch(() => props.disabled, (d) => editor.value?.setEditable(!d, false))

function setAttr(el: HTMLElement, name: string, value?: string) {
  if (value) el.setAttribute(name, value)
  else el.removeAttribute(name)
}
watchEffect(() => {
  const dom = editor.value?.view?.dom as HTMLElement | undefined
  if (!dom) return
  dom.setAttribute('role', 'textbox')
  dom.setAttribute('aria-multiline', 'true')
  setAttr(dom, 'aria-label', props.ariaLabel)
  setAttr(dom, 'aria-describedby', props.describedby)
  setAttr(dom, 'aria-invalid', props.invalid ? 'true' : undefined)
  setAttr(dom, 'aria-required', props.required ? 'true' : undefined)
})
</script>

<template>
  <div class="ui-richtext">
    <RichtextToolbar :editor="editor" :locale="locale" :disabled="disabled" />
    <EditorContent v-if="editor" :editor="editor" class="ui-richtext__content" />
  </div>
</template>

<style lang="scss">
.ui-richtext {
  border: 1px solid var(--color-control-border, var(--color-border));
  border-radius: var(--radius-md);
  background: var(--color-surface);

  &__content {
    .ProseMirror { white-space: pre-wrap; }
    .tiptap {
      padding: var(--space-2) var(--space-4);
      min-height: 8rem;
      outline: none;

      :where(p, ul, ol, blockquote, pre, h1, h2, h3, h4, h5, h6) { margin: 0 0 var(--space-3); }
      :where(p, ul, ol, blockquote, pre, h1, h2, h3, h4, h5, h6):last-child { margin-bottom: 0; }
      ul, ol { padding-inline-start: var(--space-5); }
      blockquote {
        border-inline-start: 3px solid var(--color-border);
        padding-inline-start: var(--space-3);
        color: var(--color-text-muted);
      }
      pre {
        background: var(--color-bg);
        padding: var(--space-3);
        border-radius: var(--radius-sm);
        overflow-x: auto;
      }
      code { font-family: monospace; }
      a { color: var(--color-primary); }
      mark { background: var(--color-highlight); color: var(--color-on-highlight); }
      hr { border: 0; border-top: 1px solid var(--color-border); margin: var(--space-4) 0; }
    }
  }
}
</style>
