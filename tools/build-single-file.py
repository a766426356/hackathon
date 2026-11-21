"""把整个游戏打包成一个自包含的 HTML 文件。

思路：
  1. esbuild 把 src/main.js 打成一个 IIFE（游戏零依赖，一条命令就够）；
  2. 代码里所有 'assets/...' 字面量替换成 data URL —— 这样 CAMPUS.src、房间底图、
     楼层预览图全都不再依赖相对路径；
  3. styles.css 内联，url() 里的图同样换成 data URL；
  4. 钢琴采样挂到 window.__PIANO_SAMPLES__ 上（audio.js 里 sampleUrl() 会优先用它，
     取不到就退回相对路径，所以普通服务方式也照常работа）；
  5. 输出一个 index.html，双击就能玩。

图片先用 tools/prepare-inline-assets 压过一轮（1536->1152、照片->1000px q74），
否则单文件会到 6MB。

用法：
    python tools/build-single-file.py [--out dist/hku-seven-days.html]
"""
import base64
import io
import json
import mimetypes
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
GAME = ROOT / "game"
INLINE = ROOT / ".bitfun" / "tmp" / "inline"  # 压缩后的图（见 prepare 脚本）
TMP = ROOT / ".bitfun" / "tmp"

MIME = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".mp3": "audio/mpeg",
    ".svg": "image/svg+xml",
}


def data_url(path):
    raw = path.read_bytes()
    mime = MIME.get(path.suffix.lower()) or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return "data:" + mime + ";base64," + base64.b64encode(raw).decode("ascii")


def prefer_inline(path_str):
    """优先用压缩后的副本，没有就用原图。"""
    packed = INLINE / path_str
    if packed.exists():
        return packed
    return GAME / path_str


def bundle():
    out = TMP / "bundle.js"
    cmd = [
        "npx", "--yes", "esbuild", str(GAME / "src" / "main.js"),
        "--bundle", "--format=iife", "--target=es2020",
        "--charset=utf8", "--legal-comments=none",
        "--outfile=" + str(out),
    ]
    r = subprocess.run(cmd, capture_output=True, shell=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr.decode("utf-8", "replace"))
        raise SystemExit("esbuild failed")
    return out.read_text(encoding="utf-8")


def collect_asset_paths(text):
    return sorted(set(re.findall(r"assets/[A-Za-z0-9_./-]+\.(?:jpg|jpeg|png|mp3|svg)", text)))


def main():
    out_rel = "dist/hku-seven-days.html"
    args = sys.argv[1:]
    if "--out" in args:
        out_rel = args[args.index("--out") + 1]

    js = bundle()
    css = (GAME / "styles.css").read_text(encoding="utf-8")
    html = (GAME / "index.html").read_text(encoding="utf-8")

    used = set(collect_asset_paths(js)) | set(collect_asset_paths(css))
    # 注释掉的 gym 底图不算
    used = {u for u in used if "gym.jpg" not in u}

    urls = {}
    total = 0
    for rel in sorted(used):
        p = prefer_inline(rel)
        if not p.exists():
            print("  ! missing, keeping path:", rel)
            continue
        urls[rel] = data_url(p)
        total += len(urls[rel])
        print(f"  {rel:44s} {len(urls[rel]) // 1024:5d} KB inline")

    # 代码里的字面量替换（单双引号都覆盖）
    for rel, url in urls.items():
        js = js.replace("'" + rel + "'", "'" + url + "'")
        js = js.replace('"' + rel + '"', '"' + url + '"')
        css = css.replace('url("' + rel + '")', 'url("' + url + '")')
        css = css.replace("url('" + rel + "')", "url('" + url + "')")
        css = css.replace('url(' + rel + ')', 'url(' + url + ')')

    # 钢琴采样单独做成一张表
    samples = {}
    for mp3 in sorted((GAME / "assets" / "audio" / "piano").glob("*.mp3")):
        samples[mp3.stem] = data_url(mp3)
        total += len(samples[mp3.stem])
    print(f"  piano samples: {len(samples)} files, {sum(len(v) for v in samples.values()) // 1024} KB inline")

    # 把 index.html 的样式表和模块脚本换掉
    html = re.sub(r'\s*<link rel="stylesheet" href="styles.css" />', "", html)
    html = re.sub(r'\s*<script type="module" src="src/main.js"></script>', "", html)
    payload = (
        "<style>\n" + css + "\n</style>\n"
        + "<script>window.__PIANO_SAMPLES__ = " + json.dumps(samples) + ";</script>\n"
        + "<script>\n" + js + "\n</script>\n"
    )
    html = html.replace("</body>", payload + "</body>")

    out = ROOT / out_rel
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8", newline="\n")
    print(f"\nwrote {out_rel}  ({out.stat().st_size / 1024 / 1024:.2f} MB)")


main()
