import { describe, expect, it } from "vitest";
import { adminBootstrapProblem } from "./admin-bootstrap";

const FIXED = [
  { method: "POST", path: "/login", pipeline: "login" },
  { method: "POST", path: "/logout", pipeline: "logout" },
  { method: "GET", path: "/me", pipeline: "me" },
];

describe("adminBootstrapProblem", () => {
  it("accepts a trigger table with all three bootstrap routes at their fixed path", () => {
    expect(adminBootstrapProblem(FIXED)).toBeUndefined();
  });

  it("reports login bound to another path", () => {
    const http = [{ method: "POST", path: "/signin", pipeline: "login" }, ...FIXED.slice(1)];
    expect(adminBootstrapProblem(http)).toBe(
      'admin: pipeline "login" must be reachable at "POST /login" (found: "POST /signin") – the admin calls it before it can read its capabilities',
    );
  });

  it("reports an excluded login", () => {
    const http = FIXED.slice(1);
    expect(adminBootstrapProblem(http)).toBe(
      'admin: pipeline "login" must be reachable at "POST /login" (found: none) – the admin calls it before it can read its capabilities',
    );
  });

  it("accepts an alias next to the fixed route", () => {
    const http = [...FIXED, { method: "POST", path: "/auth/login", pipeline: "login" }];
    expect(adminBootstrapProblem(http)).toBeUndefined();
  });

  it("reports the first missing pipeline in login, logout, me order", () => {
    const http = [{ method: "POST", path: "/login", pipeline: "login" }];
    expect(adminBootstrapProblem(http)).toContain('pipeline "logout"');
  });
});
