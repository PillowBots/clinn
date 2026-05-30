# clinn
A plugin-based CLI platform that enables AI to autonomously build and search tools. All features—including memory and usage patterns—are automatically downloaded and coded by AI based on user behavior.
# Clinn

> A plugin-based CLI platform that enables AI to autonomously build and search tools. All features—including memory and usage patterns—are automatically downloaded and coded by AI based on user behavior.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

---

## What is Clinn?

**Clinn** is an AI-powered command-line platform that turns your terminal into an intelligent coding assistant. Unlike traditional CLI tools, Clinn doesn't just execute commands — it **thinks**, **remembers**, and **builds its own tools** on the fly.

Built around a plugin architecture, Clinn connects to any OpenAI-compatible LLM and gives the AI full agency over your filesystem: it can read, write, search, and edit files. But the real magic is that the AI can **write and persist its own JavaScript tools** when existing ones aren't enough — extending itself autonomously based on your behavior.

---

## Key Features

### 🤖 Autonomous AI Agent
- Connects to any OpenAI-compatible API (OpenAI, Anthropic via proxy, local models via Ollama, etc.)
- Multi-turn conversation loop with automatic tool calling
- Self-recursive invocation (`agent_self_invoke`) — the AI can spawn sub-agents for parallel tasks

### 🧠 Persistent Memory System
- Long-term memory with keyword search and tag-based retrieval
- Automatic context compression — when conversations get too long, Clinn summarizes and stores them
- Customizable memory limits (entries, history, character caps)

### 🔌 Plugin-Based Tool Architecture
Clinn ships with a rich set of built-in tools, all accessible to the AI:

| Category | Tools |
|----------|-------|
| **File Ops** | `read_file`, `write_file`, `delete_file`, `move_file`, `copy_file`, `list_dir` |
| **Search** | `search_in_files` (grep), `find_files` (glob), `file_info` (metadata) |
| **Edit** | `edit_lines` (insert/replace/delete by line), `read_lines`, `search_in_range` |
| **Web** | `web_fetch` — virtual browser for fetching and extracting web content |
| **Memory** | `search_memory`, `save_memory`, `list_memory`, `delete_memory`, `compress_context` |
| **Execution** | `exec_console`, `wait_command` — run terminal commands |
| **Timers** | `set_timer` — async delayed notifications for polling workflows |
| **Meta** | `save_tool`, `delete_tool_file`, `list_saved_tools` — AI self-extension |

### 🛠️ AI Self-Extension (Dynamic Tool Building)
The AI can write new JavaScript tools at runtime, which are persisted to `Tools/custom/` and loaded automatically on next startup. This means Clinn **grows with you** — every interaction teaches it new capabilities.

### 🎨 Beautiful Terminal UI
- Color-coded output (cyan for AI, green for code, yellow for warnings)
- ASCII box rendering for code blocks
- Auto-formatted tables with alignment detection
- Line-wrapping that respects terminal width
- Spinning progress indicator during LLM calls

### ⚡ Streaming & Non-Streaming Support
Full support for both streaming and non-streaming chat completions. Real-time token-by-token output with automatic tool call extraction.

---

## Architecture

```
Publish/
├── config.json            # LLM config, UI settings, trusted tools
├── Logos/
│   └── StartLogo.txt      # ASCII art banner
├── Src/
│   ├── index.js           # CLI entry: REPL loop, command routing, UI rendering
│   ├── agent.js           # Agent core: system prompt, tool injection, conversation loop
│   └── llm.js             # LLM client: HTTPS requests, streaming, token tracking
├── Mem/
│   └── index.js           # ConversationMemory: history, entries, search, compression
└── Tools/
    ├── index.js           # Tool registry, custom tool loader, trust management
    ├── file_tools.js      # File system operations (read, write, delete, move, copy, list)
    ├── search_tools.js    # File search (grep, glob, metadata)
    ├── edit_tools.js      # Line-level editing (insert, replace, delete, read range)
    └── custom/            # AI-generated persistent tools (auto-loaded)
```

---

## Getting Started

### Prerequisites
- **Node.js** ≥ 18
- An OpenAI-compatible API key (OpenAI, any proxy, or local model)

### Installation

```bash
git clone https://github.com/PillowBots/clinn.git
cd clinn
```

### Configuration

Create a `Publish/config.json` file:

```json
{
  "llm": {
    "apiKey": "your-api-key-here",
    "baseURL": "https://api.openai.com/v1",
    "model": "gpt-4o",
    "maxTokens": 65536,
    "temperature": 0.7,
    "topP": 0.9
  },
  "systemPrompt": "You are Clinn, an intelligent programming assistant...",
  "memory": {
    "maxHistory": 30,
    "maxEntries": 800,
    "maxEntryChars": 200,
    "autoCompressThreshold": 5000
  },
  "tools": {
    "trustedTools": ["read_file", "write_file", "search_in_files"]
  },
  "ui": {
    "showLogo": true,
    "logoPath": "Logos/StartLogo.txt",
    "dividerChar": "-"
  }
}
```

### Run

```bash
node Publish/Src/index.js
```

### Environment Variables (Alternative)

You can also set the API key via environment variable:

```bash
export OPENAI_API_KEY="sk-..."
node Publish/Src/index.js
```

---

## How It Works

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   CLI (UI)  │ ───▶ │  Agent Core  │ ───▶ │  LLM Client │
│  index.js   │ ◀─── │  agent.js    │ ◀─── │   llm.js    │
└─────────────┘      └──────┬───────┘      └─────────────┘
                            │
                     ┌──────▼───────┐
                     │  Tool System │
                     │  Tools/      │
                     └──────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
        ┌──────────┐ ┌──────────┐ ┌────────────┐
        │  File    │ │  Search  │ │   Memory   │
        │  Tools   │ │  Tools   │ │  Mem/      │
        └──────────┘ └──────────┘ └────────────┘
```

1. **User types a request** in the CLI
2. **Agent** builds a system prompt with environment info and sends it to the LLM
3. **LLM** responds — either with a direct answer or with tool calls
4. **Agent** executes the tool calls (with permission checks for dangerous operations)
5. Results are fed back to the LLM, iterating up to 25 rounds
6. **Memory** is updated with each interaction, and auto-compressed when needed

---

## Built-In Commands

| Command | Description |
|---------|-------------|
| `/exit` or `/quit` | Exit Clinn |
| `/clear` | Clear the screen |
| `/history` | Show conversation history |
| `/memory` | Show memory statistics |
| `/tools` | List all registered tools |
| `/usage` | Show LLM token usage |
| `/compress` | Manually compress conversation context |
| `/trust <tool>` | Add a tool to trusted (no permission prompts) |
| `/untrust <tool>` | Remove a tool from trusted |
| `/custom` | List AI-generated custom tools |

---

## Safety & Permissions

Clinn distinguishes between **safe** and **dangerous** operations:

- **Safe tools** (read, search, list) run without confirmation
- **Dangerous tools** (write, delete, move, execute commands) prompt for user approval unless explicitly trusted

You can pre-configure trusted tools in `config.json` or manage them at runtime with `/trust` and `/untrust` commands.

---

## Use Cases

- **Code Generation & Refactoring** — Read, write, and edit source files across your project
- **Codebase Exploration** — Grep through directories, find files by pattern, inspect metadata
- **Research Assistant** — Fetch and analyze web content, save findings to memory
- **Automated DevOps** — Execute shell commands, monitor output, react to results
- **Self-Improving Workflows** — Let the AI build custom tools that persist across sessions

---

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.

---

## Credits

Created by [PillowBots](https://github.com/PillowBots).  
Inspired by the vision of AI that doesn't just answer questions — it **builds the tools** to answer them better.
