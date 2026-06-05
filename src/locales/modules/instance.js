import { _ } from '../helper.js'

export default {
  local: _('本机', 'Local'),
  remote: _('远程', 'Remote'),
  docker: _('Docker', 'Docker'),
  switchHint: _('切换后，模型配置、Agent 等页面将管理对应实例', 'After switching, Models, Agents and other pages will manage the selected instance'),
  addInstance: _('添加实例', 'Add Instance'),
  addRemote: _('添加远程实例', 'Add Remote Instance'),
  namePlaceholder: _('远程服务器', 'Remote Server'),
  endpointPlaceholder: _('http://192.168.1.100:1420', 'http://192.168.1.100:1420'),
  nameLabel: _('名称', 'Name'),
  endpointLabel: _('面板地址', 'Panel Address'),
  gwPortLabel: _('Gateway 端口（可选）', 'Gateway Port (optional)'),
  nameRequired: _('请填写名称和面板地址', 'Please fill in name and endpoint'),
  endpointExists: _('该端点已存在', 'This endpoint already exists'),
  adding: _('添加中...', 'Adding...'),
  switchedTo: _('已切换到 {name} — 模型配置、Agent 等将管理该实例', 'Switched to {name} — Models, Agents, etc. will manage this instance'),
  current: _('当前', 'Active'),
  remoteHint: _('远程服务器需要运行 SuperClaw (serve.js)。', 'The remote server must be running SuperClaw (serve.js).'),
  example: _('示例', 'Example'),
}
