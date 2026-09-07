export interface ImageSizeDecl {
  name: string;
  width: number;
  height?: number;
  fit?: "inside" | "cover";
  quality?: number;
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
