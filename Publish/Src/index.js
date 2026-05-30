const fs = require("fs");
const path = require("path");
const readline = require("readline");
const Agent = require("./agent");
const Tools = require("../Tools");

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  bgCyan: "\x1b[46m",
  bgBlue: "\x1b[44m",
};

const SPINNER = ["|", "/", "-", "\\"];

let config;
let agent;
let rl;
let pendingPermission = null;
let permissionResolve = null;

function loadConfig() {
  const configPath = path.join(__dirname, "..", "config.json");
  const raw = fs.readFileSync(configPath, "utf-8");
  config = JSON.parse(raw);
}

function saveConfig() {
  const configPath = path.join(__dirname, "..", "config.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

function termWidth() {
  return process.stdout.columns || 80;
}

function divider(char) {
  const ch = char || (config.ui?.dividerChar || "-");
  return C.dim + ch.repeat(termWidth()) + C.reset;
}

function wrapLine(text, maxWidth) {
  if (!text) return "";
  const w = maxWidth || termWidth() - 4;
  if (text.length <= w) return text;
  const lines = [];
  let cur = "";
  for (const ch of text) {
    if (cur.length >= w) { lines.push(cur); cur = ""; }
    cur += ch;
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}

function showLogo() {
  if (config.ui?.showLogo && config.ui?.logoPath) {
    const logoPath = path.resolve(__dirname, "..", config.ui.logoPath);
    if (fs.existsSync(logoPath)) {
      process.stdout.write(C.cyan + fs.readFileSync(logoPath, "utf-8") + C.reset);
    }
  }
}

function wordWrap(text, width, indent) {
  const ind = indent || 0;
  const w = width - ind;
  if (w <= 0) return text;
  const pad = " ".repeat(ind);
  const lines = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) { lines.push(""); continue; }
    let cur = "";
    for (const ch of para) {
      cur += ch;
      if (cur.replace(/\x1b\[[0-9;]*m/g, "").length >= w) {
        lines.push(pad + cur);
        cur = "";
      }
    }
    if (cur) lines.push(pad + cur);
  }
  return lines.join("\n");
}

function typeset(text) {
  const w = Math.max(40, termWidth() - 2);
  const lines = text.split("\n");
  const out = [];
  let inCode = false;
  let codeLang = "";
  let codeLines = [];
  let codeMinIndent = Infinity;
  let inTable = false;
  let tableRows = [];
  let tableAlign = [];

  function flushCode() {
    if (codeLines.length === 0) return;
    const width = w - 2;
    out.push(C.dim + "  ┌" + "─".repeat(Math.min(width, 40)) + C.reset);
    for (const cl of codeLines) {
      const trimmed = cl.slice(codeMinIndent).replace(/\t/g, "  ");
      out.push("  " + C.green + trimmed + C.reset);
    }
    out.push(C.dim + "  └" + "─".repeat(Math.min(width, 40)) + C.reset);
    codeLines = [];
    codeMinIndent = Infinity;
  }

  function flushTable() {
    if (tableRows.length === 0) return;
    const ncols = tableRows[0].length;
    const colW = new Array(ncols).fill(0);
    for (const row of tableRows) {
      for (let i = 0; i < row.length; i++) {
        colW[i] = Math.max(colW[i], row[i].replace(/\x1b\[[0-9;]*m/g, "").length);
      }
    }
    const totalW = colW.reduce((a, b) => a + b, 0) + ncols * 3 + 1;
    const maxW = w - 2;
    if (totalW > maxW) {
      const scale = maxW / totalW;
      for (let i = 0; i < colW.length; i++) colW[i] = Math.max(3, Math.floor(colW[i] * scale));
    }
    const sep = "  ├" + colW.map((cw) => "─".repeat(cw + 2)).join("┼") + "┤";
    out.push(C.dim + "  ┌" + colW.map((cw) => "─".repeat(cw + 2)).join("┬") + "┐" + C.reset);
    for (let ri = 0; ri < tableRows.length; ri++) {
      const row = tableRows[ri];
      const cells = row.map((c, ci) => {
        const plain = c.replace(/\x1b\[[0-9;]*m/g, "");
        const pw = plain.length;
        const pad = colW[ci] - pw;
        const align = tableAlign[ci] || "left";
        if (align === "right") return " ".repeat(pad) + c;
        if (align === "center") return " ".repeat(Math.floor(pad / 2)) + c + " ".repeat(Math.ceil(pad / 2));
        return c + " ".repeat(pad);
      });
      const cellStyle = ri === 0 ? C.bold : C.reset;
      out.push(`  ${C.dim}│${C.reset} ${cellStyle}${cells.join(` ${C.dim}│${C.reset} `)}${C.reset} ${C.dim}│${C.reset}`);
      if (ri === 0) out.push(C.dim + sep + C.reset);
    }
    out.push(C.dim + "  └" + colW.map((cw) => "─".repeat(cw + 2)).join("┴") + "┘" + C.reset);
    tableRows = [];
    tableAlign = [];
  }

  function isTableRow(line) {
    return /^\|[\s\S]+\|$/.test(line.trim());
  }
  function isTableSep(line) {
    return /^\|[\s\-:|]+\|$/.test(line.trim());
  }

  for (const raw of lines) {
    if (raw.trim().startsWith("```")) {
      if (inCode) { flushCode(); inCode = false; codeLang = ""; }
      else { inCode = true; codeLang = raw.trim().slice(3).trim(); flushTable(); }
      continue;
    }
    if (inCode) {
      const stripped = raw.replace(/\t/g, "  ");
      const indent = stripped.match(/^ */)[0].length;
      if (stripped.trim()) codeMinIndent = Math.min(codeMinIndent, indent);
      codeLines.push(stripped);
      continue;
    }
    if (isTableSep(raw) && tableRows.length === 1) {
      const cells = raw.split("|").filter((c) => c.trim() !== "").map((c) => c.trim());
      tableAlign = cells.map((c) => {
        if (c.startsWith(":") && c.endsWith(":")) return "center";
        if (c.endsWith(":")) return "right";
        return "left";
      });
      continue;
    }
    if (isTableRow(raw)) {
      if (!inTable) { flushCode(); inTable = true; }
      tableRows.push(raw.split("|").filter((c, i, a) => i > 0 && i < a.length - 1 || (i === 0 && c.trim()) || (i === a.length - 1 && c.trim())).map((c) => c.trim()));
      continue;
    }
    if (inTable && tableRows.length > 0) { flushTable(); inTable = false; }

    let line = raw;
    if (/^#{1,6}\s/.test(line)) {
      const level = line.match(/^(#+)/)[1].length;
      const title = line.replace(/^#+\s*/, "");
      const pfx = level <= 2 ? "▎" : level <= 4 ? "▹" : "▸";
      out.push("");
      out.push(C.bold + C.cyan + ` ${pfx} ${title}` + C.reset);
      out.push(C.dim + " " + "─".repeat(Math.min(w - 4, title.replace(/\x1b\[[0-9;]*m/g, "").length + 4)) + C.reset);
      continue;
    }
    if (/^\s*[-*]\s/.test(line)) {
      out.push("  " + C.yellow + "•" + C.reset + " " + wordWrap(line.replace(/^\s*[-*]\s*/, ""), w - 4, 0));
      continue;
    }
    if (/^\s*\d+[.)]\s/.test(line)) {
      const num = line.match(/^\s*(\d+)[.)]/)[1];
      out.push("  " + C.yellow + num + "." + C.reset + " " + wordWrap(line.replace(/^\s*\d+[.)]\s*/, ""), w - 5, 0));
      continue;
    }
    if (/^>\s/.test(line)) {
      out.push(C.dim + "  │ " + C.reset + C.dim + wordWrap(line.replace(/^>\s*/, ""), w - 5, 0) + C.reset);
      continue;
    }
    if (/^[-\*]{3,}\s*$/.test(line.trim())) {
      out.push(C.dim + "  " + "─".repeat(Math.min(w - 4, 30)) + C.reset);
      continue;
    }
    line = line.replace(/\*\*\*(.+?)\*\*\*/g, C.bold + C.cyan + "$1" + C.reset);
    line = line.replace(/\*\*(.+?)\*\*/g, C.bold + "$1" + C.reset);
    line = line.replace(/\*(.+?)\*/g, C.dim + "$1" + C.reset);
    line = line.replace(/~~(.+?)~~/g, C.dim + "̶$1̶" + C.reset);
    line = line.replace(/`([^`]+)`/g, C.green + "$1" + C.reset);
    line = line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, C.blue + "$1" + C.reset + C.dim + " <$2>" + C.reset);
    if (!line.trim()) {
      flushCode();
      out.push("");
      continue;
    }
    out.push("  " + wordWrap(line, w - 2, 0));
  }
  flushCode();
  flushTable();
  return out.join("\n");
}

function showHelp() {
  const w = termWidth();
  console.log(divider());
  console.log(C.bold + C.cyan + "  Clinn 控制台命令" + C.reset);
  console.log(divider());
  const cmds = [
    ["/help", "显示此帮助"],
    ["/exit", "退出程序"],
    ["/reset", "重置当前对话"],
    ["/tools", "列出所有已注册工具"],
    ["/tool_reg <code>", "注册新工具(AI编写的代码)"],
    ["/tool_del <name>", "删除指定工具"],
    ["/tool_search <q>", "搜索工具"],
    ["/temp <0-2>", "设置温度"],
    ["/token <n>", "设置最大输出token"],
    ["/max_history <n>", "设置对话历史上限"],
    ["/ctx_length <n>", "设置上下文长度"],
    ["/memory", "查看记忆统计"],
    ["/memory_list [n]", "列出记忆条目"],
    ["/memory_search <q>", "搜索记忆"],
    ["/memory_del <id>", "删除记忆条目"],
    ["/memory_clear", "清空所有记忆"],
    ["/compress", "手动压缩上下文"],
    ["/tool_save <name>", "AI编写的工具持久化保存"],
    ["/tool_list_saved", "列出所有持久化工具"],
    ["/tool_del_saved <name>", "删除持久化工具"],
    ["/trusted", "查看受信任工具"],
    ["/trust <name>", "永久信任某工具"],
    ["/untrust <name>", "取消信任某工具"],
    ["/status", "查看当前状态"],
  ];
  for (const [cmd, desc] of cmds) {
    console.log(`  ${C.yellow + cmd.padEnd(22) + C.reset} ${desc}`);
  }
  console.log(divider());
}

function showStatus() {
  const usage = agent ? agent.getUsage() : { prompt: 0, completion: 0 };
  const mem = agent ? agent.memory.stats() : {};
  console.log(divider());
  console.log(`${C.bold}模型:${C.reset} ${config.llm.model}`);
  console.log(`${C.bold}温度:${C.reset} ${config.llm.temperature}  ${C.bold}MaxTokens:${C.reset} ${config.llm.maxTokens}`);
  console.log(`${C.bold}Token:${C.reset} ${C.blue}v${usage.prompt}${C.reset} / ${C.magenta}^${usage.completion}${C.reset}`);
  console.log(`${C.bold}记忆:${C.reset} ${mem.entries || 0}/${mem.maxEntries || config.memory.maxEntries} 条目, 历史 ${mem.historyMessages || 0} 条`);
  const tools = Tools.listToolNames();
  console.log(`${C.bold}工具:${C.reset} ${tools.length} 个 — ${tools.join(", ")}`);
  console.log(divider());
}

function startSpinner(text) {
  let i = 0;
  const interval = setInterval(() => {
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`  ${C.cyan}${SPINNER[i % SPINNER.length]}${C.reset} ${text}`);
    i++;
  }, 120);
  return {
    stop: (final) => {
      clearInterval(interval);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(" ".repeat(termWidth()) + "\r");
      if (final) console.log(final);
    },
  };
}

function inputValidator(line) {
  const sanitized = line.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  if (sanitized.length > 10000) return sanitized.slice(0, 10000);
  if (/[\u0340-\u036f\u0483-\u0489]{3,}/.test(sanitized)) {
    return sanitized.replace(/[\u0340-\u036f\u0483-\u0489]+/g, "");
  }
  return sanitized;
}

async function askPermission(name, args) {
  const w = termWidth();
  return new Promise((resolve) => {
    console.log("");
    console.log(divider("="));
    console.log(`${C.yellow}[!] 工具权限请求${C.reset}`);
    console.log(`  ${C.bold}工具:${C.reset} ${C.cyan}${name}${C.reset}`);
    console.log(`  ${C.bold}参数:${C.reset} ${C.dim}${JSON.stringify(args).slice(0, 200)}${C.reset}`);
    console.log(divider("="));
    console.log(`  ${C.green}[Y]${C.reset} 本次放行  ${C.blue}[A]${C.reset} 永久放行  ${C.red}[N]${C.reset} 拒绝  `);
    process.stdout.write("  > ");

    permissionResolve = (answer) => {
      resolve(answer);
    };
  });
}

function handlePermissionResponse(line) {
  if (!permissionResolve) return false;
  const l = line.trim().toLowerCase();
  if (l === "y" || l === "yes") {
    permissionResolve("once");
    permissionResolve = null;
    return true;
  }
  if (l === "a" || l === "always") {
    permissionResolve("always");
    permissionResolve = null;
    return true;
  }
  if (l === "n" || l === "no") {
    permissionResolve("deny");
    permissionResolve = null;
    return true;
  }
  return false;
}

async function onPermission(name, args) {
  const result = await askPermission(name, args);
  if (result === "always") {
    Tools.addTrusted(name);
    const trusted = [...new Set([...(config.tools?.trustedTools || []), name])];
    config.tools.trustedTools = trusted;
    saveConfig();
    console.log(`  ${C.green}(o.o)b 已永久信任 ${name}${C.reset}\n`);
    return true;
  }
  if (result === "once") {
    console.log(`  ${C.green}(^.^) 本次放行${C.reset}\n`);
    return true;
  }
  console.log(`  ${C.red}(x.x) 已拒绝${C.reset}\n`);
  return false;
}

async function onSelfInvoke(task, context) {
  console.log(`\n${C.magenta}[子Agent调用]${C.reset} ${task.slice(0, 100)}`);
  const childAgent = new Agent(config, {});
  const prompt = context ? `上下文: ${context}\n任务: ${task}` : task;
  try {
    const result = await childAgent.run(prompt);
    return result;
  } catch (e) {
    return `[子Agent错误] ${e.message}`;
  }
}

function onToolCall(name, args, round) {
  console.log(`\n${C.gray}[第${round}轮]${C.reset} ${C.yellow}-> ${name}${C.reset} ${C.dim}${JSON.stringify(args).slice(0, 150)}${C.reset}`);
}

function onToolResult(name, preview) {
  if (preview) {
    console.log(`  ${C.green}<- ${name}${C.reset}: ${C.dim}${preview.slice(0, 150)}${C.reset}`);
  }
}

function buildAgent() {
  agent = new Agent(config, {
    onPermission,
    onSelfInvoke,
    onToolCall,
    onToolResult,
    onAutoCompress: (count) => {
      console.log(`\n${C.magenta}[自动压缩 #${count}]${C.reset} 上下文超限已自动压缩, 摘要存入记忆`);
    },
    onTimer: (seconds, message) => {
      setTimeout(() => {
        console.log(`\n${C.magenta}[定时通知 | ${seconds}秒]${C.reset} ${message}`);
        console.log(divider());
        if (agent) {
          agent.run(`[系统定时通知 | ${seconds}秒前设置] ${message}`).then((resp) => {
            console.log(`${C.cyan}Clinn${C.reset}:`);
            process.stdout.write(typeset(resp));
            const u = agent.getUsage();
            console.log(C.dim + `[v${u.prompt} / ^${u.completion}]` + C.reset);
            console.log(divider());
            rl.prompt();
          }).catch((e) => {
            console.log(`${C.red}(x.x) 定时任务错误: ${e.message}${C.reset}`);
            rl.prompt();
          });
        }
      }, seconds * 1000);
    },
  });
}

async function handleSlashCommand(input) {
  const parts = input.slice(1).trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const rest = parts.slice(1).join(" ");

  switch (cmd) {
    case "help":
      showHelp();
      break;

    case "exit":
      console.log(C.dim + "再见~ (._.)/" + C.reset);
      process.exit(0);

    case "reset":
      agent.reset();
      console.log(`${C.green}对话已重置 (^-^)${C.reset}`);
      break;

    case "tools": {
      const names = Tools.listToolNames();
      console.log(divider());
      for (const n of names) {
        const t = Tools.getTool(n);
        const mark = t?.dangerous ? C.yellow + "[!]" + C.reset : "   ";
        console.log(`  ${mark} ${C.cyan}${n}${C.reset} — ${C.dim}${t?.description || ""}${C.reset}`);
      }
      console.log(divider());
      console.log(`  共 ${names.length} 个工具, ${C.yellow}[!]${C.reset} 标记需要权限`);
      break;
    }

    case "tool_reg": {
      if (!rest) { console.log(`${C.red}用法: /tool_reg <js代码字符串>${C.reset}`); break; }
      try {
        const fn = new Function("Tools", "const { registerTool } = Tools; " + rest);
        fn(Tools);
        agent.refreshTools();
        console.log(`${C.green}(^.^)b 工具已注册并刷新${C.reset}`);
      } catch (e) {
        console.log(`${C.red}(x.x) 注册失败: ${e.message}${C.reset}`);
      }
      break;
    }

    case "tool_del": {
      if (!rest) { console.log(`${C.red}用法: /tool_del <工具名>${C.reset}`); break; }
      const t = Tools.getTool(rest);
      if (!t) { console.log(`${C.yellow}工具不存在: ${rest}${C.reset}`); break; }
      Tools.unregisterTool(rest);
      agent.refreshTools();
      console.log(`${C.green}已删除工具: ${rest}${C.reset}`);
      break;
    }

    case "tool_search": {
      if (!rest) { console.log(`${C.red}用法: /tool_search <关键词>${C.reset}`); break; }
      const results = Tools.searchToolRegistry(rest);
      if (results.length === 0) { console.log(`无匹配: ${rest}`); break; }
      console.log(divider());
      for (const r of results) {
        console.log(`  ${C.cyan}${r.name}${C.reset} — ${C.dim}${r.description}${C.reset}`);
      }
      console.log(divider());
      break;
    }

    case "temp": {
      const v = parseFloat(rest);
      if (isNaN(v) || v < 0 || v > 2) { console.log(`${C.red}温度范围 0-2, 例: /temp 0.8${C.reset}`); break; }
      config.llm.temperature = v;
      saveConfig();
      buildAgent();
      console.log(`${C.green}温度已设为 ${v}${C.reset}`);
      break;
    }

    case "token": {
      const v = parseInt(rest, 10);
      if (isNaN(v) || v < 1 || v > 128000) { console.log(`${C.red}范围 1-128000, 例: /token 8192${C.reset}`); break; }
      config.llm.maxTokens = v;
      saveConfig();
      buildAgent();
      console.log(`${C.green}MaxTokens 已设为 ${v}${C.reset}`);
      break;
    }

    case "max_history": {
      const v = parseInt(rest, 10);
      if (isNaN(v) || v < 1 || v > 200) { console.log(`${C.red}范围 1-200, 例: /max_history 20${C.reset}`); break; }
      config.memory.maxHistory = v;
      saveConfig();
      agent.memory.setMaxHistory(v);
      console.log(`${C.green}历史上限已设为 ${v}${C.reset}`);
      break;
    }

    case "ctx_length": {
      const v = parseInt(rest, 10);
      if (isNaN(v) || v < 1 || v > 128000) { console.log(`${C.red}范围 1-128000${C.reset}`); break; }
      config.llm.maxTokens = v;
      saveConfig();
      buildAgent();
      console.log(`${C.green}上下文长度已设为 ${v}${C.reset}`);
      break;
    }

    case "memory": {
      const s = agent.memory.stats();
      console.log(divider());
      console.log(`  条目: ${s.entries}/${s.maxEntries}  |  历史消息: ${s.historyMessages}`);
      console.log(divider());
      break;
    }

    case "memory_list": {
      const n = parseInt(rest, 10) || 20;
      const entries = agent.memory.getAllEntries().slice(-n);
      if (entries.length === 0) { console.log("(无记忆条目)"); break; }
      console.log(divider());
      for (const e of entries) {
        console.log(`  ${C.yellow}#${e.id}${C.reset} ${C.dim}[${e.tags?.join(",") || "-"}]${C.reset} ${e.text}`);
      }
      console.log(divider());
      break;
    }

    case "memory_search": {
      if (!rest) { console.log(`${C.red}用法: /memory_search <关键词>${C.reset}`); break; }
      const results = agent.memory.searchEntries(rest, 10);
      if (results.length === 0) { console.log(`无匹配: ${rest}`); break; }
      console.log(divider());
      for (const e of results) {
        console.log(`  ${C.yellow}#${e.id}${C.reset} ${e.text}`);
      }
      console.log(divider());
      break;
    }

    case "memory_del": {
      const id = parseInt(rest, 10);
      if (isNaN(id)) { console.log(`${C.red}用法: /memory_del <id>${C.reset}`); break; }
      const ok = agent.memory.removeEntry(id);
      console.log(ok ? `${C.green}已删除 #${id}${C.reset}` : `${C.yellow}未找到 #${id}${C.reset}`);
      break;
    }

    case "memory_clear":
      agent.memory.clearEntries();
      console.log(`${C.green}所有记忆条目已清空${C.reset}`);
      break;

    case "compress": {
      console.log(`${C.yellow}正在压缩上下文...${C.reset}`);
      const result = await agent._handleAgentTool("compress_context", {});
      console.log(C.green + result + C.reset);
      break;
    }

    case "trusted": {
      const names = [...new Set(config.tools?.trustedTools || [])];
      console.log(divider());
      if (names.length === 0) console.log("  (无受信任工具)");
      else names.forEach((n) => console.log(`  ${C.green}[trust]${C.reset} ${n}`));
      console.log(divider());
      break;
    }

    case "trust": {
      if (!rest) { console.log(`${C.red}用法: /trust <工具名>${C.reset}`); break; }
      Tools.addTrusted(rest);
      const trusted = [...new Set([...(config.tools?.trustedTools || []), rest])];
      config.tools.trustedTools = trusted;
      saveConfig();
      console.log(`${C.green}已永久信任: ${rest}${C.reset}`);
      break;
    }

    case "untrust": {
      if (!rest) { console.log(`${C.red}用法: /untrust <工具名>${C.reset}`); break; }
      Tools.removeTrusted(rest);
      config.tools.trustedTools = (config.tools?.trustedTools || []).filter((n) => n !== rest);
      saveConfig();
      console.log(`${C.yellow}已取消信任: ${rest}${C.reset}`);
      break;
    }

    case "tool_save": {
      if (!rest) { console.log(`${C.red}用法: /tool_save <工具名> <JS代码>${C.reset}`); break; }
      const spaceIdx = rest.indexOf(" ");
      if (spaceIdx < 0) { console.log(`${C.red}用法: /tool_save <工具名> <JS代码>${C.reset}`); break; }
      const toolName = rest.slice(0, spaceIdx);
      const code = rest.slice(spaceIdx + 1);
      const result = Tools.saveToolToFile(toolName, code);
      if (result.startsWith("[OK]")) agent.refreshTools();
      const color = result.startsWith("[OK]") ? C.green : C.yellow;
      console.log(color + result + C.reset);
      break;
    }

    case "tool_list_saved": {
      const saved = Tools.listCustomTools();
      if (saved.length === 0) { console.log("(无持久化工具)"); break; }
      console.log(divider());
      for (const s of saved) {
        console.log(`  ${C.cyan}${s.file}${C.reset}  导出: ${s.exports.join(", ")}`);
      }
      console.log(divider());
      break;
    }

    case "tool_del_saved": {
      if (!rest) { console.log(`${C.red}用法: /tool_del_saved <工具名>${C.reset}`); break; }
      const result = Tools.deleteToolFile(rest);
      if (result.startsWith("[OK]")) agent.refreshTools();
      const color = result.startsWith("[OK]") ? C.green : C.yellow;
      console.log(color + result + C.reset);
      break;
    }

    case "status":
      showStatus();
      break;

    default:
      console.log(`${C.yellow}未知命令: /${cmd}${C.reset}  输入 ${C.cyan}/help${C.reset} 查看所有命令`);
  }
}

async function handleInput(line) {
  const input = inputValidator(line.trim());
  if (!input) return;

  if (permissionResolve) {
    handlePermissionResponse(input);
    return;
  }

  if (input.startsWith("/")) {
    await handleSlashCommand(input);
    return;
  }

  console.log(divider());
  const usage = agent.getUsage();

  let si = 0;
  const spinnerInterval = setInterval(() => {
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`${C.cyan}${SPINNER[si % 4]}${C.reset} Clinn 思考中...`);
    si++;
  }, 150);

  try {
    const response = await agent.run(input);
    clearInterval(spinnerInterval);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(" ".repeat(termWidth()) + "\r");

    const newUsage = agent.getUsage();
    const diffPrompt = newUsage.prompt - usage.prompt;
    const diffCompletion = newUsage.completion - usage.completion;

    console.log(`${C.cyan}Clinn${C.reset}:`);
    process.stdout.write(typeset(response));
    console.log(C.dim + `[v${diffPrompt} / ^${diffCompletion}]` + C.reset);
    console.log(divider());
  } catch (e) {
    clearInterval(spinnerInterval);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(" ".repeat(termWidth()) + "\r");
    console.log(`${C.red}(x.x) 错误: ${e.message}${C.reset}`);
    console.log(divider());
  }
}

async function main() {
  loadConfig();
  showLogo();
  buildAgent();

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  let currentLine = "";
  let showedMenu = false;

  process.stdin.on("keypress", (str, key) => {
    if (key && key.name === "backspace") {
      currentLine = currentLine.slice(0, -1);
    } else if (key && key.name === "return") {
      currentLine = "";
      showedMenu = false;
    } else if (str && str.length === 1 && !key.ctrl && !key.meta) {
      currentLine += str;
    }

    if (currentLine === "/" && !showedMenu) {
      showedMenu = true;
      const w = termWidth();
      const menu = [
        `${C.cyan}help${C.reset} 帮助`, `${C.cyan}exit${C.reset} 退出`, `${C.cyan}reset${C.reset} 重置`,
        `${C.cyan}tools${C.reset} 工具列表`, `${C.cyan}status${C.reset} 状态`,
        `${C.cyan}temp N${C.reset} 温度`, `${C.cyan}token N${C.reset} Token上限`,
        `${C.cyan}compress${C.reset} 压缩上下文`, `${C.cyan}memory${C.reset} 记忆`,
        `${C.cyan}tool_save${C.reset} 持久化工具`, `${C.cyan}tool_del${C.reset} 删除工具`,
      ];
      process.stdout.write("\n" + C.dim + menu.join(" | ") + C.reset + "\n");
      process.stdout.write(`${C.green}> ${C.reset}/${currentLine.slice(1)}`);
    }
  });

  console.log(`\n  ${C.bold + C.cyan}${config.agent.name}${C.reset} v${config.agent.version}  ${C.dim}DeepSeek驱动${C.reset}`);
  console.log(`  ${C.dim}输入 ${C.yellow}/help${C.dim} 查看命令  |  输入 ${C.yellow}/${C.dim} 弹出命令菜单${C.reset}`);
  console.log(divider("="));

  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${C.green}> ${C.reset}`,
  });

  rl.prompt();

  rl.on("line", async (line) => {
    await handleInput(line);
    if (!permissionResolve) rl.prompt();
  });

  rl.on("close", () => {
    console.log(C.dim + "\n(._.)/ 再见~" + C.reset);
    process.exit(0);
  });

  process.on("SIGINT", () => {
    if (permissionResolve) {
      permissionResolve("deny");
      permissionResolve = null;
      rl.prompt();
      return;
    }
    rl.close();
  });
}

main().catch((e) => {
  console.error(C.red + "启动失败: " + e.message + C.reset);
  process.exit(1);
});
