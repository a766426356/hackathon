#!/usr/bin/env bash
# 本地起一个静态服务器（ES module 不能用 file:// 打开）
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-8000}"
echo "→ http://localhost:${PORT}"
python3 -m http.server "${PORT}"
