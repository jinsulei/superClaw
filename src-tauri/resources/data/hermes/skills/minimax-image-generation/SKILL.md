---
name: minimax-image-generation
description: 在当前环境通过 MiniMax 图像生成 API 直接生成图片。触发条件：用户要求生图、风格延续、i2i 替代方案、批量出图。
category: devops
---

# MiniMax 图像生成（当前环境）

## 适用场景
- 用户直接要生图（任何 prompt）
- 想"参照已有图片"生新图但无 i2i 工具 → 用 vision 解析图 → 写 prompt → 文生图
- 批量出多张图（循环调用）

## 前置检查
1. 环境变量 `MINIMAX_API_KEY` 是否设置（**不要让用户在聊天框贴 key，让他自己配 env**）
2. 网络是否通 `api.minimaxi.com`（国内环境可能不通，先 curl 测一下）
3. 输出目录是否存在：SuperClaw 当前运行资源目录下的 `resources/data/generated/`（不存在先 mkdir；不要写死开发机路径）

## 调用模板
```python
import os, base64, requests, pathlib

url = "https://api.minimaxi.com/v1/image_generation"
api_key = os.environ["MINIMAX_API_KEY"]
headers = {"Authorization": f"Bearer {api_key}"}

payload = {
    "model": "image-01",
    "prompt": "<用户的中文需求 → 转写成英文详细 prompt>",
    "aspect_ratio": "16:9",  # 或 1:1, 9:16, 4:3
    "response_format": "base64",
}

resp = requests.post(url, headers=headers, json=payload, timeout=60)
resp.raise_for_status()
images = resp.json()["data"]["image_base64"]

def resolve_superclaw_data_dir():
    for value in (os.environ.get("SUPERCLAW_DATA_DIR"), os.environ.get("SUPERCLAW_RESOURCES_DIR")):
        if not value:
            continue
        root = pathlib.Path(value)
        return root / "data" if root.name == "resources" else root

    cwd = pathlib.Path.cwd()
    for base in (cwd, *cwd.parents):
        packaged_data = base / "resources" / "data"
        source_data = base / "src-tauri" / "resources" / "data"
        if packaged_data.exists():
            return packaged_data
        if source_data.exists():
            return source_data

    return cwd / "resources" / "data"

out_dir = resolve_superclaw_data_dir() / "generated"
out_dir.mkdir(parents=True, exist_ok=True)
for i, b64 in enumerate(images):
    p = out_dir / f"output-{i}.jpeg"
    p.write_bytes(base64.b64decode(b64))
    print(p)
```

## Prompt 写法（关键）
- **用户中文需求 → 扩写成英文 detailed prompt**（150-300 词最佳）
- 必含：主体 + 风格（flat illustration / photorealistic / vector 等）+ 配色（具体颜色名）+ 构图 + 光线 + 文字内容（如有）
- 想要"风格延续"某张参考图：用 `vision_analyze` 拿到描述，再把描述融进 prompt

## 结果呈现
- 用 `MEDIA:<完整路径>` 在聊天中显示图片
- 同时报：文件路径、大小、用了什么 prompt

## 陷阱
1. **API key 安全**：永远不要让用户把 key 贴到聊天里。直接说"请你自己配环境变量 `MINIMAX_API_KEY`"，配好后告诉我"配好了"。
2. **如果用户已经贴了 key**：立刻提醒撤销 + 重置。这是 secret，不是普通文本。
3. **网络问题**：先 `curl -I https://api.minimaxi.com` 测连通性，不通就别浪费调用。
4. **计费**：生图是付费的，不要无意义反复调。用户没明确同意计费前，先确认。
5. **默认保存路径**在 Tauri 项目的 data/generated/ 下——这是 SuperClaw 桌面应用的运行时数据目录。

## 验证步骤
1. 调用成功后 `ls -la <输出路径>` 确认文件存在
2. 用 `vision_analyze` 加载生成的图，描述给用户确认是否满足需求
3. 不满意 → 改 prompt 重生（最多 2-3 次，别无限循环）

## 相关参考
- 电商场景的"参考图 → 详情页批量配图"工作流见 `references/ecommerce-product-page.md`
