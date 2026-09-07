import type { Localized } from "../types/kestrel";
import type { ImageSizeDecl } from "./define-image-sizes";

export interface BlockMeta {
  label?: Localized;
  description?: Localized;
  slots?: string[];
  icon?: string;
  image?: string;
  imageSizes?: ImageSizeDecl[];
  tags?: string[];
}

export function defineBlock<T extends BlockMeta>(meta: T): T {
  return meta;
}
