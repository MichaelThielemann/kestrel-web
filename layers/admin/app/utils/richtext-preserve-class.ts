import { Mark, Extension } from '@tiptap/vue-3'

const classAttr = {
  class: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute('class'),
    renderHTML: (a: Record<string, unknown>) => (a.class ? { class: a.class } : {}),
  },
}

export const RichtextSpanClass = Mark.create({
  name: 'spanClass',
  parseHTML: () => [{ tag: 'span[class]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', HTMLAttributes, 0],
  addAttributes: () => classAttr,
})

export const RichtextBlockClass = Extension.create({
  name: 'blockClass',
  addGlobalAttributes: () => [{
    types: ['heading', 'paragraph', 'blockquote', 'bulletList', 'orderedList', 'listItem', 'codeBlock'],
    attributes: classAttr,
  }],
})
