/**
 * CLI 冲突横幅 (cli-conflict-banner) 文案
 * 用于 OpenClaw 仪表盘提示用户存在非 SuperClaw 管理的 CLI 冲突项
 */
import { _ } from '../helper.js'

export default {
  title: _('检测到 {count} 处可能冲突的 OpenClaw 安装', 'Detected {count} possibly conflicting OpenClaw installation(s)'),
  desc: _('系统 PATH 中存在非 SuperClaw 管理的 OpenClaw（如 Cherry Studio 内嵌、旧 npm 全局），可能导致终端命令拿到老版本，引发 schema 不兼容、doctor --fix 卡死等问题。', 'Your PATH has OpenClaw installations not managed by SuperClaw (e.g. Cherry Studio bundled, legacy npm global). They can cause terminal commands to pick up old versions, triggering schema mismatches and doctor --fix hangs.'),
  viewDetails: _('查看详情', 'View details'),
  hideDetails: _('收起详情', 'Hide details'),
  quarantineAll: _('一键隔离', 'Quarantine all'),
  quarantining: _('正在隔离…', 'Quarantining…'),
  quarantineOne: _('隔离', 'Quarantine'),
  dismiss: _('暂时忽略', 'Dismiss'),
  dismissedHint: _('已忽略本次检测。下次启动会重新扫描。', 'Dismissed for this session. Next launch will scan again.'),
  quarantineOk: _('已隔离 {count} 个冲突项', 'Quarantined {count} item(s)'),
  quarantinePartial: _('另有 {count} 个未隔离', '{count} item(s) failed'),
  quarantineFail: _('隔离失败：{error}', 'Quarantine failed: {error}'),
  quarantineOneOk: _('已隔离', 'Quarantined'),
  footnote: _('隔离 = 重命名为 .disabled-by-superclaw-<时间>.bak（不会删除）。如需恢复，到原目录把 .bak 文件改回原名即可。', 'Quarantine = rename to .disabled-by-superclaw-<timestamp>.bak (not deleted). To restore, rename the .bak back to its original name in the same directory.'),
}
