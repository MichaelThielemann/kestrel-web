import { describe, expect, it } from "vitest";
import { KestrelBootError } from "@michaelthielemann/kestrel";
import { withFieldGrantHint } from "./field-grant-hint";

describe("withFieldGrantHint", () => {
  it("adds, to a grant no pipeline cuts, the options both preset functions need", () => {
    const err = new KestrelBootError("authz/roles", 'attach() threw: authz/roles: anonymousFields grants fields of "news", but no pipeline ends with authz.fields:news', "attach-failed");
    const hinted = withFieldGrantHint(err);
    expect(hinted).toBeInstanceOf(KestrelBootError);
    if (!(hinted instanceof KestrelBootError)) throw new Error("expected a boot error");
    expect(hinted.module).toBe("authz/roles");
    expect(hinted.code).toBe("attach-failed");
    expect(hinted.reason).toContain('anonymousFields grants fields of "news"');
    expect(hinted.reason).toContain('"news": pass the same exclude and overrides to presetModuleConfig({ pipelines }) and definePreset()');
  });

  it("names every such resource once", () => {
    const reason = [
      'attach() threw: authz/roles: anonymousFields grants fields of "news", but no pipeline ends with authz.fields:news',
      'authz/roles: anonymousFields grants fields of "redirects", but no pipeline ends with authz.fields:redirects',
    ].join("\n");
    const hinted = withFieldGrantHint(new KestrelBootError("authz/roles", reason, "attach-failed"));
    expect(hinted instanceof KestrelBootError ? hinted.reason : "").toContain('"news", "redirects": pass the same exclude');
  });

  it("returns any other error unchanged", () => {
    const other = new KestrelBootError("authz/roles", 'attach() threw: authz/roles: pipeline "getMedia" answers anonymous callers but does not end with authz.fields:<resource>?shape=item', "attach-failed");
    expect(withFieldGrantHint(other)).toBe(other);
    const plain = new Error("boom");
    expect(withFieldGrantHint(plain)).toBe(plain);
  });
});
