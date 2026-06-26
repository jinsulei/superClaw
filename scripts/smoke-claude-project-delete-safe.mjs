import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appPath = path.join(root, "src-tauri/resources/runtime/claude-panel/public/app.js");
const serverPath = path.join(root, "src-tauri/resources/runtime/claude-panel/server.js");
const stylePath = path.join(root, "src-tauri/resources/runtime/claude-panel/public/styles.css");

const app = fs.readFileSync(appPath, "utf8");
const server = fs.readFileSync(serverPath, "utf8");
const style = fs.readFileSync(stylePath, "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function extractFunction(source, name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert(start >= 0, `missing function ${name}`);
  const braceStart = source.indexOf("{", start);
  assert(braceStart >= 0, `missing body for ${name}`);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

const removeListBody = extractFunction(app, "removeProjectConversationFromList");
const deleteLocalBody = extractFunction(app, "deleteLocalProjectFiles");
const quarantineBody = extractFunction(server, "quarantineManagedProjectFolder");
const protectedBody = extractFunction(server, "protectedLocalDeletePaths");

assert(app.includes('delete: "从列表移除"'), "conversation menu must label normal delete as list removal");
assert(app.includes('"delete-local-files": "删除本地文件"'), "danger action label missing");
assert(app.includes('className = "conversation-danger-zone"'), "danger zone must be rendered as a separate folded area");
assert(app.includes('summary.textContent = "危险操作"'), "danger zone summary missing");
assert(app.includes('pathText.textContent = conversation.projectPath'), "danger zone must show full project path");

assert(!removeListBody.includes("fetch("), "list removal must not call the project delete API");
assert(!removeListBody.includes("window.confirm"), "list removal should not require destructive confirmation");
assert(removeListBody.includes("removeConversationRecord(conversation.id)"), "list removal must remove only the local record");
assert(removeListBody.includes("磁盘文件没有被删除"), "list removal must tell the user disk files were preserved");

assert(deleteLocalBody.includes("window.prompt"), "local file delete must require typed confirmation");
assert(app.includes('const LOCAL_FILE_DELETE_CONFIRM_TEXT = "确认删除本地文件"'), "frontend must define the exact confirmation phrase");
assert(deleteLocalBody.includes("LOCAL_FILE_DELETE_CONFIRM_TEXT"), "local file delete must require the exact confirmation phrase");
assert(deleteLocalBody.includes('method: "DELETE"'), "local file delete must use the backend delete endpoint");
assert(deleteLocalBody.includes("confirmText"), "local file delete must send confirmText");
assert(deleteLocalBody.includes("完整路径"), "local file delete prompt must show the full path");
assert(deleteLocalBody.includes("已移动到隔离区，原路径已移除。"), "success message must mention quarantine move");

assert(server.includes('const LOCAL_FILE_DELETE_CONFIRM_TEXT = "确认删除本地文件"'), "server must define the exact confirmation phrase");
assert(server.includes('path.join("C:\\\\tmp", `claude-project-delete-quarantine-${quarantineTimestamp()}`)'), "server must use the required C:\\tmp quarantine root");
assert(quarantineBody.includes("fs.renameSync(target, destination)"), "server must move to quarantine with renameSync");
assert(!server.includes("fs.rmSync("), "server must not permanently remove project files");
assert(quarantineBody.includes("isProtectedLocalDeletePath(target)"), "server must reject protected paths before moving");
assert(quarantineBody.includes("typed !== LOCAL_FILE_DELETE_CONFIRM_TEXT"), "server must enforce the exact confirmation phrase");
assert(quarantineBody.includes("quarantinePath: destination"), "server response must include the quarantine path");

for (const term of ["Users", "Desktop", "Documents", "Downloads", "Windows", "ProgramFiles", "System32", "process.cwd()"]) {
  assert(protectedBody.includes(term), `protected path guard missing ${term}`);
}

assert(style.includes(".conversation-danger-zone"), "danger zone styles missing");
assert(style.includes(".conversation-danger-path"), "full path display styles missing");

console.log("smoke-claude-project-delete-safe: PASS");
