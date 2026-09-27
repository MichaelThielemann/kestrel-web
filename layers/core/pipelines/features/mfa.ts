import { REQUIRE_RECENT_AUTH, type PresetContext } from "../base";
import type { FeatureModule } from "../index";

export const MFA_MODULE = "@michaelthielemann/kestrel-mfa-totp";

/** The event `resetSecondFactor` emits, recorded by the `audit` feature's `auditUsers`. */
export const SECOND_FACTOR_RESET_EVENT = "user.secondFactorReset";

export default function mfa(_context: PresetContext): FeatureModule {
  return {
    modules: [MFA_MODULE],
    pipelines: {
      setupSecondFactor: ["mfa.startSetup"],
      secondFactorUsers: ["authn.requireUser", "authz.require:users.manage", "mfa.listEnrolled"],
      resetSecondFactor: ["authn.requireUser", "authz.require:users.manage", REQUIRE_RECENT_AUTH, "mfa.reset", "authn.endSessions", `events.emit:${SECOND_FACTOR_RESET_EVENT}`],
      forgetSecondFactor: ["mfa.forget"],
    },
    patches: [
      { pipeline: "login", steps: ["mfa.check"], at: "after", anchor: "authn.login" },
      { pipeline: "setupSecondFactor", steps: ["ratelimit.check:login", "ratelimit.check:loginAccount"], at: "start", when: "ratelimit" },
    ],
    triggers: [
      { http: "POST /login/second-factor", pipeline: "setupSecondFactor" },
      { http: "GET /users/second-factor", pipeline: "secondFactorUsers" },
      { http: "DELETE /users/:id/second-factor", pipeline: "resetSecondFactor" },
      { event: "user.deleted", pipeline: "forgetSecondFactor" },
    ],
  };
}
