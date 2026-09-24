import { ADMIN_BOOTSTRAP_ROUTES } from "../../fixed-routes";

export interface BootstrapHttpTrigger {
  method: string;
  path: string;
  pipeline: string;
}

/**
 * The admin calls `login`, `logout` and `me` before it can read `GET /admin/schema`, so those three
 * pipelines must sit at their fixed route regardless of a consumer's own trigger list; an alias next
 * to the fixed route is fine. Returns the boot-failure message for the first one that is missing or
 * bound elsewhere, undefined when all three are in place.
 */
export function adminBootstrapProblem(http: readonly BootstrapHttpTrigger[]): string | undefined {
  for (const [pipeline, route] of Object.entries(ADMIN_BOOTSTRAP_ROUTES)) {
    const atFixedRoute = http.some((entry) => entry.pipeline === pipeline && entry.method === route.method && entry.path === route.path);
    if (atFixedRoute) continue;
    const boundElsewhere = http.find((entry) => entry.pipeline === pipeline);
    const found = boundElsewhere === undefined ? "none" : `"${boundElsewhere.method} ${boundElsewhere.path}"`;
    return `admin: pipeline "${pipeline}" must be reachable at "${route.method} ${route.path}" (found: ${found}) – the admin calls it before it can read its capabilities`;
  }
  return undefined;
}
