---
name: hermes-capability-audit
description: 当用户问"你有什么能力 / 能不能做 X / 缺口在哪"时，跑 Hermes 自身能力盘点。覆盖工具集启用状态、image/video generation providers 实际能力、依赖环境、skills/auth/integrations 全维度输出。触发：用户说"查看自己有什么"、"检查后汇报"、"介绍下自己"、"你能不能..."、"X 功能有没有"。区别于 superclaw-codebase（项目代码导航），本 skill 是关于 Hermes 运行时本身。
---

# Hermes 能力盘点工作流

用户高频问 "你有什么 / 能不能做 X / 缺口在哪"。**一次跑完完整盘点再汇报**，不要逐步问。覆盖维度见下。

## 盘点维度（必跑，缺一不可）

1. **工具集** — `hermes tools list` 拿 enabled/disabled，`hermes doctor` 拿 system dependency
2. **Provider / 模型** — `hermes model`、`hermes dump`、`.hermes/config.yaml` 的 `image_gen` / `video_gen` / `model` 段
3. **Auth** — `hermes auth status` / `hermes doctor` 的 Auth Providers 段
4. **环境** — `hermes doctor` 一份顶全部（Python、Node、git、docker、API 连通性、Skills Hub）
5. **Skills** — `hermes skills list` / `hermes skills browse`（注意 rate limit 会 429）
6. **Plugins** — `hermes plugins list`（plugin 是 git clone 外部仓库，比 skill 风险高）
7. **Hermes 本体版本** — `hermes update` 的可用 commit 数；只列不动
8. **集成 & 可执行操作** — cron jobs、gateway、webhook、kanban
9. **能力矩阵（yes/no）** — 用户问的"X 功能"在不在、是不是 stub、底层模型支持但 Hermes 没暴露的情况

## 关键发现路径

Hermes-agent 真实源码在 venv site-packages：

```
<SUPERCLAW_RESOURCES_DIR>/runtime/hermes-agent/Lib/site-packages/
├── tools/                    # 主工具实现
│   ├── image_generation_tool.py  # 1098 行 — 看 FAL_MODELS 字典、IMAGE_GENERATE_SCHEMA
│   ├── video_generation_tool.py  # 561 行 — 看 VIDEO_GENERATE_SCHEMA
│   └── ...
├── plugins/                  # 用户可插拔后端
│   ├── image_gen/{openai,openai-codex,xai}/
│   └── video_gen/{fal,xai}/
├── agent/                    # 抽象基类与 registry
│   ├── image_gen_provider.py    # ImageGenProvider ABC
│   ├── video_gen_provider.py    # VideoGenProvider ABC
│   └── *_registry.py
└── hermes_cli/               # CLI & config
```

`/c/Users/csys1/.local/bin/hermes` 是 Windows PE 二进制，`cat` 出来是乱码；用 `hermes --help` 拿子命令列表。

## 已知能力边界（会随版本变化，需重新核对）

详见 `references/capability-matrix.md`（最近一次盘点：2026-06-26）：

- **image_generate (文生图)** ✅：10 个 FAL 模型 + OpenAI gpt-image-2 + xAI Grok
- **image-to-image (img2img / 编辑 / 局部重绘)** ❌：schema 只有 `prompt` + `aspect_ratio`，无 `image_url`/`image_urls`/`input_image`
- **video_generate (文生视频)** ✅：6 个 FAL 模型家族
- **image-to-video** ✅：video_generate 的 `image_url` 参数自动路由到 i2v 端点
- **vision (看图)** ✅：vision 工具集

## 跑盘点的推荐顺序

```bash
hermes doctor                 # 一份全包
hermes dump                   # 配置/版本/keys 摘要
hermes tools list             # 工具集 enabled/disabled
hermes skills list            # 已装 skill
hermes plugins list           # 已装 plugin
hermes status                 # 组件运行状态（gateway、cron、platforms）
```

需要具体 provider 能力时再去读对应 `tools/*.py` 和 `plugins/*/`。**不要盲目 `grep -r` 全代码库**，先看 registry 知道有哪些 provider，再针对性读。

## 输出格式

- **能力矩阵**用表格，行=能力、列=状态（✅/❌/⚠）+ 备注
- **问题清单**用表格，行=问题、列=状态/影响/修复方式/风险等级
- **每节末尾留 A/B/C/D 选项**等用户挑，不主动执行
- **结尾必须有 "等你拍板" / "等指令"**，让用户一句话就能继续

## 不要做的事

- ❌ 擅自跑 `hermes update`、装 skill/plugin、修系统 Python、改 auth
- ❌ 把外部任务（"`uv pip install` 升级"、"装新 skill"）派给子代理（应主进程执行）
- ❌ 假设子代理的报告为真，重要操作亲自验（读文件 / 跑命令 / fetch URL）

## 相关 skill

- `superclaw-codebase` — 查 SuperClaw 项目代码（Tauri 端）功能状态时用
