declare module "@nuxt/schema" {
  interface NuxtConfig {
    kestrel?: {
      blockImagesDir?: string;
      migrationsDir?: string;
    };
  }
  interface NuxtOptions {
    kestrel: {
      blockImagesDir?: string;
      migrationsDir?: string;
    };
  }
}

export {};
