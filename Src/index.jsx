#!/usr/bin/env node
import React, { useState, useCallback, useRef } from "react";
import { render, Box, Text, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import os from "os";

const require = createRequire(import.meta.url);

const Tools = require("../Tools");
const { listRecentTurns, searchHistory, getFileList, loadFileTurns } = require("../Mem/history");

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

const CLINN_DIR = path.join(os.homedir(), ".clinn");
const CLINN_CONFIG = path.join(CLINN_DIR, "config.json");
const PKG_CONFIG = path.join(__dirname, "..", "config.json");
const LOGO_PATH = path.join(__dirname, "..", "Logos", "StartLogo.txt");

const VER = "0.8.0";

function ensureDir() { if (!fs.existsSync(CLINN_DIR)) fs.mkdirSync(CLINN_DIR, { recursive: true }); }
function loadConfig() {
  ensureDir();
  if (fs.existsSync(CLINN_CONFIG)) return JSON.parse(fs.readFileSync(CLINN_CONFIG, "utf-8"));
  const cfg = JSON.parse(fs.readFileSync(PKG_CONFIG, "utf-8"));
  fs.writeFileSync(CLINN_CONFIG, JSON.stringify(cfg, null, 2), "utf-8");
  return cfg;
}
function saveConfig(cfg) { ensureDir(); fs.writeFileSync(CLINN_CONFIG, JSON.stringify(cfg, null, 2), "utf-8"); }

const CONFIG = loadConfig();

const LOGO_LINES = (() => {
  try {
    const raw = fs.readFileSync(LOGO_PATH, "utf-8");
    return raw.replace(/0\.\d+\.\d+/, VER).split("\n").filter(l => l.trim() || l === "");
  } catch (_) { return ["CLINN"]; }
})();

const MAX_MSG = 200;

function isWide(cp) {
  return (cp >= 0x1100 && cp <= 0x115F) ||
    (cp >= 0x2329 && cp <= 0x232A) ||
    (cp >= 0x2E80 && cp <= 0x4DBF) ||
    (cp >= 0x4E00 && cp <= 0xA4CF) ||
    (cp >= 0xA960 && cp <= 0xA97F) ||
    (cp >= 0xAC00 && cp <= 0xD7AF) ||
    (cp >= 0xF900 && cp <= 0xFAFF) ||
    (cp >= 0xFE10 && cp <= 0xFE1F) ||
    (cp >= 0xFE30 && cp <= 0xFE6F) ||
    (cp >= 0xFF01 && cp <= 0xFF60) ||
    (cp >= 0xFFE0 && cp <= 0xFFE6) ||
    (cp >= 0x1B000 && cp <= 0x1B2FF) ||
    (cp >= 0x1F200 && cp <= 0x1F2FF) ||
    (cp >= 0x20000 && cp <= 0x2FFFF);
}

function termLen(s) {
  let w = 0;
  for (const ch of s) w += isWide(ch.codePointAt(0)) ? 2 : 1;
  return w;
}

function padTerm(s, n) {
  const d = n - termLen(s);
  return s + (d > 0 ? " ".repeat(d) : "");
}

function formatMd(text, maxW) {
  const w = maxW || 80;
  const lines = text.split("\n");
  const out = [];
  let tableBuf = [];
  let inCode = false;
  const isTR = (s) => /^\|[\s\S]+\|$/.test(s.trim());
  const isTS = (s) => /^\|[\s\-:|]+\|$/.test(s.trim());
  const isCF = (s) => s.trim().startsWith("```");

  function flush() {
    if (tableBuf.length < 2) { tableBuf = []; return; }
    const rows = tableBuf.map(r =>
      r.split("|").filter((_, i, a) => i > 0 && i < a.length - 1).map(c => c.trim())
    );
    const hd = rows[0];
    const data = rows.filter((r, i) => i > 0 && !r.every(c => /^:?-+:?$/.test(c)));
    if (!hd.length || !data.length) { tableBuf = []; return; }

    const maxCol = hd.map((c, ci) =>
      Math.max(termLen(c), ...data.map(r => termLen(r[ci] || "")))
    );
    const widths = maxCol.map(x => x + 2);
    const totalW = widths.reduce((a, b) => a + b, 0) + hd.length - 1;

    if (totalW <= w) {
      const hdrLine = "\u2500".repeat(totalW);
      out.push(hd.map((c, i) => " " + padTerm(c, widths[i] - 1)).join(" "));
      out.push(hdrLine);
      for (const row of data) {
        out.push(row.map((c, i) => " " + padTerm(c || "", widths[i] - 1)).join(" "));
      }
    } else {
      for (const row of data) {
        const parts = [];
        for (let i = 0; i < hd.length && i < row.length; i++) {
          if (row[i]) parts.push(hd[i] + ": " + row[i]);
        }
        out.push(parts.join(" \u00b7 "));
      }
    }
    tableBuf = [];
  }

  for (const line of lines) {
    if (isCF(line)) { flush(); inCode = !inCode; continue; }
    if (inCode) { out.push("  " + line); continue; }
    if (isTR(line)) { tableBuf.push(line); continue; }
    if (isTS(line) && tableBuf.length >= 1) { tableBuf.push(line); continue; }
    if (tableBuf.length) flush();
    out.push(line);
  }
  flush();
  return out.join("\n")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,4}\s+/gm, "")
    .replace(/^>\s?/gm, "  ");
}

function Msg({ role, content }) {
  const lines = content.split("\n");
  const C = {
    user: "greenBright",
    system: "yellow",
    assistant: "cyanBright",
  };
  const L = {
    user: "(^o^)ﾉ 你",
    system: "(!_!) 系统",
    assistant: "(^_^) Clinn",
  };
  const bodyColor = role === "user" ? "white" : role === "system" ? "yellow" : undefined;
  return (
    <Box flexDirection="column">
      <Text color={C[role]} bold>{L[role]}</Text>
      <Text color={bodyColor}>
        {lines.map((l, i) => (i === 0 ? "" : "\n") + "   " + (l || " ")).join("")}
      </Text>
    </Box>
  );
}

function Streaming({ content }) {
  const lines = content.split("\n");
  return (
    <Box flexDirection="column">
      <Box>
        <Text color="cyanBright" bold>(^_^) Clinn</Text>
        <Box marginLeft={1}>
          <Text color="cyan"><Spinner type="dots" /></Text>
        </Box>
      </Box>
      <Text>{lines.map((l, i) => (i === 0 ? "" : "\n") + "   " + (l || " ")).join("")}</Text>
    </Box>
  );
}

function ToolLog({ tools }) {
  if (!tools.length) return null;
  return (
    <Box flexDirection="column" paddingLeft={2}>
      {tools.map((t, i) => (
        <Box key={i} flexDirection="column">
          <Box>
            {t.status === "done"
              ? <Text color="green">(^_^)b </Text>
              : <Text color="yellow"><Spinner /> </Text>}
            <Text dimColor>{t.name}</Text>
            {t.args ? <Text color="gray"> {t.args}</Text> : null}
          </Box>
          {t.result ? (
            <Box paddingLeft={4}>
              <Text color="gray">{t.result.slice(0, 120)}</Text>
            </Box>
          ) : null}
        </Box>
      ))}
    </Box>
  );
}

let _agent = null;
function getAgent() {
  if (_agent) return _agent;
  const Agent = require("./agent.cjs");
  _agent = new Agent(CONFIG, { onPermission: () => true });
  return _agent;
}

const COMMANDS = [
  { cmd: "/help", desc: "查看帮助" },
  { cmd: "/exit", desc: "退出程序" },
  { cmd: "/reset", desc: "重置对话" },
  { cmd: "/clear", desc: "清除对话" },
  { cmd: "/version", desc: "查看版本" },
  { cmd: "/status", desc: "当前状态" },
  { cmd: "/ctx", desc: "上下文使用量" },
  { cmd: "/tools", desc: "列出工具" },
  { cmd: "/tools_more", desc: "全部工具(含扩展)" },
  { cmd: "/tool_search", desc: "搜索工具" },
  { cmd: "/tool_list_saved", desc: "列出持久化工具" },
  { cmd: "/tool_save", desc: "持久化保存工具" },
  { cmd: "/tool_del_saved", desc: "删除持久化工具" },
  { cmd: "/temp", desc: "设置温度 0-2" },
  { cmd: "/token", desc: "设置最大输出token" },
  { cmd: "/memory", desc: "记忆统计" },
  { cmd: "/memory_list", desc: "列出记忆条目" },
  { cmd: "/memory_search", desc: "搜索记忆" },
  { cmd: "/memory_del", desc: "删除记忆" },
  { cmd: "/memory_clear", desc: "清空记忆" },
  { cmd: "/compress", desc: "手动压缩上下文" },
  { cmd: "/history", desc: "查看最近历史" },
  { cmd: "/history files", desc: "历史文件列表" },
  { cmd: "/history search", desc: "搜索历史" },
  { cmd: "/history read", desc: "读取历史文件" },
  { cmd: "/trusted", desc: "查看受信任工具" },
  { cmd: "/trust", desc: "永久信任工具" },
  { cmd: "/untrust", desc: "取消信任" },
  { cmd: "/api", desc: "查看/配置API" },
  { cmd: "/api key", desc: "设置API Key" },
  { cmd: "/api url", desc: "设置API地址" },
  { cmd: "/api model", desc: "设置模型" },
];

function App() {
  const { stdout } = useStdout();
  const cols = stdout ? stdout.columns : 80;

  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [tools, setTools] = useState([]);
  const [ctxPct, setCtxPct] = useState(15);
  const [blocked, setBlocked] = useState(false);
  const [slashIdx, setSlashIdx] = useState(0);
  const [msgs, setMsgs] = useState([
    { role: "system", content: `欢迎来到 Clinn v${VER}！Ink 全屏终端界面。` },
    { role: "system", content: "按 / 查看命令菜单 ↑↓选择 回车选取" },
  ]);

  const addMsg = useCallback((role, text) => {
    setMsgs(prev => {
      const next = [...prev, { role, content: text }];
      return next.length > MAX_MSG ? next.slice(-MAX_MSG) : next;
    });
  }, []);

  const run = useCallback(async (query) => {
    if (blocked) return;
    setBlocked(true);
    setThinking(true);
    setStreaming("");
    setTools([]);

    let buf = "";
    const toolMap = new Map();

    try {
      await getAgent().run(query, {
        onContent: (tok) => {
          buf += tok;
          setStreaming(buf.replace(/\*\*(.+?)\*\*/g, "$1"));
        },
        onToolCall: (name, args = {}) => {
          const short = Object.entries(args).map(([k, v]) => {
            const s = String(v);
            return k + "=" + (s.length > 50 ? s.slice(0, 50) + "…" : s);
          }).join(" ");
          toolMap.set(name, { name, args: short, status: "running", result: "" });
          setTools([...toolMap.values()]);
        },
        onToolResult: (name, result) => {
          const t = toolMap.get(name);
          if (t) {
            t.status = "done";
            t.result = String(result || "").replace(/\n/g, " ").slice(0, 150);
          }
          setTools([...toolMap.values()]);
        },
        onContextPct: (pct) => setCtxPct(pct),
      });
    } catch (e) {
      addMsg("system", "错误: " + e.message);
    }

    if (buf) addMsg("assistant", formatMd(buf, cols - 4));
    setStreaming("");
    setThinking(false);
    setTools([]);
    setBlocked(false);
  }, [blocked, addMsg, cols]);

  const slashRef = useRef({ filtered: [], clamped: 0 });

  const handleSubmit = useCallback((val) => {
    const v = val.trim();
    if (!v || thinking) return;
    const { filtered, clamped } = slashRef.current;
    if (filtered.length > 0 && clamped < filtered.length) {
      const sel = filtered[clamped].cmd;
      if (v !== sel) {
        setInput(sel + " ");
        setSlashIdx(0);
        return;
      }
    }
    addMsg("user", v);
    setInput("");

    const parts = v.slice(1).trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const rest = parts.slice(1).join(" ");

    const say = (t) => addMsg("system", t);

    if (v === "/help") {
      say([
        "╭────────────────────────────────────╮",
        "│  /help              查看帮助       │",
        "│  /exit              退出程序       │",
        "│  /reset             重置对话       │",
        "│  /clear             清除对话       │",
        "│  /version           查看版本       │",
        "│  /status            当前状态       │",
        "│  /ctx               上下文使用量   │",
        "│  /tools             列出工具       │",
        "│  /tools_more        全部工具       │",
        "│  /tool_search <q>   搜索工具       │",
        "│  /tool_list_saved   列出持久化工具 │",
        "│  /tool_save <name>  持久化保存工具 │",
        "│  /tool_del <name>   删除持久化工具 │",
        "│  /temp <0-2>        设置温度       │",
        "│  /token <n>         设置maxTokens  │",
        "│  /memory            记忆统计       │",
        "│  /memory_list [n]   列出记忆条目   │",
        "│  /memory_search <q> 搜索记忆       │",
        "│  /memory_del <id>   删除记忆       │",
        "│  /memory_clear      清空记忆       │",
        "│  /compress          手动压缩上下文 │",
        "│  /history [n]       最近历史       │",
        "│  /history files     历史文件列表   │",
        "│  /history search <q>搜索历史       │",
        "│  /history read <f>  读取历史文件   │",
        "│  /trusted           受信任工具     │",
        "│  /trust <name>      永久信任工具   │",
        "│  /untrust <name>    取消信任       │",
        "│  /api               查看API配置    │",
        "│  /api key <K>       设置Key        │",
        "│  /api url <U>       设置地址       │",
        "│  /api model <M>     设置模型       │",
        "╰────────────────────────────────────╯",
      ].join("\n"));
    }
    else if (cmd === "exit") process.exit(0);
    else if (cmd === "reset") {
      getAgent().reset();
      setMsgs([{ role: "system", content: "对话已重置。" }]);
      setCtxPct(0);
      say("对话已重置 (历史+token计数已清零)");
    }
    else if (cmd === "clear") {
      setMsgs([{ role: "system", content: "对话已清除。" }]);
      setCtxPct(0);
    }
    else if (cmd === "version") {
      say("Clinn v" + VER + " — Ink Edition · " + CONFIG.llm.model);
    }
    else if (cmd === "status") {
      const a = getAgent();
      const usage = a.getUsage();
      const mem = a.memory.stats();
      const pct = a.estimateContextPct();
      const names = Tools.listToolNames();
      say([
        "╭────────────────────────────────────╮",
        "  模型: " + CONFIG.llm.model + "  温度: " + CONFIG.llm.temperature,
        "  Tokens: 输入" + usage.prompt + " · 输出" + usage.completion,
        "  上下文: " + pct + "% (上限 " + a.getMaxContextTokens() + " tokens)",
        "  记忆: " + mem.entries + "/" + mem.maxEntries + " 条 · 历史 " + mem.historyMessages + " 轮",
        "  工具: " + names.length + " 个 — " + names.slice(0, 8).join(", ") + (names.length > 8 ? " ..." : ""),
        "╰────────────────────────────────────╯",
      ].join("\n"));
    }
    else if (cmd === "ctx") {
      const a = getAgent();
      const pct = a.estimateContextPct();
      const usage = a.getUsage();
      const barW = 30;
      const filled = Math.max(1, Math.round(pct / 100 * barW));
      const empty = barW - filled;
      const bar = "█".repeat(filled) + "─".repeat(empty);
      say([
        "上下文: [" + bar + "] " + pct + "%",
        "上限: " + a.getMaxContextTokens() + " tokens",
        "累计: 输入" + usage.prompt + " · 输出" + usage.completion + " · 合计" + (usage.prompt + usage.completion),
        ">80% 时可 /compress 压缩或让 AI 调用 forget_conversation",
      ].join("\n"));
    }
    else if (cmd === "memory") {
      const s = getAgent().memory.stats();
      say("记忆: " + s.entries + "/" + s.maxEntries + " 条 · 历史消息 " + s.historyMessages + " 轮");
    }
    else if (cmd === "memory_list") {
      const n = parseInt(rest) || 20;
      const all = getAgent().memory.getAllEntries().slice(-n);
      if (!all.length) { say("(无记忆条目)"); return; }
      say(all.map((e) => "#" + e.id + " [" + (e.tags?.join(",") || "-") + "] " + e.text).join("\n"));
    }
    else if (cmd === "memory_search") {
      if (!rest) { say("用法: /memory_search <关键词>"); return; }
      const found = getAgent().memory.searchEntries(rest, 10);
      if (!found.length) { say("未找到匹配 \"" + rest + "\" 的记忆"); return; }
      say(found.map((e) => "#" + e.id + " [" + (e.tags?.join(",") || "-") + "] " + e.text).join("\n"));
    }
    else if (cmd === "memory_del") {
      const id = parseInt(rest);
      if (isNaN(id)) { say("用法: /memory_del <id>"); return; }
      const ok = getAgent().memory.removeEntry(id);
      say(ok ? "已删除 #" + id : "不存在 #" + id);
    }
    else if (cmd === "memory_clear") {
      getAgent().memory.clearEntries();
      say("记忆已全部清空");
    }
    else if (cmd === "compress") {
      const a = getAgent();
      const compressed = a.memory.compressHistory();
      if (!compressed) { say("对话太短, 无需压缩"); return; }
      a.memory.clear();
      a.memory.addEntry("手动压缩: " + compressed.slice(0, 180), ["manual-summary"]);
      say("上下文已压缩, 历史清空, 摘要已存入记忆");
    }
    else if (cmd === "tools") {
      const names = Tools.listToolNames();
      const base = names.filter((n) => !["forget_conversation", "restart_session", "todo_write", "search_replace", "glob", "grep", "read", "write", "ls", "web_search", "check_command_status", "open_preview", "get_diagnostics", "skill", "exec_console", "wait_command", "web_fetch"].includes(n));
      const lines = base.map((n) => {
        const t = Tools.getTool(n);
        return "  " + n + (t?.description ? " — " + t.description.slice(0, 40) : "");
      });
      say(lines.join("\n") + "\n\n共 " + base.length + " 个核心工具, " + (names.length - base.length) + " 个扩展工具 (输入 /tools_more 查看全部)");
    }
    else if (cmd === "tools_more") {
      const names = Tools.listToolNames();
      say(names.map((n) => {
        const t = Tools.getTool(n);
        return "  " + n + (t?.description ? " — " + t.description.slice(0, 60) : "");
      }).join("\n") + "\n\n共 " + names.length + " 个工具");
    }
    else if (cmd === "tool_search") {
      if (!rest) { say("用法: /tool_search <关键词>"); return; }
      const found = Tools.searchToolRegistry(rest);
      if (!found.length) { say("未找到匹配 \"" + rest + "\" 的工具"); return; }
      say(found.map((t) => t.name + " — " + t.description).join("\n"));
    }
    else if (cmd === "tool_list_saved") {
      const saved = Tools.listCustomTools();
      if (!saved.length) { say("(无持久化工具)"); return; }
      say(saved.map((s) => "[" + s.file + "] 导出: " + s.exports.join(", ")).join("\n"));
    }
    else if (cmd === "tool_del_saved") {
      if (!rest) { say("用法: /tool_del_saved <name>"); return; }
      const result = Tools.deleteToolFile(rest);
      if (result.startsWith("[OK]")) getAgent().refreshTools();
      say(result);
    }
    else if (cmd === "temp") {
      const n = parseFloat(rest);
      if (isNaN(n) || n < 0 || n > 2) { say("温度范围 0-2"); return; }
      CONFIG.llm.temperature = n; saveConfig(CONFIG);
      say("温度已设为 " + n);
    }
    else if (cmd === "token") {
      const n = parseInt(rest, 10);
      if (isNaN(n) || n < 1 || n > 128000) { say("范围 1-128000"); return; }
      CONFIG.llm.maxTokens = n; saveConfig(CONFIG);
      say("MaxTokens 已设为 " + n);
    }
    else if (cmd === "history") {
      const subParts = rest.trim().split(/\s+/);
      const sub = subParts[0]?.toLowerCase();
      const arg = subParts.slice(1).join(" ");
      if (sub === "files") {
        const files = getFileList();
        if (!files.length) { say("(暂无历史文件)"); return; }
        say(files.map((f) => f.file + " | " + f.turns + "轮 | " + f.size + "KB | " + f.created.slice(0, 10)).join("\n"));
      } else if (sub === "search") {
        if (!arg) { say("用法: /history search <关键词>"); return; }
        const results = searchHistory(arg, 10);
        if (!results.length) { say("未找到匹配 \"" + arg + "\""); return; }
        say(results.map((r, i) => (i + 1) + ". [" + r.file + "] " + (r.time?.slice(0, 16) || "?") + "\n  " + r.user.slice(0, 120)).join("\n\n"));
      } else if (sub === "read") {
        if (!arg) { say("用法: /history read <文件名>"); return; }
        const turns = loadFileTurns(arg, 10);
        if (!turns.length) { say("找不到文件 " + arg); return; }
        say(turns.map((t, i) => (i + 1) + ". [" + (t.time?.slice(0, 16) || "?") + "]\n  问: " + (t.user || "").slice(0, 200) + "\n  答: " + (t.assistant || "").slice(0, 200)).join("\n\n"));
      } else {
        const n = parseInt(sub) || 10;
        const turns = listRecentTurns(n);
        if (!turns.length) { say("(暂无历史记录)"); return; }
        say(turns.map((t, i) => (i + 1) + ". [" + (t.time?.slice(0, 16) || "?") + "] " + (t.user || "").slice(0, 120)).join("\n"));
      }
    }
    else if (cmd === "trusted") {
      const trusted = CONFIG.tools?.trustedTools || [];
      if (!trusted.length) { say("(暂无受信任工具)"); return; }
      say("受信任工具 (" + trusted.length + " 个):\n" + trusted.join("\n"));
    }
    else if (cmd === "trust") {
      if (!rest) { say("用法: /trust <工具名>"); return; }
      Tools.addTrusted(rest);
      CONFIG.tools.trustedTools = [...new Set([...(CONFIG.tools?.trustedTools || []), rest])];
      saveConfig(CONFIG);
      say("已永久信任 " + rest);
    }
    else if (cmd === "untrust") {
      if (!rest) { say("用法: /untrust <工具名>"); return; }
      Tools.removeTrusted(rest);
      CONFIG.tools.trustedTools = (CONFIG.tools?.trustedTools || []).filter((n) => n !== rest);
      saveConfig(CONFIG);
      say("已取消信任 " + rest);
    }
    else if (cmd === "api") {
      const sub = rest.split(/\s+/)[0]?.toLowerCase();
      const val = rest.slice(sub ? sub.length : 0).trim();
      if (sub === "key") {
        if (!val) { say("用法: /api key <Key>"); return; }
        if (val.length < 10) { say("Key 太短"); return; }
        CONFIG.llm.apiKey = val; saveConfig(CONFIG);
        say("API Key 已更新 (" + val.slice(0, 8) + "...)");
      } else if (sub === "url") {
        if (!val) { say("用法: /api url <地址>"); return; }
        CONFIG.llm.baseURL = val.replace(/\/+$/, ""); saveConfig(CONFIG);
        say("API 地址已更新: " + CONFIG.llm.baseURL);
      } else if (sub === "model") {
        if (!val) { say("用法: /api model <模型名>"); return; }
        CONFIG.llm.model = val; saveConfig(CONFIG);
        say("模型已更新: " + CONFIG.llm.model);
      } else {
        const masked = CONFIG.llm.apiKey ? CONFIG.llm.apiKey.slice(0, 8) + "..." + CONFIG.llm.apiKey.slice(-4) : "(未设置)";
        say([
          "API 设置",
          "  Key:   " + masked,
          "  URL:   " + CONFIG.llm.baseURL,
          "  Model: " + CONFIG.llm.model,
          "  温度:  " + CONFIG.llm.temperature + "  |  MaxTokens: " + (CONFIG.llm.maxTokens || "-"),
          "  设置: /api key <K>  |  /api url <U>  |  /api model <M>",
        ].join("\n"));
      }
    }
    else { run(v); }
  }, [thinking, addMsg, run]);

  const slashInput = input.startsWith("/");
  const slashFiltered = slashInput
    ? COMMANDS.filter(c => c.cmd.startsWith(input) || input === "/" || c.cmd.includes(input))
    : [];
  const slashClamped = Math.max(0, Math.min(slashIdx, slashFiltered.length - 1));
  slashRef.current = { filtered: slashFiltered, clamped: slashClamped };

  useInput((_, key) => {
    if (key.escape) process.exit(0);
    if (!slashInput || !slashFiltered.length) return;
    if (key.upArrow) setSlashIdx((slashClamped - 1 + slashFiltered.length) % slashFiltered.length);
    if (key.downArrow || key.tab) setSlashIdx((slashClamped + 1) % slashFiltered.length);
  });

  return (
    <Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1}>
      <Box flexDirection="column" flexShrink={0}>
        {LOGO_LINES.map((line, i) => (
          <Text key={i} color="cyanBright">{line}</Text>
        ))}
        <Box marginTop={1}>
          <Text color="magenta" dimColor>Self-Evolving AI · Terminal Agent · Ink</Text>
        </Box>
        <Text color="gray">{"─".repeat(cols - 4)}</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {msgs.map((m, i) => (
          <Msg key={i} role={m.role} content={m.content} />
        ))}
        {streaming ? <Streaming content={streaming} /> : null}
        {thinking && !streaming ? (
          <Box paddingLeft={3}>
            <Text color="cyan"><Spinner type="dots" /> 思考中...</Text>
          </Box>
        ) : null}
        <ToolLog tools={tools} />
      </Box>

      {slashInput && slashFiltered.length > 0 && (
        <Box flexDirection="column" paddingLeft={2} marginBottom={0}>
          {slashFiltered.map((c, i) => {
            const sel = i === slashClamped;
            return (
              <Box key={c.cmd} paddingLeft={1}>
                <Text color={sel ? "cyan" : "gray"}>{sel ? "▸ " : "  "}</Text>
                <Text color={sel ? "cyanBright" : undefined} bold={sel}>{c.cmd}</Text>
                <Text color="gray">{" · " + c.desc}</Text>
              </Box>
            );
          })}
          <Box paddingLeft={1}>
            <Text color="gray">  ↑↓ 切换 · 回车 选取</Text>
          </Box>
        </Box>
      )}

      <Box flexDirection="column" flexShrink={0}>
        <Text color="gray">{"─".repeat(cols - 4)}</Text>
        <Box paddingX={1}>
          <Text dimColor>
            <Text color="cyan">(ΦωΦ)</Text> {CONFIG.llm.model}
            {" │ "}
            <Text color="magenta">msg</Text> {msgs.length}
            {" │ "}
            <Text color={ctxPct > 80 ? "yellow" : ctxPct > 90 ? "red" : "green"}>ctx</Text> {ctxPct}%
            {" │ "}
            F1帮助 · Esc退出
          </Text>
        </Box>

        <Box paddingY={1}>
          <Box borderStyle="round" borderColor="cyan" paddingX={1} width={cols - 4}>
            <Text color="greenBright" bold>("・ω・)ﾉ  </Text>
            <TextInput
              value={input}
              onChange={v => { setInput(v); setSlashIdx(0); }}
              onSubmit={handleSubmit}
              placeholder={thinking ? "思考中，请稍候..." : "输入你的问题，或按 / 查看命令…"}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

const { waitUntilExit } = render(<App />);
