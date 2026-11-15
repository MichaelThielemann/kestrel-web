/** The hash of the password `change-me`, which `adminPasswordHash()` falls back to outside production. Public, never a secret. */
export const DEVELOPMENT_ADMIN_PASSWORD_HASH =
  "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98";

/** The second-factor sealing key `mfaKey()` falls back to outside production. Public, never a secret. */
export const DEVELOPMENT_MFA_KEY = "6465762d6f6e6c792d6d66612d6b65792d6e6f742d666f722d70726f64756374";
