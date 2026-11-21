#!/usr/bin/env bash
# 本目录起一个静态服务，然后打开 http://localhost:8099/viewer.html
cd "$(dirname "$0")" || exit 1
PORT="${1:-8099}"
echo "tilemap viewer: http://localhost:${PORT}/viewer.html"
python3 -m http.server "$PORT"
