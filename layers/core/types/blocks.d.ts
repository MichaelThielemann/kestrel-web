declare module "#kestrel/blocks" {
  export const blockDefinitions: import("../app/types/kestrel").SerializedBlock[];
  export const blockComponents: Record<string, import("vue").Component>;
  export const imageSizes: import("../app/utils/define-image-sizes").ImageSize[];
  export const imageSizeLabels: Record<string, import("../app/types/kestrel").Localized>;
}

declare module "#kestrel/block-images" {
  export const blockImages: Record<string, string>;
}
