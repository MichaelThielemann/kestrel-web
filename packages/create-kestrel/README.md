# create-kestrel

Scaffolds a Kestrel site: a Nuxt 4 app that extends the
[`@michaelthielemann/kestrel-web`](https://www.npmjs.com/package/@michaelthielemann/kestrel-web)
layer and embeds a Kestrel backend in its own Nitro server.

```bash
pnpm create kestrel my-site
```

`npm create kestrel@latest my-site`, `yarn create kestrel my-site` and `bun create kestrel my-site`
work the same way. The package has no runtime dependencies and needs Node 22.13 or newer.

## What it asks

Project directory and package name, package manager (prefilled from the one that started it),
default locale and further locales, features, blobstore, and the bootstrap admin user with a
password. The password is hashed with scrypt in the format `@michaelthielemann/kestrel-authn-multi`
verifies and written to `.env` as `KESTREL_ADMIN_PASSWORD_HASH`; no clear-text password and no
credential ever reaches a scaffolded file. `.env.example` carries placeholders only.

Preselected features: `references`, `links`, `delivery`, `redirects`, `images`, `insights`,
`revisions`. The rest of what the preset knows can be switched on: `ratelimit`, `sanitizeSvg`,
`replication`, `migrations`, `audit`, `eventsQueue`.

## Flags

| Flag | Meaning |
| --- | --- |
| `--name <name>` | package name, default the directory name |
| `--pm <manager>` | `pnpm`, `npm`, `yarn` or `bun` |
| `--locales <list>` | comma separated; the first entry is the default locale |
| `--features <list>` | comma separated feature names |
| `--blobstore <kind>` | `filesystem` or `s3`; `s3` writes env placeholders, never credentials |
| `--admin-user <name>` | username of the bootstrap admin |
| `--admin-password <pw>` | or the `KESTREL_ADMIN_PASSWORD` environment variable |
| `--yes` | take every default and never prompt |
| `--force` | scaffold into a directory that is not empty |

With `--yes` and no password given, a random one is generated and printed once at the end.

## What it writes

`package.json`, `nuxt.config.ts`, `kestrel.config.ts`, `shared/model.ts`,
`shared/collections-ui.ts`, two example blocks under `app/blocks/`, `tsconfig.json`,
`pnpm-workspace.yaml` (the `allowBuilds` list Nuxt needs, ignored by the other managers),
`.gitignore`, `.env`, `.env.example` and a README. The sources live as real files under `template/`;
a file whose name starts with `_` is written with a leading dot (`_gitignore` becomes `.gitignore`).

## Versions

`versions.json` pins what the generated `package.json` asks for. It is derived from this
repository's root manifest by `scripts/create-kestrel-versions.mjs`, a test fails when the two
differ, and `prepack` refuses to pack a stale file — so the scaffolded project can never ask for a
layer or engine version this repository does not itself use.

This package keeps its own `version` field; it is not tied to the layer's. Raise it by hand in
`packages/create-kestrel/package.json` whenever the scaffolder or its template changes, in the same
commit. The release workflow publishes every workspace package whose version is not on the registry
yet, so the next layer release picks the new number up on its own.
