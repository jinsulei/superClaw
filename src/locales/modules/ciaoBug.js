import { _ } from '../helper.js'

/**
 * @homebridge/ciao Windows cmd 弹窗 bug 的用户提示文案
 * 上游 issue: https://github.com/homebridge/ciao/issues/64
 * 上游 PR:    https://github.com/homebridge/ciao/pull/65
 */
export default {
  toastTitle: _(
    '检测到已知问题：OpenClaw 运行时 Windows 上每 15 秒会弹一次 cmd 窗口',
    'Known issue detected: OpenClaw causes a cmd popup every 15s on Windows',
  ),
  viewDetail: _(
    '查看详情',
    'View details',
  ),
  modalTitle: _(
    'Windows cmd 弹窗问题 — 第三方库 bug',
    'Windows cmd popup — third-party library bug',
  ),
  summary: _(
    '这是 OpenClaw 依赖的 @homebridge/ciao 库的已知 bug，不是 SuperClaw 或 OpenClaw 本身的问题。每 15-30 秒 ciao 会调用 arp -a 刷新网络接口缓存，但未使用 windowsHide 参数，所以 Windows 上会弹出一个短暂的 cmd 窗口。功能本身完全正常，只是视觉干扰。',
    'This is a known bug in @homebridge/ciao, which OpenClaw depends on. It is not a bug of SuperClaw or OpenClaw itself. Every 15–30 seconds ciao calls "arp -a" to refresh the network interface cache, but without the windowsHide option, so a cmd window flashes briefly on Windows. Functionality is unaffected — it is purely a visual annoyance.',
  ),
  envTitle: _(
    '当前环境',
    'Environment',
  ),
  pathLabel: _(
    '源文件路径',
    'Source file',
  ),
  fixTitle: _(
    '解决方案',
    'How to fix',
  ),
  // HTML 允许：可包含超链接。escapeHtml 在这些条目上不启用。
  fixUpstream: _(
    '<b>等待上游合并</b> —— 上游已有 <a href="https://github.com/homebridge/ciao/pull/65" target="_blank" rel="noopener">PR #65</a> 提供修复，未合并。OpenClaw 升级 ciao 后自动消失。',
    '<b>Wait for upstream merge</b> — <a href="https://github.com/homebridge/ciao/pull/65" target="_blank" rel="noopener">PR #65</a> already provides the fix but has not been merged. Will disappear once OpenClaw upgrades its ciao dependency.',
  ),
  fixPatchPackage: _(
    '<b>使用 patch-package 给 OpenClaw 打补丁</b>：在 OpenClaw 源码仓库（或 npm 全局安装目录下的 openclaw 包目录）执行 <code>npx patch-package @homebridge/ciao</code>，在 NetworkManager.js 的 exec 调用中加 <code>{ windowsHide: true }</code>。',
    '<b>Apply a patch-package patch to OpenClaw</b>: in the OpenClaw source repo (or the globally installed openclaw directory), run <code>npx patch-package @homebridge/ciao</code> after adding <code>{ windowsHide: true }</code> to the exec calls in NetworkManager.js.',
  ),
  fixManual: _(
    '<b>手动编辑 NetworkManager.js</b>（最简单，但升级 openclaw 后需重做）：用编辑器打开上面显示的文件路径，找到 6 处 <code>child_process.exec("arp ...")</code> 调用，在 URL 参数和回调之间加 <code>{ windowsHide: true },</code>，保存后重启 Gateway。',
    '<b>Manually edit NetworkManager.js</b> (simplest, but you must redo it after upgrading openclaw): open the file at the path above, find the 6 <code>child_process.exec("arp ...")</code> calls, add <code>{ windowsHide: true },</code> between the first argument and the callback, save and restart Gateway.',
  ),
  linkIssue: _(
    '上游 Issue #64',
    'Upstream issue #64',
  ),
  linkPr: _(
    '上游修复 PR #65',
    'Upstream fix PR #65',
  ),
  disclaimer: _(
    '说明：SuperClaw 选择「检测并告知」而不是「自动修改你的 node_modules」—— 我们尊重你对本机软件的控制权。',
    'Note: SuperClaw chose "detect & inform" instead of "silently patch your node_modules" — we respect your control over local software.',
  ),
  dismissForVersion: _(
    '已了解，不再提醒本版本',
    'Got it, don\'t remind for this version',
  ),
  dismissed: _(
    '已忽略此版本的提醒',
    'Reminder dismissed for this version',
  ),
}
