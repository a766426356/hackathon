#!/usr/bin/env bash
# 本地起一个静态服务器（ES module 不能用 file:// 打开）
# 注意：不能用 `python3 -m http.server`——它不发缓存头，改完 js/css 浏览器可能还在跑旧版本，
# 表现是「代码明明改了，页面却像没变」或者打开一半旧一半新。这里给所有响应加上 no-store。
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-8000}"
echo "→ http://localhost:${PORT}"
python3 - "$PORT" <<'PY'
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

port = int(sys.argv[1])


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):  # 安静点，别每行都刷
        pass


ThreadingHTTPServer(('127.0.0.1', port), partial(NoCacheHandler, directory='.')).serve_forever()
PY
