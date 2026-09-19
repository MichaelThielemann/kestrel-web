# __PROJECT_NAME__

A Kestrel site: a Nuxt 4 app that extends the `@michaelthielemann/kestrel-web` layer and embeds a
Kestrel backend in its own Nitro server. The admin UI is at `/admin`, the public site at `/`.

## First steps

```bash
__INSTALL_COMMAND__
__DEV_COMMAND__
```

Open <http://localhost:3000/admin> and log in with the admin user and the password you chose while
scaffolding. The hash of that password is in `.env` as `KESTREL_ADMIN_PASSWORD_HASH`; `.env` is
git-ignored and never leaves the machine. Create further users under **System → Users**.

`__BUILD_COMMAND__` produces a self-contained `.output`. `.env` is a development convenience — on a
server, set `KESTREL_ADMIN_PASSWORD_HASH`, `KESTREL_BLOBSTORE` and the `KESTREL_S3_*` variables in the
process environment instead. See `.env.example` for the full list.

## Where to change what

| File | Holds |
| --- | --- |
| `shared/model.ts` | locales, collections and their fields, the enabled features |
| `shared/collections-ui.ts` | how each collection looks in the admin: labels, icons, field layout |
| `kestrel.config.ts` | modules, roles and permissions, the bootstrap admin user |
| `app/blocks/*.vue` | the page-builder blocks; the `defineProps` of a block is its schema |
| `nuxt.config.ts` | Nuxt itself; the layer is pulled in through `extends` |
| `.env` / `.env.example` | admin password hash, blobstore choice, S3 credentials |

Adding a block is one new `.vue` file under `app/blocks/`; adding a collection is one entry in
`contentTypes` plus its entry in `shared/collections-ui.ts`. Data (SQLite database and blobs) lives
under `./data/`, which is git-ignored.

## Documentation

- Consuming the layer, end to end: <https://github.com/MichaelThielemann/kestrel-web/blob/main/docs/consuming-kestrel-web.md>
- Architecture of the layer: <https://github.com/MichaelThielemann/kestrel-web/blob/main/docs/architecture.md>
- The Kestrel backend: <https://github.com/MichaelThielemann/kestrel>
