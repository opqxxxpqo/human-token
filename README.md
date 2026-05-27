# human-token

把一天的键鼠活跃度，转化成「能量消耗曲线」——模仿 Claude Code 的终端美学，让打工人第一次看见自己在燃烧什么。

- **悬浮球长期驻留** 桌面右下角，余光可读、不打扰主工作流
- **三个核心视图**：今日仪表盘 / 时间线回放 / 本周节律
- **隐私边界清晰**：数据 **只存本地**（OS app-data 目录），不联网、不上传

## Token 公式

| 行为 | 消耗 |
|---|---|
| 按键一次 | 1 token |
| 鼠标点击 | 2 tokens |
| 鼠标移动 | 每 100px → 1 token |
| 持续高速 | rate > 8 t/s 时 ×1.5 倍率（模拟认知负担） |
| 空闲 > 5min | 暂停计数 |

5 小时滚动窗口，默认上限 200,000 tokens（≈ 一整天饱和键鼠）。到达 80% 悬浮球变橙提示该休息，到达 100% 进入 cooldown。

## 项目结构

```
human token/
├── src/                     # 前端（vanilla HTML/CSS/JS）
│   ├── widget.html          # 悬浮球（240×130，always-on-top，透明边）
│   ├── index.html           # 主面板（dashboard / timeline / weekly / settings）
│   ├── style.css            # 终端美学样式
│   ├── widget.js
│   └── main.js
├── src-tauri/               # Rust 后端
│   ├── src/
│   │   ├── main.rs / lib.rs
│   │   ├── tracker.rs       # rdev 全局键鼠 hook + 1s 聚合
│   │   ├── token.rs         # token 公式
│   │   ├── storage.rs       # 本地 JSON 存储（96 个 15min 桶/天）
│   │   ├── status_words.rs  # Flibbertigibbeting / Razzmatazzing / ...
│   │   └── commands.rs      # 暴露给前端的 Tauri 命令
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── capabilities/default.json
└── package.json
```

## 首次运行需要安装

> 当前环境 `rustc` 未检测到。下面三件事跑完才能 `npm run dev`。

### 1. Rust toolchain (~10 分钟)

```powershell
winget install Rustlang.Rustup
# 装完关闭并重开 PowerShell，让 PATH 生效
rustup default stable
```

### 2. MSVC C++ Build Tools（Tauri 在 Windows 必需）

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```
（或在 Visual Studio Installer 里勾选 "C++ build tools" + Windows SDK）

### 3. 应用图标

Tauri 打包需要图标。最快方式——准备一张 1024×1024 的 PNG（随便画一张终端方块图），然后：

```powershell
npm install
npx tauri icon ./your-icon.png
```
会自动生成 `src-tauri/icons/` 里需要的全部尺寸。

如果想跳过这步先跑起来，把 `src-tauri/tauri.conf.json` 里的 `bundle.icon` 数组改成空 `[]`，dev 模式不会强制要求。

## 跑起来

```powershell
npm install
npm run dev          # 启动悬浮球 + 隐藏的主面板
```

第一次启动会：
1. 创建 `%LOCALAPPDATA%\human-token\state.json`
2. 弹出右下角的悬浮球（240×130）
3. 主面板默认隐藏 —— 点悬浮球底部的 `▤ dashboard` 打开

## 打包发布

```powershell
npm run build        # 输出到 src-tauri/target/release/bundle/
```

会产出 `.msi` 安装包。包体积预期 ~12MB（vs Electron 等价的 ~150MB）。

## 已知问题

- **路径含空格 + 中文**：当前工作目录 `D:\创作\CODE\human token`。Rust + Tauri 大多数情况下能处理，但极个别 crate 的构建脚本对路径敏感。如果 `cargo build` 报奇怪错误，可以考虑临时把目录搬到 `D:\code\human-token`（纯 ASCII 无空格）。
- **rdev 全局 hook**：在 Windows 上用的是低级钩子，**不会**触发杀毒软件白名单要求，但首次运行可能弹安全提示，点允许即可。
- **数据持久化**：每 30 秒落盘一次。意外断电最坏丢 30 秒数据，没用 SQLite 是为了让数据目录可读、用户能自己删。

## 下一步路线图（未做）

- [ ] 系统托盘菜单（quit / show / about）
- [ ] 配置面板支持自定义 Flibbertigibbet 词表
- [ ] 时间线支持按应用切分（需 active window 检测）
- [ ] 周报 AI insight 接入本地 LLM（坚持本地原则）
- [ ] 悬浮球记住上次位置（`onMoved` 持久化）
- [ ] 悬浮球 hover 时展开 mini-bar 数量
