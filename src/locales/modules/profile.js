import { _ } from '../helper.js'

export default {
  desc: _('查看账号信息、额度状态和登录操作。', 'View account information, quota status, and sign-in actions.'),
  active: _('已登录', 'Signed in'),
  accountInfo: _('账号信息', 'Account information'),
  userId: _('用户 ID', 'User ID'),
  registerTime: _('注册时间', 'Registration time'),
  status: _('账号状态', 'Account status'),
  statusActive: _('正常', 'Active'),
  statusEnabled: _('已启用', 'Enabled'),
  statusDisabled: _('已禁用', 'Disabled'),
  statusPending: _('待处理', 'Pending'),
  statusUnknown: _('未知', 'Unknown'),
  tokenInfo: _('额度信息', 'Quota information'),
  usedQuota: _('已用额度', 'Used quota'),
  logout: _('退出登录', 'Sign out'),
  resetActivation: _('重新激活', 'Reset activation'),
  resetActivationDone: _('已清除本地激活状态，请重新激活。', 'Local activation state cleared. Please activate again.'),
  apiKey: _('接口密钥', 'API Key'),
  yyapiAutoKeyHint: _('系统已自动分配 YYApi 接口密钥，用于模型调用鉴权，请妥善保管。', 'A YYApi API key has been auto-assigned for model authentication. Please keep it secure.'),
}
