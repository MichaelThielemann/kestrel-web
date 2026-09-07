import type { CollectionUi } from '../collections-serialize'

export const syntheticCollectionsUi: Record<string, CollectionUi> = {
  settings: {
    label: { singular: { en: 'Settings', de: 'Einstellungen' }, plural: { en: 'Settings', de: 'Einstellungen' } },
    icon: 'settings',
    placement: 'system',
  },
  redirects: {
    label: { singular: { en: 'Redirects', de: 'Weiterleitungen' }, plural: { en: 'Redirects', de: 'Weiterleitungen' } },
    icon: 'link-2',
    placement: 'system',
  },
  pages: {
    label: { singular: { en: 'Page', de: 'Seite' }, plural: { en: 'Pages', de: 'Seiten' } },
    icon: 'file-text',
    editor: 'blocks',
    editorOwned: ['body'],
  },
  news: {
    label: { singular: { en: 'News item', de: 'Meldung' }, plural: { en: 'News', de: 'Meldungen' } },
    icon: 'newspaper',
  },
  profile: {
    label: { singular: { en: 'Profile', de: 'Profil' }, plural: { en: 'Profile', de: 'Profil' } },
    icon: 'user',
    placement: 'system',
  },
  notifications: {
    label: { singular: { en: 'Notifications', de: 'Benachrichtigungen' }, plural: { en: 'Notifications', de: 'Benachrichtigungen' } },
    icon: 'bell',
    placement: 'account',
  },
}
