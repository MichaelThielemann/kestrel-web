import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { definePreset, featureOrder, staticPipelineNames } from "./index";
import type { Feature } from "./index";
import { DEFAULT_COLLECTIONS, collectionPipelines, isGenericCollection, pipelinesByName } from "./collections";

const allFeaturesRecord = {
  ratelimit: 1,
  sanitizeSvg: 1,
  references: 1,
  links: 1,
  delivery: 1,
  redirects: 1,
  images: 1,
  replication: 1,
  migrations: 1,
  audit: 1,
  insights: 1,
  eventsQueue: 1,
  revisions: 1,
  mfa: 1,
} satisfies Record<Feature, 1>;

const allModules = [
  { use: "@michaelthielemann/kestrel-blobstore-filesystem" },
  { use: "@michaelthielemann/kestrel-replication-sqlite" },
  { use: "@michaelthielemann/kestrel-persistence-sqlite" },
  { use: "@michaelthielemann/kestrel-sanitize-svg" },
  { use: "@michaelthielemann/kestrel-media-default", config: { trashRetentionDays: 30 } },
  { use: "@michaelthielemann/kestrel-images-default" },
  { use: "@michaelthielemann/kestrel-authn-multi" },
  { use: "@michaelthielemann/kestrel-authz-roles" },
  { use: "@michaelthielemann/kestrel-content-default" },
  { use: "@michaelthielemann/kestrel-references-default" },
  { use: "@michaelthielemann/kestrel-links-default" },
  { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: { "pages.body": "x", "redirects.rules": "y" } } },
  { use: "@michaelthielemann/kestrel-renderer-nuxt" },
  { use: "@michaelthielemann/kestrel-delivery-static", config: { dependencies: { render: "events" } } },
  { use: "@michaelthielemann/kestrel-redirects-default" },
  { use: "@michaelthielemann/kestrel-audit-persistence", config: { retentionDays: 365 } },
  { use: "@michaelthielemann/kestrel-events-inmemory" },
  { use: "@michaelthielemann/kestrel-events-queue", config: { lanes: { pages: ["republishOutput", "refreshLlms"], indexes: ["refreshIndexes"], variants: ["generateImageVariants"] } } },
  { use: "@michaelthielemann/kestrel-ratelimit-memory" },
  { use: "@michaelthielemann/kestrel-migrations-default" },
  { use: "@michaelthielemann/kestrel-insights" },
  { use: "@michaelthielemann/kestrel-revisions-default" },
  { use: "@michaelthielemann/kestrel-mfa-totp", config: { secretKey: "5a".repeat(32) } },
];

const KEEPS_HISTORICAL_NAMES = new Set(["pages"]);

describe("featureOrder", () => {
  it("covers exactly the Feature union", () => {
    expect([...featureOrder].sort()).toEqual(Object.keys(allFeaturesRecord).sort());
  });
});

describe("staticPipelineNames", () => {
  it("equals definePreset's pipeline names for every feature and the default collections, minus collection-derived names", () => {
    const preset = definePreset({ modules: allModules, features: featureOrder, collections: DEFAULT_COLLECTIONS });
    const generated = new Set(preset.pipelines.map((pipeline) => pipeline.name));

    for (const [name, model] of Object.entries(DEFAULT_COLLECTIONS)) {
      if (KEEPS_HISTORICAL_NAMES.has(name) || !isGenericCollection(name)) continue;
      for (const pipelineName of Object.keys(pipelinesByName(collectionPipelines(name, model)))) generated.delete(pipelineName);
    }

    expect(generated).toEqual(new Set(staticPipelineNames));
  });
});

describe("HTTP triggers", () => {
  it("binds every composed pipeline to at most one HTTP trigger", () => {
    const preset = definePreset({ modules: allModules, features: featureOrder, collections: DEFAULT_COLLECTIONS });
    const httpTriggers = preset.triggers.filter((trigger): trigger is { http: string; pipeline: string } => "http" in trigger);

    const perPipeline = new Map<string, string[]>();
    for (const trigger of httpTriggers) {
      const existing = perPipeline.get(trigger.pipeline) ?? [];
      existing.push(trigger.http);
      perPipeline.set(trigger.pipeline, existing);
    }
    const boundTwice = [...perPipeline.entries()].filter(([, triggers]) => triggers.length > 1);

    expect(boundTwice).toEqual([]);
  });
});

describe("the features table in docs/consuming-kestrel-web.md", () => {
  it("lists exactly the features in featureOrder", () => {
    const docsPath = fileURLToPath(new URL("../../../docs/consuming-kestrel-web.md", import.meta.url));
    const doc = readFileSync(docsPath, "utf-8");
    const start = doc.indexOf("### Features\n");
    const afterHeading = doc.slice(start + "### Features\n".length);
    const end = afterHeading.search(/\n#{1,6} /);
    const section = end === -1 ? afterHeading : afterHeading.slice(0, end);

    const names = [...section.matchAll(/^\|\s*`([a-zA-Z]+)`\s*\|/gm)].map((match) => match[1]);

    expect(names.length).toBeGreaterThan(0);
    expect([...names].sort()).toEqual([...featureOrder].sort());
  });
});

describe("docs/deployment.md", () => {
  const doc = readFileSync(fileURLToPath(new URL("../../../docs/deployment.md", import.meta.url)), "utf-8");
  const section = (heading: string): string => {
    const start = doc.indexOf(`\n## ${heading}`);
    expect(start).toBeGreaterThan(-1);
    const rest = doc.slice(start + 1);
    const end = rest.slice(3).search(/\n## /);
    return end === -1 ? rest : rest.slice(0, end + 3);
  };

  it("restarts the systemd unit after a failure with a delay longer than the instance lock retries need", () => {
    const unit = section("5. systemd");
    expect(unit).toContain("Restart=on-failure");
    expect(unit).toContain("RestartSec=15s");
    expect(unit).not.toMatch(/^RestartSec=5$/m);
  });

  it("explains when the instance lock is taken over after each kind of stop", () => {
    const text = section("10. Zero downtime, and why there is none");
    expect(text).toContain("instance-locked");
    expect(text).toContain("allowConcurrentProcesses");
    expect(text).toMatch(/clean stop[^.]*at once/);
    expect(text).toMatch(/crash[^.]*same machine[^.]*at once/);
    expect(text).toMatch(/power loss[^.]*60 seconds/);
  });

  it("names the step log variable and the three values", () => {
    const env = section("2. Environment");
    expect(env).toContain("KESTREL_STEP_LOG");
    for (const value of ["all", "errors", "off"]) expect(env).toContain(`\`${value}\``);
  });

  it("keeps the instance lock sidecar out of backups", () => {
    expect(section("3. Persistent state")).toContain("kestrel.db.instance");
  });

  it("says that the queue claims no further row once stop begins, after the open requests ended", () => {
    const text = section("10. Zero downtime, and why there is none");
    expect(text).toMatch(/claim no further row/);
    expect(text).not.toMatch(/while the process drains its running requests/);
    expect(text).toContain("NITRO_SHUTDOWN_TIMEOUT");
    expect(text).toMatch(/open requests/);
  });

  it("promises step lines in the log section only for the mode that writes them", () => {
    const logs = section("11. Reading the logs");
    expect(logs).not.toMatch(/\*\*One `step` line per pipeline step\*\*, with the same `runId`/);
    expect(logs).toMatch(/One `step` line per pipeline step[^\n]*KESTREL_STEP_LOG/);
    expect(logs).not.toMatch(/and the `step` lines\s+of its `runId`, explain the failure/);
    expect(logs).toMatch(/`error` line/);
  });

  it("says that KESTREL_STEP_LOG only works where the config passes envStepLog()", () => {
    const env = section("2. Environment");
    const row = env.split("\n").find((line) => line.startsWith("| `KESTREL_STEP_LOG`"));
    expect(row).toContain("stepLog: envStepLog()");
    expect(row).toContain("#kestrel/config");
    expect(env).toMatch(/`envStepLog\(\)` is optional[\s\S]*?does not call it/);
    expect(section("4. A worked run")).toMatch(/KESTREL_STEP_LOG[^\n]*\n?[^\n]*(envStepLog|§2)/);
  });

  it("does not promise a restart on a lost instance lock from a unit that only reacts to process exit", () => {
    const text = section("8. Health, readiness and restarts");
    expect(text).toMatch(/Restart=on-failure[^.]*(only|does not)[^.]*(exit|\/api\/health)/);
    expect(text).toMatch(/did not renew|was not renewed/);
    expect(text).not.toMatch(/failed to renew it for longer than the TTL/);
    const unit = section("5. systemd");
    expect(unit).toContain("mysite-health.timer");
    expect(unit).toContain("%{http_code}");
    expect(unit).toContain("systemctl restart mysite");
  });

  it("lists only the security entries the audit feature writes, with the cases it does not cover", () => {
    const text = section("11. Reading the logs");
    expect(text).toContain("user.secondFactorReset");
    expect(text).not.toContain("a session ended");
    expect(text).toMatch(/IP allowlist/);
    expect(text).toMatch(/a 403 or 429 kestrel answered/);
  });

  it("says that deleting a user writes no entry and strips the user from all of their entries", () => {
    const text = section("11. Reading the logs").replace(/\s+/g, " ");
    expect(text).toMatch(/[Dd]eleting a user writes no entry of its own/);
    expect(text).toMatch(/identityId[^.]*every (param|parameter)/);
    expect(text).toMatch(/collect the entries before the deletion/);
  });

  it("states the stop windows of the systemd unit and of Cloud Foundry with their units", () => {
    expect(section("5. systemd")).toMatch(/^TimeoutStopSec=90s$/m);
    const text = section("10. Zero downtime, and why there is none");
    expect(text).toMatch(/NITRO_SHUTDOWN_TIMEOUT` \(milliseconds, 30000 by default\)/);
    expect(text).not.toContain("NITRO_SHUTDOWN_TIMEOUT (30 s by default)");
    expect(text).not.toContain("systemd's default of 90 s");
    expect(text).toMatch(/45 s/);
    const cf = text.slice(text.indexOf("### Cloud Foundry"), text.indexOf("### Re-rendering"));
    expect(cf).toContain("NITRO_SHUTDOWN_TIMEOUT");
    expect(cf).toContain("shutdownTimeoutMs");
    expect(cf).toMatch(/10 s/);
    expect(cf).toMatch(/NITRO_SHUTDOWN_TIMEOUT=4000/);
    expect(cf).toMatch(/shutdownTimeoutMs: 2000/);
    expect(cf).toMatch(/frames written since the last (replication )?sync/);
  });

  it("restricts the wait for the lock TTL to stops that end without an exit", () => {
    const wait = [section("5. systemd"), section("10. Zero downtime, and why there is none")].join("\n");
    expect(wait).not.toMatch(/power loss or a restart of the machine/);
    expect(wait).toMatch(/power loss, a hard reset or a crash of the machine/);
    expect(wait).toMatch(/orderly (reboot|restart of the machine)[^.]*releases the lock/);
  });

  it("asks for a container restart policy that retries for longer than the lock TTL", () => {
    const text = section("6. Container").replace(/\s+/g, " ");
    expect(text).toMatch(/--restart unless-stopped/);
    expect(text).toMatch(/longer than 60 s/);
    expect(text).toContain("§10");
  });
});

describe("docs/consuming-kestrel-web.md", () => {
  const doc = readFileSync(fileURLToPath(new URL("../../../docs/consuming-kestrel-web.md", import.meta.url)), "utf-8");

  it("restricts the replication-sqlite override of allowConcurrentProcesses to the replication feature", () => {
    const start = doc.indexOf("**One process per database file.**");
    expect(start).toBeGreaterThan(-1);
    const bullet = doc.slice(start, doc.indexOf("Anything the builder doesn't expose", start));
    expect(bullet).toMatch(/replication-sqlite[^.]*only[^.]*`replication` feature/);
  });
});
