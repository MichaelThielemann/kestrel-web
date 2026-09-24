/** Routes the admin calls before it can read its capabilities. The server does not start when the trigger table binds them elsewhere. */
export const ADMIN_BOOTSTRAP_ROUTES = {
  login: { method: "POST", path: "/login" },
  logout: { method: "POST", path: "/logout" },
  me: { method: "GET", path: "/me" },
} as const;

/** Routes this layer's Nitro server answers itself, outside the kestrel trigger table. */
export const LAYER_ROUTES = {
  schema: { method: "GET", path: "/admin/schema" },
  ready: { method: "GET", path: "/ready" },
  limits: { method: "GET", path: "/limits" },
} as const;
