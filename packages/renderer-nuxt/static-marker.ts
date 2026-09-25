/** Attribute on `<html>` that names how a page is delivered; only the renderer writes it, into the exported HTML. */
export const DELIVERY_ATTRIBUTE = "data-kestrel-delivery";

/** Value of {@link DELIVERY_ATTRIBUTE} on a page exported for a static host. */
export const STATIC_DELIVERY = "static";

/** Attribute on `<html>` that names the build that rendered the page, on every public page, live or exported. */
export const BUILD_ATTRIBUTE = "data-kestrel-build";
