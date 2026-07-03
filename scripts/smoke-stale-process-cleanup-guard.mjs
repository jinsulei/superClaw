import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS ${message}`);
  }
}

const lifecycle = read("src-tauri/src/agent_lifecycle.rs");
const hermes = read("src-tauri/src/commands/hermes.rs");
const lib = read("src-tauri/src/lib.rs");

for (const port of [1420, 8642, 3020, 18789]) {
  assert(
    lifecycle.includes(`(${port},`) || lifecycle.includes(`port == ${port}`),
    `STALE_PROCESS_PORT_${port}_COVERED`
  );
}

assert(
  lifecycle.includes("cleanup_stale_project_port_owners_on_startup"),
  "STARTUP_STALE_PORT_CLEANUP_FUNCTION_EXISTS"
);

assert(
  lib.includes("cleanup_stale_project_port_owners_on_startup()"),
  "STARTUP_CALLS_STALE_PORT_CLEANUP"
);

assert(
  lifecycle.includes("cleanup_verified_stale_port_owners"),
  "VERIFIED_STALE_PORT_OWNER_CLEANUP_EXISTS"
);

assert(
  lifecycle.includes("process_details_match_root") &&
    lifecycle.includes("stale_superclaw_marker") &&
    lifecycle.includes("skip port owner"),
  "PORT_OWNER_CLASSIFICATION_LOGS_AND_SKIP_PATH_EXIST"
);

assert(
  hermes.includes("cleanup_verified_stale_port_owners") &&
    hermes.includes("ManagedAgent::Hermes"),
  "HERMES_USES_VERIFIED_PORT_CLEANUP"
);

assert(
  !/args\(\[\s*"\/F"\s*,\s*"\/IM"\s*,\s*"hermes\.exe"\s*\]\)/.test(hermes),
  "HERMES_NO_GLOBAL_IMAGE_KILL"
);

assert(
  !/Get-NetTCPConnection[\s\S]{0,240}taskkill[\s\S]{0,80}ownerPid/.test(hermes),
  "HERMES_NO_BLIND_PORT_TASKKILL"
);

if (process.exitCode) {
  process.exit(process.exitCode);
}
