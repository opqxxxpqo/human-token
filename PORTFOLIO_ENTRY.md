---
title: human token
category: tools           # ← 改成你 5 个 slug 之一（如 code / experiment / tools）
date: 2026-05-17
cover: /works/human-token/cover.jpg
summary: 把键鼠活跃度量化成 token 消耗的桌面悬浮球，借用 Claude Code 终端美学
role: 独立完成（设计 + 开发，Claude Code 协作）
tools:
  - Tauri
  - Rust
  - JavaScript
  - rdev
  - Claude Code
duration: 2026.04 — 2026.05
tags:
  - desktop
  - productivity
  - dataviz
  - AI-assisted
featured: true
longform: true
gallery:
  - /works/human-token/g1-widget.jpg
  - /works/human-token/g2-folded.jpg
  - /works/human-token/g3-dash.jpg
  - /works/human-token/g4-weekly.jpg
  - /works/human-token/g5-timeline.jpg
bilibili:
  - BVxxxxxxxxxx          # ← 录一段 20-40s demo 后填 BV 号
links:
  - { label: GitHub, url: https://github.com/opqxxxpqo/human-token }
  - { label: Windows 安装包, url: https://github.com/opqxxxpqo/human-token/releases/latest }
---

## 一个晚上的发问

写代码时我盯着 Claude Code 终端右下角的 token 计数发呆 —— 那个数字爬升的节奏，比任何 RescueTime 报表都更准确地告诉我"今天有没有在工作"。问题是它只在 Claude Code 内部存在；我离开终端的那一刻，这个反馈就消失了。

human token 把这个反馈搬到桌面任何应用之上。一个 240×158 的悬浮球长期驻留在屏幕右下，把全局键鼠活动按一套公式折算成 token，5 小时滚动窗口，默认上限 200k —— 大约对应一整天饱和键鼠。它不是计时器、不是计步器，是一种把"我在燃烧什么"持续具象化的可视化。

## token 公式

| 行为 | 消耗 |
|---|---|
| 按键 | 1 t |
| 鼠标点击 | 2 t |
| 鼠标移动 | 每 100px → 1 t |
| 持续高速（rate > 8 t/s） | ×1.5 倍率，模拟认知负担 |
| 空闲 > 5min | 自动暂停计数 |

到 80% 悬浮球变橙提示该休息；到 100% 进入 5h cooldown，不再累加，强制 break。

## 三个设计决定

**悬浮球而非任务栏图标**。任务栏图标小到看不见数字，仪表盘要切窗口才能看。悬浮球用余光就能读到，是被动注意力的目标 —— 这是这个东西能存在的前提。

**终端美学**。等宽字 + ASCII 进度条 + ANSI 风格的状态词（`Flibbertigibbeting` / `Razzmatazzing` / `Limbo-ing` ...）。一是因为这是给程序员看的东西，二是为了和 Claude Code 形成视觉对位 —— 你会知道这个东西在和 AI 的 token 计数遥相呼应。

**边缘自动折叠**。悬浮球放久了会挡视线。所以拖到屏幕边缘 600ms 后自动塌缩成 8px 的能量条（高度同步当前 token 用量），鼠标 hover 时再展开。"长期驻留" 和 "不打扰" 的张力靠这个动作化解掉。

## 数据只在本地

整套数据存在 `%LOCALAPPDATA%\human-token\state.json`，一天一个 `DayLog`，每 15min 一个桶。不联网、不上传、不分析。这不是隐私话术 —— 我就是不想再花精力研究第三方 SaaS 的数据条款。卸载就是 `rm` 那个目录。

## AI 协作

Claude Code 写了大约 70% 的代码 —— 主要是 Tauri × Rust × WebView2 三层胶水代码、SVG path 算法、CSS 网格布局。我做的是：定义 token 公式、确定视觉系统、判断每个交互的"对不对" —— 比如折叠条到底要多长、退出弹窗的措辞、悬浮球默认落在哪个位置最不烦人。

最有意思的是 debug 折叠抽动那个问题：Tauri 的原生 drag-region 绕开了 webview 的 mouseup，所以前端永远收不到拖动结束信号；同时 `easeTo` 的每帧 setPosition 又会触发 `onMoved` 形成反馈环。这种跨 OS / Rust / JS 三层的交互 bug，是和 AI 协作时最考验"谁该想清楚什么"的部分 —— AI 给出三种猜测，但定位到根因需要人盯着日志看 30 分钟。

## 技术栈

- **Tauri 2** + **Rust** 后端（rdev 抓全局键鼠 → 1s 聚合 → token 公式 → 推送给前端）
- **vanilla HTML/CSS/JS** 前端（没有 React/Vue —— 4 个屏幕的小工具不需要框架）
- 包体积 ~12MB（同等 Electron 应用约 150MB）
- 数据格式：纯 JSON，96 个 15-min 桶/天，向前兼容

## 路线图

- [x] 全局键鼠监控 + token 公式
- [x] 悬浮球 / dashboard / timeline / weekly 四视图
- [x] 边缘折叠 + hover 展开
- [x] 退出确认与强制存盘
- [x] 24h 专注曲线 + 7 天对比（iOS 电量界面风格）
- [ ] 开机自启动开关
- [ ] 按应用切分时间线（需 active window 检测）
- [ ] 周报本地 LLM insight
