# 香港大学张江校区 · 七天

一个七天校园养成小游戏：白天上课、交友、跑圈，晚上要么留着灯深造、要么出门夜战，
第七天期末考结算 GPA，再生成一份由你这七天行为写出来的人格报告。

## 直接玩

**在线玩**：<https://a766426356.github.io/hackathon/>

（走 GitHub Pages。没开的话：仓库 Settings → Pages → Source 选 `Deploy from a branch`，
Branch 选 `main`、目录选 `/ (root)`，保存后等一分钟。）

**离线玩**：把根目录的 `index.html` 下载下来双击。单个自包含文件（2.83 MB），
代码、地图、房间底图、钢琴采样全部内联，不需要服务器、不需要联网，发给别人也能直接打开。

> ⚠️ **直接在仓库里点 `index.html` 是玩不了的**，别被它误导：
> 文件超过 1 MB，GitHub 连内容都不显示，只给一个 Raw 链接；而 Raw 地址返回的是
> `text/plain`，浏览器只会把 2.8 MB 当纯文本铺出来。GitHub 只托管源码、不执行它，
> 所以想在浏览器里点开就玩，只有 Pages 或别的静态托管这一条路。

> 这一份是**中文版**，从提交 `11bf01b` 打包而来（翻译成英文之前的那一版）：
> 旧版 1024 地图、纯中文界面、没有语言切换、没有第六天演示存档。

## 源码

`game/` 才是工程本体：原生 ES Modules + Canvas，零依赖、零构建。数值全在 `game/data.js`，
平衡改动只动那个文件；测试用 `node game/tests/sim.mjs`（800 局模拟）和 `maps.mjs`（地图连通性）。

源码比上面那份 demo 更新：全站英文化、中英双语切换（右上角按钮，中文用的是原始文案）、
新的 1536 像素校区图、`?demo=day6` 演示存档。说明见 `game/README.md`。

## 重新打包

```bash
python tools/build-single-file.py        # -> dist/hku-seven-days.html（当前源码，英文）
```

## 目录

| 路径 | 内容 |
|---|---|
| `index.html` | 可直接玩的中文版单文件 demo（打包产物） |
| `game/` | 游戏源码、资源、测试 |
| `tools/` | 单文件打包脚本 |
| `docs/` | 设计文档：建筑、日历、多层交互 |
| `archive/` | 早期实验：像素图工具、tilemap、素材 |
