import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const skillsPage = read('src/pages/skills.js')
const devApi = read('scripts/dev-api.js')

function has(source, text, label = text) {
  assert.ok(source.includes(text), `Missing ${label}`)
}

function lacks(source, text, label = text) {
  assert.ok(!source.includes(text), `Forbidden ${label}`)
}

// Frontend: only installed OpenClaw skills can show a delete action.
has(skillsPage, 'function canDeleteOpenClawSkill(skill, status)', 'OpenClaw delete eligibility helper')
has(skillsPage, 'if (!skill || !isOpenClawSkill(skill)) return false', 'OpenClaw-only delete guard')
has(skillsPage, 'if (isClaudeUserSkill(skill)) return false', 'Claude user skill exclusion')
has(skillsPage, 'isOpenClawBuiltinSkill(skill) && !isOpenClawExtensionSkill(skill)', 'bundled OpenClaw skill exclusion')
has(skillsPage, "['eligible', 'missing', 'disabled', 'blocked'].includes(status)", 'installed status allowlist')
has(skillsPage, 'data-action="skill-uninstall"', 'delete button action')
has(skillsPage, "data-source=\"${esc(skill.source || '')}\"", 'delete button source marker')
has(skillsPage, '删除中...', 'deleting button label')
has(skillsPage, '确认删除 OpenClaw Skill', 'delete confirmation')
has(skillsPage, 'await api.skillsUninstall(name, _selectedAgentId)', 'delete command call')
has(skillsPage, 'await loadSkills(page)', 'reload skills after delete')
has(skillsPage, '.filter(isOpenClawExtensionSkill).map(s => s.name)', 'installed store status uses OpenClaw extensions only')
lacks(skillsPage, "!['openclaw-bundled', 'openclaw-extra']", 'old exclusion that hid OpenClaw extension delete')

// Web dev API: explicit endpoint exists and is localhost-only.
has(devApi, "cmd === 'openclaw/skills/delete'", 'OpenClaw skills delete endpoint')
has(devApi, 'isLocalRequest(req)', 'localhost-only guard')
has(devApi, "req.method !== 'POST'", 'POST-only guard')
has(devApi, "args.skillId || args.name", 'skillId/name input support')
has(devApi, "source.includes('claude') || source.includes('hermes')", 'non-OpenClaw source guard')
has(devApi, 'Only OpenClaw skills can be deleted', 'OpenClaw-only API error')
has(devApi, 'handlers.skills_uninstall', 'endpoint delegates to uninstall command')

// Safety: path traversal and dangerous directories are rejected before rmSync.
has(devApi, 'function validateOpenClawSkillDeleteName(name)', 'skill name validator')
has(devApi, "n.includes('..')", 'path traversal name guard')
has(devApi, "n.includes('/')", 'forward slash name guard')
has(devApi, "n.includes('\\\\')", 'backslash name guard')
has(devApi, "['.', '.git', 'node_modules']", 'dangerous name guard')
has(devApi, 'function assertSafeOpenClawSkillPath(skillDir, allowedRoots)', 'safe delete path helper')
has(devApi, "[\\\\/]\\.git(?:[\\\\/]|$)", '.git path guard')
has(devApi, "[\\\\/]node_modules(?:[\\\\/]|$)", 'node_modules path guard')
has(devApi, 'path.relative(lowerRoot, lowerTarget)', 'root containment check')
has(devApi, '拒绝删除 OpenClaw Skills 根目录之外的路径', 'outside-root delete rejection')
has(devApi, 'assertSafeOpenClawSkillPath(skillDir, [baseDir])', 'uninstall path guard before rm')
has(devApi, 'fs.rmSync(skillDir, { recursive: true, force: true })', 'delete limited to guarded skillDir')

// Scope: no Hermes / ClaudeCode delete implementation is introduced.
lacks(devApi, 'hermes/skills/delete', 'Hermes delete endpoint')
lacks(devApi, 'claude/skills/delete', 'Claude delete endpoint')

console.log('OPENCLAW_SKILLS_DELETE_SMOKE_PASS')
