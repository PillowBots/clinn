# Clinn — 终端原生 AI 编程助手

> DeepSeek 驱动 · 50+ 工具 · 对话记忆 · 虚拟浏览器 · 零依赖运行

Clinn 是一个运行在终端里的 AI Agent，直接和你的文件系统、Shell、网络交互。不需要 IDE、不需要插件——打开终端，说人话，它帮你干活。

```
██████  ██      ██ ███    ██ ███    ██
██      ██      ██ ████   ██ ████   ██
██      ██      ██ ██ ██  ██ ██ ██  ██
██      ██      ██ ██  ██ ██ ██  ██ ██
██████  ███████ ██ ██   ████ ██   █ 0.7
```

---

## 安装

### npm（推荐）

```bash
npm install -g @ghenya/clinn
```

安装后在终端输入 `clinn` 即可启动。首次运行会自动在 `~/.clinn/` 创建配置文件。

配置路径：`~/.clinn/config.json`  ·  历史记录：`~/.clinn/mem/`  ·  自定义工具：`~/.clinn/Tools/custom/`

或终端内直接 `/api key <KEY>` 设置 API Key，无需编辑文件。

### 手动安装 (macOS / Linux / WSL)

```bash
git clone https://github.com/PillowBots/clinn.git
cd clinn
bash install.sh
```

安装后全局可用：终端输入 `clinn` 即可启动。

### Windows

```bat
git clone https://github.com/PillowBots/clinn.git
cd clinn
install.bat
```

或直接双击 `clinn.bat`。

### 前置条件

- Node.js >= 18
- DeepSeek API Key（[获取地址](https://platform.deepseek.com/)）

首次运行时会提示输入 API Key。

---

## 核心能力

| 类别 | 工具 |
|---|---|
| **文件操作** | read, write, delete_file, move_file, copy_file, search_replace, edit_lines, read_lines, file_info |
| **目录浏览** | ls, list_dir, tree, glob — 一键看完项目结构 |
| **搜索** | grep, search_in_files, search_in_range, find_files |
| **终端** | exec_console, check_command_status — 直接跑命令 |
| **网络** | web_search（Bing 搜索）, web_fetch（网页抓取）, browse_page（虚拟浏览器反反爬） |
| **记忆** | search_memory, save_memory, list_memory, delete_memory |
| **对话** | forget_conversation, restart_session |
| **任务** | todo_write, set_timer, skill |
| **工具管理** | save_tool, delete_tool_file, list_saved_tools — AI 自己写的工具持久化保存 |
| **诊断** | get_diagnostics |
| **预览** | open_preview |

---

## 使用方式

启动后直接输入自然语言：

```
> 帮我分析这个项目的代码结构
> 搜索项目里所有 TODO 注释
> 把 README.md 里的英文翻译成中文
> 液氮超频的最高纪录是多少？
```

### 内置命令

| 命令 | 说明 |
|---|---|
| `/help` | 查看所有命令 |
| `/tools` | 查看工具列表 |
| `/history [n]` | 查看最近 n 条对话 |
| `/history files` | 查看历史文件列表 |
| `/history search <关键词>` | 搜索历史 |
| `/reset` | 重置当前对话 |
| `/ctx` | 查看上下文使用量 |
| `/clear` | 清除上下文记忆 |
| `/status` | 查看当前状态 |
| `/trusted` | 查看受信任工具 |
| `/trust <name>` | 永久信任工具 |
| `/untrust <name>` | 取消信任 |
| `/exit` | 退出 |

---

## 核心特性

### 对话记忆与历史

每次对话自动保存到 `Mem/history-YYYY-MM-DD.json`，包含完整的工具调用链路。支持历史搜索、回顾、分页浏览（less 分页器）。

### 虚拟浏览器

`browse_page` 工具基于 puppeteer-core + Chrome Headless，可绕过大部分反爬机制，用于抓取需要 JS 渲染的页面。

### 自定义工具持久化

AI 可以在对话中生成工具代码，通过 `save_tool` 持久化到 `Tools/custom/` 目录，下次启动自动加载。

### 上下文实时监控

- 90%：黄色提示 "建议 /clear 清除对话"
- 95%：二次警告 "请尽快 /clear"
- 不会再自动压缩上下文——由用户自己决定何时 `/clear`

### 思考动画

braille spinner 旋转指示 LLM 推理状态，120ms 一帧，流畅不刷屏。有内容输出时自动静默。

---

## 项目结构

```
Clinn/
├── Src/
│   ├── index.js        # CLI 入口、UI 渲染、斜杠命令
│   ├── agent.js        # Agent 主逻辑、工具循环、记忆管理
│   └── llm.js          # DeepSeek API 客户端、流式解析
├── Tools/
│   ├── index.js        # 工具注册、权限、自定义工具加载
│   ├── file_tools.js   # 文件读写操作
│   ├── edit_tools.js   # search_replace、edit_lines
│   ├── search_tools.js # grep、find_files、web_fetch
│   ├── extended_tools.js # web_search (Bing)、exec_console、todo_write 等
│   ├── browser.js      # 虚拟浏览器 (puppeteer-core)
│   ├── tokenizer.js    # Token 估算
│   └── custom/         # 用户自定义工具持久化目录
├── Mem/
│   ├── index.js        # ConversationMemory
│   ├── history.js      # 历史文件读写、搜索
│   └── history-*.json  # 按日期存储的对话历史
├── Logos/
│   └── StartLogo.txt   # 启动 Logo
├── config.json         # 配置文件
├── install.sh          # macOS/Linux 安装脚本
├── install.bat         # Windows 安装脚本
├── clinn.bat           # Windows 快捷启动
├── package.json
└── public/             # 发布版本
    └── clinn-v0.7.1/
```

---

## 配置

编辑 `config.json`：

```json
{
  "llm": {
    "provider": "deepseek",
    "apiKey": "YOUR_DEEPSEEK_API_KEY_HERE",
    "baseURL": "https://api.deepseek.com/v1",
    "model": "deepseek-v4-pro",
    "maxTokens": 8000,
    "temperature": 0.7
  },
  "memory": {
    "maxHistory": 100,
    "maxEntries": 800
  },
  "ui": {
    "showLogo": true,
    "dividerChar": "-"
  }
}
```

---

## 更新日志 (Changelog)

### v0.7.1 — CLI 增强 & npm 发布

- **`/api` 命令**：直接在终端配置 API Key、API 地址、模型名称
- **npm 发布**：`npm install -g @ghenya/clinn` 全球安装
- v0.7.2-0.7.5：Windows 兼容性修复，bin 入口 `.bat`/`.sh` 双平台适配

### v0.7.0 — 交互重构 & 稳定性

- **上下文监控三级预警**：90% 提示 / 95% 警告 / 不再自动压缩，用户自主 `/clear`
- **工具执行静默化**：不再刷屏动画，只显示 `✓ tool_name` 完成标记
- **思考动画**：braille spinner `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` 120ms 旋转指示推理状态
- **修复死循环误判**：循环检测改为工具名+参数逐字比对，只有 300 次完全相同才拦截
- **修复上下文百分比漂移**：统一用持久记忆计算，排除临时网页正文干扰
- **全量对话历史**：`history-*.json` 保存完整工具调用链路
- **web_search 切换 Bing**：cn.bing.com HTML 解析，国内可用
- **虚拟浏览器**：browse_page 基于 puppeteer-core，反反爬

### v0.6.0 — 记忆系统

- 对话记忆与历史文件持久化
- `/history` 命令 + less 分页器浏览
- 历史搜索功能
- 表格结构转纯文本输出
- 宁缺毋滥行宽控制

### v0.5.0 — 首发

- DeepSeek API 集成
- 50+ 工具体系
- 工具权限控制
- 自定义工具持久化
- install.sh / install.bat 一键安装
- 流式响应输出

---

## 许可

MIT License
