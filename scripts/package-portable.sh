#!/bin/bash
# SuperClaw 随身版打包工具
# 用法: bash scripts/package-portable.sh
# 或直接运行: chmod +x scripts/package-portable.sh && ./scripts/package-portable.sh

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/SuperClaw_随身版"

echo "========================================"
echo "  SuperClaw 随身版 打包工具"
echo "========================================"
echo ""

# 1. 编译
echo "[1/4] 编译前端和 Rust 后端..."
cd "$ROOT"
npm run tauri build
echo "[完成] 编译成功"
echo ""

# 2. 清理旧目录
echo "[2/4] 清理旧目录..."
rm -rf "$OUT"
mkdir -p "$OUT"
echo "[完成]"
echo ""

# 3. 复制组件
echo "[3/4] 复制组件到随身版..."

mkdir -p "$OUT/resources/bin"
cp -r "$ROOT/bin/"* "$OUT/resources/bin/"
echo "  ✓ bin/"

cp -r "$ROOT/uv-tools" "$OUT/resources/uv-tools"
echo "  ✓ uv-tools/"

cp -r "$ROOT/uv-python" "$OUT/resources/uv-python"
echo "  ✓ uv-python/"

mkdir -p "$OUT/resources/data"
cp -r "$ROOT/data/"* "$OUT/resources/data/"
echo "  ✓ data/"

mkdir -p "$OUT/resources/runtime/openclaw"
cp -r "$ROOT/src-tauri/resources/runtime/openclaw/"* "$OUT/resources/runtime/openclaw/"
echo "  ✓ resources/runtime/openclaw/"

mkdir -p "$OUT/resources/data/.openclaw"
cp "$ROOT/src-tauri/resources/data/.openclaw/clawpanel.json" "$OUT/resources/data/.openclaw/clawpanel.json"
echo "  ✓ .openclaw/"

# 清理可能的嵌套目录
if [ -d "$OUT/resources/data/.openclaw/.openclaw" ]; then
    rm -rf "$OUT/resources/data/.openclaw/.openclaw"
fi

echo "[完成]"
echo ""

# 4. 复制主程序
echo "[4/4] 复制主程序..."
cp "$ROOT/src-tauri/target/release/superclaw.exe" "$OUT/superclaw.exe"
echo "  ✓ superclaw.exe"
echo "[完成]"
echo ""

# 统计
TOTAL_SIZE=$(du -sh "$OUT" | cut -f1)

echo "========================================"
echo "  打包完成！"
echo "========================================"
echo ""
echo "输出目录: $OUT"
echo "总大小:   $TOTAL_SIZE"
echo ""
echo "随身版已就绪，可直接拷到 U 盘使用。"
