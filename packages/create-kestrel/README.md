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
password of at least 12 characters that is not on a short list of well-known passwords. The password is hashed with scrypt in the format `@michaelthielemann/kestrel-authn-multi`
verifies and written to `.env` as `KESTREL_ADMIN_PASSWORD_HASH`; no clear-text password and no
credential ever reaches a scaffolded file. `.env.example` carries placeholders only.

Preselected features: `ratelimit`, `sanitizeSvg`, `references`, `links`, `delivery`, `redirects`,
`images`, `insights`, `eventsQueue`, `revisions`. The rest of what the preset knows can be switched on:
`replication`, `migrations`, `audit`. `ratelimit` limits failed logins per client address (five per
minute); leave it out only when something in front of the app limits `POST /api/login` instead. Choosing `delivery` always brings `sanitizeSvg`
along, since every uploaded file is then published next to the site.

With `eventsQueue`, work that follows a write runs in a background worker: an upload answers as soon as
the file is stored and its image variants follow shortly after; publishing a page still completes before
the save returns.

## Flags

| Flag | Meaning |
| --- | --- |
| `--name <name>` | package name, default the directory name |
| `--pm <manager>` | `pnpm`, `npm`, `yarn` or `bun`; only `pnpm` pins `packageManager` and gets the supply-chain settings described below |
| `--locales <list>` | comma separated; the first entry is the default locale |
| `--features <list>` | comma separated feature names |
| `--blobstore <kind>` | `filesystem` or `s3`; `s3` writes env placeholders, never credentials |
| `--admin-user <name>` | username of the bootstrap admin |
| `--admin-password <pw>` | or the `KESTREL_ADMIN_PASSWORD` environment variable; see below |
| `--yes` | take every default and never prompt |
| `--force` | scaffold into a directory that is not empty |

With `--yes` and no password given, a random one is generated and printed once at the end.

An argument is visible to every user of the machine in the process list while the command runs. Set the
`KESTREL_ADMIN_PASSWORD` environment variable instead of `--admin-password` on a shared machine or in a CI log.

## What it writes

`package.json`, `nuxt.config.ts`, `kestrel.config.ts`, `shared/model.ts`,
`shared/collections-ui.ts`, two example blocks under `app/blocks/`, `tsconfig.json`,
`pnpm-workspace.yaml` (the `allowBuilds` list Nuxt needs, the supply-chain settings below and the `overrides` that resolve Nuxt's
`glob` and `minimatch` to releases without known advisories, ignored by the other managers, and an
`auditConfig` that ignores the single advisory GHSA-gcqx-w48m-w2h4 in `deepmerge`, which only Nuxt's build
toolchain pulls in; `nuxt` is a dependency, so `pnpm audit --prod` lists it too. The entry stays until it is
removed; review it no later than 2027-02-13),
`.gitignore`, `.env`, `.env.example` and a README. `.env` is created readable and writable by its owner only
(mode `0600`, also when it replaces an existing file; Windows has no such mode). The generated project has
`@michaelthielemann/kestrel-cli` as a dev dependency and a `check` script, so `pnpm check` runs
`kestrel check` against it; the project then needs Node 22.18 or newer. The sources live as real files under `template/`;
a file whose name starts with `_` is written with a leading dot (`_gitignore` becomes `.gitignore`).

## Supply-chain settings

With `--pm pnpm` the generated `pnpm-workspace.yaml` asks pnpm to install only releases that are at least
three days old (`minimumReleaseAge`), to refuse a package whose publishing trust is weaker than an earlier
release's (`trustPolicy: no-downgrade`; releases published more than 90 days ago are not checked,
`trustPolicyIgnoreAfter`) and to refuse dependencies of dependencies that come from a git
repository or a tarball URL (`blockExoticSubdeps`). The packages under `@michaelthielemann/` are excluded
from the age check (`minimumReleaseAgeExclude`), so a freshly published `kestrel-web` or `kestrel` is
installable at once. `package.json` pins `packageManager` to the pnpm release this repository runs, so
corepack uses the same one.

With `npm`, `yarn` or `bun` the file is still written, but those managers ignore it and
`package.json` has no `packageManager` field. Any release-age delay for those managers has to be set in their own configuration.

## Versions

`versions.json` pins what the generated `package.json` asks for. It is derived from this
repository's root manifest by `scripts/create-kestrel-versions.mjs`, a test fails when the two
differ, and `prepack` refuses to pack a stale file — so the scaffolded project can never ask for a
layer or engine version this repository does not itself use.
