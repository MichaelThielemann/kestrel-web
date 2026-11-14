export const MOUNT_PATH = "/api";
export const MEDIA_PUBLIC_PATH = "/media";
export const RESERVED_PAGE_SEGMENTS = [MOUNT_PATH.slice(1), "admin", MEDIA_PUBLIC_PATH.slice(1)] as const;
/** The path prefixes the server answers itself, which no redirect source may take: the API, the admin, the public media, and the build assets, image and preview routes. */
export const SERVED_PATH_PREFIXES = [MOUNT_PATH, "/admin", MEDIA_PUBLIC_PATH, "/_nuxt", "/__nuxt", "/_ipx", "/_preview"] as const;
/** The reserved `settings` field that stores which page each mounted collection lives under. */
export const MOUNTS_FIELD = "mounts";
