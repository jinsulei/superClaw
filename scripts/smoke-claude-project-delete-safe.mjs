import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const serverPath = path.join(repoRoot, "src-tauri", "resources", "runtime", "claude-panel", "server.js");
const stamp = `${Date.now()}-${process.pid}`;
const baseRoot = process.platform === "win32"
  ? path.join("C:\\tmp", `claude-project-delete-smoke-${stamp}`)
  : path.join(os.tmpdir(), `claude-project-delete-smoke-${stamp}`);
const dataDir = path.join(baseRoot, "data");
const homeDir = path.join(baseRoot, "home");
const projectsRoot = path.join(baseRoot, "managed-projects");
const port = 33200 + (process.pid % 1000);
const adminPort = port + 1000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function request(method, route, body = undefined, expectedOk = true) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (expectedOk && !response.ok) {
    throw new Error(`${method} ${route} failed: ${response.status} ${data.error || ""}`);
  }
  return { response, data };
}

async function waitForServer(child) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    if (child.exitCode !== null) throw new Error(`Claude Panel server exited early: ${child.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/status`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for Claude Panel test server");
}

fs.mkdirSync(baseRoot, { recursive: true });

const child = spawn(process.execPath, [serverPath], {
  cwd: repoRoot,
  env: {
    ...process.env,
    PORT: String(port),
    CLEAN_PANEL_ADMIN_PORT: String(adminPort),
    CLEAN_PANEL_DATA_DIR: dataDir,
    CLEAN_PANEL_HOME_DIR: homeDir,
    CLEAN_PANEL_PROJECTS_ROOT: projectsRoot,
    CLEAN_PANEL_CLAUDE_PROJECTS_JSON_PATH: path.join(homeDir, ".claude.json"),
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

child.stdout.on("data", () => {});
child.stderr.on("data", (chunk) => {
  const text = String(chunk || "").trim();
  if (text) process.stderr.write(`${text}\n`);
});

try {
  await waitForServer(child);

  const demoProject = path.join(baseRoot, "demo-project");
  const demoReadme = path.join(demoProject, "README.md");
  fs.mkdirSync(demoProject, { recursive: true });
  fs.writeFileSync(demoReadme, "record-only smoke\n", "utf8");
  await request("POST", "/api/projects", { path: demoProject });
  await request("DELETE", "/api/project-folders", { path: demoProject });
  assert(fs.existsSync(demoProject), "record-only removal deleted the project directory");
  assert(fs.existsSync(demoReadme), "record-only removal deleted README.md");
  console.log("CLAUDE_PROJECT_REMOVE_RECORD_ONLY: PASS");
  console.log("CLAUDE_PROJECT_DISK_FILES_PRESERVED: PASS");

  const missingProject = path.join(baseRoot, "missing-project");
  writeJson(path.join(dataDir, "projects.json"), { projects: [missingProject] });
  await request("DELETE", "/api/project-folders", { path: missingProject });
  const afterMissing = JSON.parse(fs.readFileSync(path.join(dataDir, "projects.json"), "utf8"));
  assert(!afterMissing.projects.includes(missingProject), "stale project record was not removed");
  console.log("CLAUDE_PROJECT_REMOVE_STALE_RECORD: PASS");

  const protectedProject = path.join(baseRoot, "protected-project");
  const protectedReadme = path.join(protectedProject, "README.md");
  fs.mkdirSync(protectedProject, { recursive: true });
  fs.writeFileSync(protectedReadme, "danger confirmation smoke\n", "utf8");
  await request("POST", "/api/projects", { path: protectedProject });
  const denied = await request(
    "DELETE",
    "/api/project-folders",
    { path: protectedProject, deleteLocalFiles: true, confirmation: "" },
    false
  );
  assert(!denied.response.ok, "dangerous delete without confirmation was not rejected");
  assert(fs.existsSync(protectedReadme), "dangerous delete without confirmation touched disk");
  console.log("CLAUDE_PROJECT_DANGEROUS_DELETE_REQUIRES_CONFIRM: PASS");

  const dangerousPaths = [
    path.parse(repoRoot).root,
    path.dirname(os.homedir()),
    path.join(os.homedir(), "Desktop"),
    repoRoot,
  ];
  for (const dangerousPath of dangerousPaths) {
    const result = await request(
      "DELETE",
      "/api/project-folders",
      { path: dangerousPath, deleteLocalFiles: true, confirmation: "确认删除本地文件" },
      false
    );
    assert(!result.response.ok, `dangerous path was not blocked: ${dangerousPath}`);
  }
  console.log("CLAUDE_PROJECT_DANGEROUS_PATH_BLOCKED: PASS");

  const moveProject = path.join(baseRoot, "move-project");
  const moveReadme = path.join(moveProject, "README.md");
  fs.mkdirSync(moveProject, { recursive: true });
  fs.writeFileSync(moveReadme, "quarantine smoke\n", "utf8");
  await request("POST", "/api/projects", { path: moveProject });
  const moved = await request(
    "DELETE",
    "/api/project-folders",
    { path: moveProject, deleteLocalFiles: true, confirmation: "确认删除本地文件" }
  );
  assert(!fs.existsSync(moveProject), "confirmed dangerous delete did not move original project");
  assert(moved.data.project?.quarantinePath, "quarantine path missing from response");
  assert(fs.existsSync(moved.data.project.quarantinePath), "quarantine directory missing");
  assert(fs.existsSync(path.join(moved.data.project.quarantinePath, "README.md")), "quarantined README missing");
  console.log("CLAUDE_PROJECT_DELETE_MOVES_TO_QUARANTINE: PASS");
} finally {
  child.kill();
}
