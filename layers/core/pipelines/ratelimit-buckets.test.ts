import { describe, expect, it } from "vitest";
import { effectiveModuleConfig } from "@michaelthielemann/kestrel";
import { definePipeline } from "@michaelthielemann/kestrel/definePipeline";
import { withLayerBuckets } from "./ratelimit-buckets";

const RATELIMIT = "@michaelthielemann/kestrel-ratelimit-memory";
const AUTHN = "@michaelthielemann/kestrel-authn-multi";
const MFA = "@michaelthielemann/kestrel-mfa-totp";

const login = definePipeline({ name: "login", steps: ["ratelimit.check:login", "ratelimit.check:loginAccount", "authn.login", "mfa.check", "ratelimit.rememberDevice:loginAccount"] });

function ratelimitConfig(modules: { use: string; config?: unknown }[]): unknown {
  const entry = withLayerBuckets(modules, [login]).find((m) => m.use === RATELIMIT);
  return entry === undefined ? undefined : effectiveModuleConfig(entry);
}

describe("withLayerBuckets", () => {
  it("gives a written loginAccount without field the field the login reads", () => {
    const config = ratelimitConfig([
      { use: AUTHN, config: { identifier: "email" } },
      { use: RATELIMIT, config: { buckets: { login: { limit: 5, windowSeconds: 60 }, loginAccount: { limit: 10, windowSeconds: 300, key: "username", counts: "failures" } } } },
    ]);
    expect(config).toMatchObject({ buckets: { loginAccount: { field: "email", knownDevices: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900 } } } });
  });

  it("keeps a field that is written", () => {
    const config = ratelimitConfig([
      { use: AUTHN, config: { identifier: "email" } },
      { use: RATELIMIT, config: { buckets: { loginAccount: { limit: 10, windowSeconds: 300, key: "username", field: "username", counts: "failures" } } } },
    ]);
    expect(config).toMatchObject({ buckets: { loginAccount: { field: "username" } } });
  });

  it("signs device cookies with the second factor's keys when there is no device key", () => {
    const config = ratelimitConfig([
      { use: AUTHN, config: {} },
      { use: MFA, config: { secretKey: "cd".repeat(32), previousSecretKeys: ["ef".repeat(32)] } },
      { use: RATELIMIT, config: { buckets: { login: { limit: 5, windowSeconds: 60 } } } },
    ]);
    expect(config).toMatchObject({ deviceCookies: { secretKey: "cd".repeat(32), previousSecretKeys: ["ef".repeat(32)], secure: true } });
  });
});
