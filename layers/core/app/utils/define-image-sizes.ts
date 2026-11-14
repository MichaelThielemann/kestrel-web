import type { Localized } from "../types/kestrel";

export interface ImageSizeDecl {
  name: string;
  width: number;
  height?: number;
  fit?: "inside" | "cover";
  quality?: number;
  /** What the size is used for, shown with it in the admin's crop editor; only in `app/image-sizes.ts`, since the admin names a block's sizes after the block. Never part of the size sent to the backend. */
  label?: Localized;
}

export interface ImageSize {
  name: string;
  width: number;
  height?: number;
  fit: "inside" | "cover";
  format: "webp";
  quality: number;
}

export function defineImageSizes<T extends readonly ImageSizeDecl[]>(sizes: T): T {
  return sizes;
}
