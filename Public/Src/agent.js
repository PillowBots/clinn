const os = require("os");
const LLMClient = require("./llm");
const Tools = require("../Tools");
const { ConversationMemory } = require("../Mem");

const MAX_ITERATIONS = 25;
const MAX_TOOL_RESULT_CHARS = 3000;

function buildSystemInfo() {
  const home = os.homedir();
  const cwd = process.cwd();
  return [
    `系统: ${os.type()} ${os.release()} (${os.arch()})`,
    `主机: ${os.hostname()}`,
    `用户主目录: ${home}`,
    `当前工作目录: ${cwd}`,
    `终端宽度: ${process.stdout.columns || 80} 列`,
    `Node: ${process.version}`,
    `时间: ${new Date().toISOString()}`,
  ].join(" | ");
}

function estimateTokens(text) {
  let chars = 0;
  let cjk = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code > 127) cjk++;
    chars++;
  }
  return Math.ceil(cjk * 1.5 + (chars - cjk) * 0.35);
}

function estimateMessagesTokens(messages) {
  let total = 0;
  for (const m of messages) {
    total += estimateTokens(m.role) + estimateTokens(m.content || "");
  }
  return total;
}

class Agent {
  constructor(config, callbacks = {}) {
    this.config = config;
    this.llm = new LLMClient(config.llm);
    this.memory = new ConversationMemory(config.memory);
    this.callbacks = callbacks;
    this.maxIterations = MAX_ITERATIONS;
    this.systemInfo = buildSystemInfo();
    this.systemPrompt = `${config.systemPrompt}\n\n[系统环境]\n${this.systemInfo}`;
    this.autoCompressThreshold = config.memory?.autoCompressThreshold || 5000;
    this.maxContextTokens = (config.llm?.maxTokens || 65536) * 0.75;
    this._lastToolCalls = [];

    Tools.setTrusted(config.tools?.trustedTools || []);
    Tools.setPermissionCallback(async (name, args) => {
      if (callbacks.onPermission) return callbacks.onPermission(name, args);
      return false;
    });

    this._injectAgentTools();
    this.toolDeclarations = Tools.toFunctionDeclarations();
  }

  _injectAgentTools() {
    const self = this;
    const memTools = [
      "search_memory", "save_memory", "list_memory", "delete_memory",
      "compress_context", "agent_self_invoke", "set_timer",
      "save_tool", "delete_tool_file", "list_saved_tools",
      "forget_conversation", "restart_session",
    ];
    for (const name of memTools) {
      const tool = Tools.getTool(name);
      if (!tool) continue;
      tool.execute = (args) => self._handleAgentTool(name, args);
    }
  }

  async _handleAgentTool(name, args) {
    switch (name) {
      case "search_memory":
        return this._fmtEntries(this.memory.searchEntries(args.query, args.limit || 5));
      case "save_memory": {
        const tags = args.tags ? args.tags.split(",").map((t) => t.trim()) : [];
        const entry = this.memory.addEntry(args.content, tags);
        return entry ? `[OK] 已保存 #${entry.id}: ${entry.text}` : "[失败] 内容为空";
      }
      case "list_memory": {
        const all = this.memory.getAllEntries().slice(-(args.limit || 20));
        return this._fmtEntries(all);
      }
      case "delete_memory": {
        const ok = this.memory.removeEntry(args.id);
        return ok ? `[OK] 已删除 #${args.id}` : `[不存在] #${args.id}`;
      }
      case "compress_context": {
        const compressed = this.memory.compressHistory();
        if (!compressed) return "[跳过] 对话太短";
        const summary = await this._summarize(compressed);
        this.memory.addEntry(summary, ["auto-summary"]);
        this.memory.clear();
        return `[OK] 上下文已压缩, 摘要存入记忆: ${summary}`;
      }
      case "agent_self_invoke": {
        if (this.callbacks.onSelfInvoke) return this.callbacks.onSelfInvoke(args.task, args.context);
        return "[跳过] self_invoke 未配置回调";
      }
      case "set_timer": {
        const s = Math.max(1, Math.min(args.seconds || 5, 300));
        const msg = args.message || "定时器";
        if (this.callbacks.onTimer) this.callbacks.onTimer(s, msg);
        return `[OK] 定时器已设置 ${s}秒后通知: ${msg}`;
      }
      case "save_tool": {
        const code = args.code || "";
        const toolName = args.name || "";
        if (!toolName) return "[失败] 必须提供 name 参数";
        if (!code) return "[失败] 必须提供 code 参数";
        const result = Tools.saveToolToFile(toolName, code);
        if (result.startsWith("[OK]")) this.refreshTools();
        return result;
      }
      case "delete_tool_file": {
        const toolName = args.name || "";
        if (!toolName) return "[失败] 必须提供 name 参数";
        const result = Tools.deleteToolFile(toolName);
        if (result.startsWith("[OK]")) this.refreshTools();
        return result;
      }
      case "list_saved_tools": {
        const saved = Tools.listCustomTools();
        if (saved.length === 0) return "(无持久化工具)";
        return saved.map((s) => `[${s.file}] 导出: ${s.exports.join(", ")}`).join("\n");
      }
      case "forget_conversation": {
        const keepSummary = args.keepSummary !== false;
        let summary = "";
        if (keepSummary && this.memory.getHistory().length > 2) {
          const compressed = this.memory.compressHistory();
          if (compressed) summary = await this._summarize(compressed);
        }
        this.memory.clear();
        if (summary) { this.memory.addEntry(summary, ["auto-summary"]); }
        return summary
          ? `[OK] 对话已遗忘, 摘要已保存: ${summary}`
          : "[OK] 对话历史已清空, 像全新对话一样";
      }
      case "restart_session": {
        this.memory.clear();
        this.memory.clearEntries();
        this.llm.resetUsage();
        return "[OK] 会话已完全重启: 历史+记忆+token计数均已重置. 可以开始全新任务.";
      }
      default:
        return `[未知内部工具] ${name}`;
    }
  }

  async _summarize(text) {
    try {
      const msgs = [
        { role: "system", content: "将以下对话压缩为一条200字以内的中文摘要,只输出摘要。" },
        { role: "user", content: text.slice(0, 4000) },
      ];
      const res = await this.llm.chat(msgs);
      return (res.choices?.[0]?.message?.content || text.slice(0, 190)).slice(0, 190);
    } catch (_) {
      return text.slice(0, 190);
    }
  }

  _fmtEntries(entries) {
    if (!entries || entries.length === 0) return "(无记忆条目)";
    return entries.map((e) => `#${e.id} [${e.tags?.join(",") || "-"}] ${e.text}`).join("\n");
  }

  refreshTools() {
    this.toolDeclarations = Tools.toFunctionDeclarations();
  }

  async _autoCompress(messages) {
    const est = estimateMessagesTokens(messages);
    if (est < this.maxContextTokens) return false;
    if (this.memory.getHistory().length < 6) return false;

    const compressed = this.memory.compressHistory();
    if (!compressed) return false;

    const summary = await this._summarize(compressed);
    this.memory.addEntry(summary, ["auto-summary"]);
    this.memory.clear();
    return true;
  }

  _detectLoop(toolCalls) {
    if (this._lastToolCalls.length < 2) {
      this._lastToolCalls.push(toolCalls.map((t) => t.function.name).join(","));
      return false;
    }
    const sig = toolCalls.map((t) => t.function.name).join(",");
    const lastTwo = this._lastToolCalls.slice(-2);
    if (lastTwo[0] === sig && lastTwo[1] === sig) {
      return true;
    }
    if (this._lastToolCalls.length > 5) this._lastToolCalls.shift();
    this._lastToolCalls.push(sig);
    return false;
  }

  async run(userMessage, opts = {}) {
    const { onContent, onToolCall, onToolResult, onThinking } = opts;
    this.memory.addUser(userMessage);
    let messages = this._buildMessages();
    let finalResponse = "";
    let autoCompressCount = 0;
    this._lastToolCalls = [];

    const activeTools = Tools.filterToolDeclarations(userMessage);

    for (let i = 0; i < this.maxIterations; i++) {
      if (autoCompressCount < 3 && estimateMessagesTokens(messages) > this.maxContextTokens * 0.8) {
        const compressed = await this._autoCompress(messages);
        if (compressed) {
          autoCompressCount++;
          messages = this._buildMessages();
          if (this.callbacks.onAutoCompress) this.callbacks.onAutoCompress(autoCompressCount);
        }
      }

      if (onThinking) onThinking();

      const result = await this.llm.chatStream(messages, onContent || null, activeTools);

      if (result.toolCalls && result.toolCalls.length > 0) {
        if (this._detectLoop(result.toolCalls)) {
          finalResponse = "(检测到工具调用循环, 已自动终止)";
          break;
        }

        const toolMsgs = [];
        for (const tc of result.toolCalls) {
          const fnName = tc.function.name;
          let fnArgs = {};
          try { fnArgs = JSON.parse(tc.function.arguments); } catch (_) {}

          if (onToolCall) onToolCall(fnName, fnArgs, i + 1);

          const tool = Tools.getTool(fnName);
          if (tool?.dangerous) {
            const allowed = await Tools.checkPermission(fnName, fnArgs);
            if (!allowed) {
              if (onToolResult) onToolResult(fnName, "[被拒绝]");
              toolMsgs.push({ role: "tool", tool_call_id: tc.id, name: fnName, content: "[被用户拒绝]" });
              continue;
            }
          }

          let toolResult;
          try { toolResult = await Tools.executeTool(fnName, fnArgs); }
          catch (e) { toolResult = `error: ${e.message}`; }

          const capped = String(toolResult).slice(0, MAX_TOOL_RESULT_CHARS);
          if (onToolResult) onToolResult(fnName, capped.slice(0, 300));
          toolMsgs.push({ role: "tool", tool_call_id: tc.id, name: fnName, content: capped });
        }

        messages.push({
          role: "assistant",
          content: null,
          tool_calls: result.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.function.name, arguments: tc.function.arguments },
          })),
        });
        messages.push(...toolMsgs);
        continue;
      }

      if (result.content) { finalResponse = result.content; break; }
      finalResponse = "(empty)"; break;
    }

    this.memory.addAssistant(finalResponse);

    if (opts._noAutoSave) return finalResponse;

    setImmediate(async () => {
      try {
        const habitEntry = this.memory.searchEntries("habit", 3);
        if (habitEntry.length === 0) {
          const msgs = [
            { role: "system", content: "用户刚完成一个任务。请生成一条15字以内的用户偏好摘要(用save_memory保存, tags='habit')。只输出纯文本,不要任何格式。" },
            { role: "user", content: `任务: ${userMessage.slice(0, 300)}\n结果摘要: ${finalResponse.slice(0, 200)}` },
          ];
          const res = await this.llm.chat(msgs);
          const habit = res.choices?.[0]?.message?.content?.trim().slice(0, 100);
          if (habit) this.memory.addEntry(habit, ["habit"]);
        }
      } catch (_) {}
    });

    return finalResponse;
  }

  _buildMessages() {
    return [
      { role: "system", content: this.systemPrompt },
      ...this.memory.getHistory(),
    ];
  }

  _emit(event, ...args) {
    if (this.callbacks[event]) this.callbacks[event](...args);
  }

  getUsage() { return this.llm.getUsage(); }
  reset() { this.memory.clear(); this.llm.resetUsage(); }

  estimateContextPct() {
    const msgs = this._buildMessages();
    const est = estimateMessagesTokens(msgs);
    return Math.min(100, Math.ceil((est / this.maxContextTokens) * 100));
  }

  getMaxContextTokens() { return this.maxContextTokens; }
}

module.exports = Agent;
