export const MOUNT_PATH = "/api";
export const MEDIA_PUBLIC_PATH = "/media";
export const RESERVED_PAGE_SEGMENTS = [MOUNT_PATH.slice(1), "admin", MEDIA_PUBLIC_PATH.slice(1)] as const;
/** The reserved `settings` field that stores which page each mounted collection lives under. */
export const MOUNTS_FIELD = "mounts";
