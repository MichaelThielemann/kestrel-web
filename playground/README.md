# playground

The reference consumer of the `kestrel-web` layer, used for local development: `pnpm dev` from the
repo root runs this app, and `pnpm test`'s component project boots it.

It is the smallest complete app on the layer — `nuxt.config.ts` (which extends `..` instead of the
published package), `kestrel.config.ts`, `shared/model.ts`, `shared/collections-ui.ts`,
`shared/block-tags.ts`, `app/blocks/*.vue` and `app/image-sizes.ts`. It needs neither
`kestrel.modules.ts` nor a `pipelines/` directory, because every module it configures is a standard
one and it adds no pipelines of its own; `../docs/consuming-kestrel-web.md` explains what each file
does and when those two optional files become necessary.
