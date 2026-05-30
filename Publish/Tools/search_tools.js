const { execSync, spawn } = require("child_process");
const https = require("https");
const http = require("http");

const execConsoleTool = {
  name: "exec_console",
  description: "执行终端命令并返回结果. 始终返回: exit code + stdout + stderr + 耗时",
  dangerous: true,
  parameters: {
    command: { type: "string", required: true, description: "要执行的命令" },
    cwd: { type: "string", required: false, description: "工作目录, 默认当前目录" },
    timeout: { type: "number", required: false, description: "超时毫秒, 默认30000" },
  },
  execute: async ({ command, cwd, timeout }) => {
    const cwdPath = cwd || process.cwd();
    const start = Date.now();
    try {
      const output = execSync(command, {
        cwd: cwdPath,
        encoding: "utf-8",
        timeout: timeout || 30000,
        maxBuffer: 2 * 1024 * 1024,
      });
      const ms = Date.now() - start;
      const out = output || "(无输出)";
      return `[exit 0 | ${ms}ms | ${cwdPath}]\n${out.slice(0, 3500)}`;
    } catch (e) {
      const ms = Date.now() - start;
      const code = e.status != null ? e.status : "?";
      const stderr = (e.stderr || e.message || "").slice(0, 1500);
      const stdout = (e.stdout || "").slice(0, 1000);
      let result = `[exit ${code} | ${ms}ms | ${cwdPath}]\n`;
      if (stderr) result += `[stderr]\n${stderr}\n`;
      if (stdout) result += `[stdout]\n${stdout}`;
      if (!stderr && !stdout) result += `执行失败: ${e.message}`;
      return result.slice(0, 3500);
    }
  },
};

const waitCommandTool = {
  name: "wait_command",
  description: "执行长时间命令并返回结果. 返回: exit code + stdout + stderr + 耗时",
  dangerous: true,
  parameters: {
    command: { type: "string", required: true, description: "要执行的命令" },
    args: { type: "string", required: false, description: "命令参数(空格分隔), 可选" },
    cwd: { type: "string", required: false, description: "工作目录" },
    timeout: { type: "number", required: false, description: "超时毫秒, 默认60000" },
  },
  execute: async ({ command, args, cwd, timeout }) => {
    const cwdPath = cwd || process.cwd();
    const start = Date.now();
    return new Promise((resolve) => {
      const argList = args ? args.split(/\s+/) : [];
      const child = spawn(command, argList, {
        cwd: cwdPath,
        shell: true,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        const ms = Date.now() - start;
        resolve(`[timeout ${timeout || 60000}ms | ${ms}ms | ${cwdPath}]\n${stdout.slice(0, 1500)}${stderr ? "\n[stderr]\n" + stderr.slice(0, 500) : ""}`);
      }, timeout || 60000);
      child.on("close", (code) => {
        clearTimeout(timer);
        const ms = Date.now() - start;
        let result = `[exit ${code} | ${ms}ms | ${cwdPath}]\n`;
        if (stdout) result += stdout;
        if (stderr) result += `\n[stderr]\n${stderr}`;
        resolve(result.slice(0, 3500));
      });
      child.on("error", (e) => {
        clearTimeout(timer);
        const ms = Date.now() - start;
        resolve(`[error | ${ms}ms | ${cwdPath}] ${e.message}`);
      });
    });
  },
};

const webFetchTool = {
  name: "web_fetch",
  description: "虚拟浏览器: 获取URL的网页内容并提取文本结构. 注意: 始终返回HTTP状态码, 非200不可用",
  parameters: {
    url: { type: "string", required: true, description: "要抓取的URL" },
    extractMode: { type: "string", required: false, description: "text/structure/links, 默认text" },
  },
  execute: async ({ url, extractMode }) => {
    return new Promise((resolve) => {
      const mod = url.startsWith("https") ? https : http;
      const start = Date.now();
      const req = mod.get(url, { headers: { "User-Agent": "Mozilla/5.0 ClinnBot/1.0" } }, (res) => {
        const sc = res.statusCode;
        const ms = Date.now() - start;

        if (sc >= 300 && sc < 400 && res.headers.location) {
          resolve(`[HTTP ${sc} 重定向 | ${ms}ms] -> ${res.headers.location}`);
          return;
        }
        if (sc === 404) { resolve(`[HTTP 404 Not Found | ${ms}ms] 页面不存在, 地址错误或已被删除`); return; }
        if (sc === 403) { resolve(`[HTTP 403 Forbidden | ${ms}ms] 禁止访问, 可能需要登录`); return; }
        if (sc >= 500) { resolve(`[HTTP ${sc} Server Error | ${ms}ms] 服务器错误`); return; }
        if (sc !== 200) { resolve(`[HTTP ${sc} | ${ms}ms] 非预期状态码`); return; }

        let data = "";
        res.on("data", (c) => (data += c.toString()));
        res.on("end", () => {
          const mode = extractMode || "text";
          const prefix = `[HTTP 200 OK | ${ms}ms]\n`;
          if (mode === "links") {
            const links = data.match(/href=["']([^"']+)["']/gi) || [];
            const urls = links.map((l) => l.replace(/href=["']/i, "").replace(/["']$/, "")).filter((u) => u.length > 1);
            resolve(prefix + `[${urls.length} 个链接]\n${urls.slice(0, 100).join("\n")}`);
          } else if (mode === "structure") {
            const title = (data.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || "(无标题)";
            const h1s = (data.match(/<h1[^>]*>([^<]+)<\/h1>/gi) || []).map((h) => h.replace(/<\/?h1[^>]*>/gi, "").trim());
            const h2s = (data.match(/<h2[^>]*>([^<]+)<\/h2>/gi) || []).map((h) => h.replace(/<\/?h2[^>]*>/gi, "").trim());
            const codeBlocks = (data.match(/<code[^>]*>([\s\S]*?)<\/code>/gi) || []).length;
            resolve(prefix + `标题: ${title}\n--- h1 ---\n${h1s.join("\n")}\n--- h2 ---\n${h2s.join("\n")}\n代码块: ${codeBlocks} 个`);
          } else {
            let text = data
              .replace(/<script[\s\S]*?<\/script>/gi, "")
              .replace(/<style[\s\S]*?<\/style>/gi, "")
              .replace(/<[^>]+>/g, " ")
              .replace(/&nbsp;/g, " ")
              .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
              .replace(/\s+/g, " ").trim();
            resolve(prefix + text.slice(0, 3000));
          }
        });
      });
      req.on("error", (e) => resolve(`[抓取失败 | ${Date.now() - start}ms] ${e.message}`));
      req.setTimeout(15000, () => { req.destroy(); resolve("[超时 15s]"); });
    });
  },
};

const setTimerTool = {
  name: "set_timer",
  description: "设置定时器: 在指定秒数后通知AI. AI调用后可以继续其他工作, 时间到达时会收到通知. 用于轮询等待异步任务完成",
  parameters: {
    seconds: { type: "number", required: true, description: "延迟秒数, 范围1-300" },
    message: { type: "string", required: false, description: "定时触发时的提示语, 如 '检查构建结果'" },
  },
  execute: async ({ seconds, message }) => {
    const s = Math.max(1, Math.min(seconds || 5, 300));
    return `[timer set | ${s}s] ${message || "定时器已设置"}`;
  },
};

const searchMemoryTool = {
  name: "search_memory",
  description: "搜索本地记忆条目(关键词匹配)",
  parameters: {
    query: { type: "string", required: true, description: "搜索关键词" },
    limit: { type: "number", required: false, description: "返回条数, 默认5" },
  },
  execute: () => { return "search_memory must be injected"; },
};

const saveMemoryTool = {
  name: "save_memory",
  description: "保存一条关键信息到记忆(每条不超过200字)",
  parameters: {
    content: { type: "string", required: true, description: "记忆内容" },
    tags: { type: "string", required: false, description: "标签,逗号分隔" },
  },
  execute: () => { return "save_memory must be injected"; },
};

const listMemoryTool = {
  name: "list_memory",
  description: "列出所有记忆条目",
  parameters: {
    limit: { type: "number", required: false, description: "返回条数, 默认20" },
  },
  execute: () => { return "list_memory must be injected"; },
};

const deleteMemoryTool = {
  name: "delete_memory",
  description: "按ID删除一条记忆",
  parameters: {
    id: { type: "number", required: true, description: "记忆ID" },
  },
  execute: () => { return "delete_memory must be injected"; },
};

const compressContextTool = {
  name: "compress_context",
  description: "压缩当前上下文: 将历史对话摘要存入记忆并清空对话历史",
  parameters: {},
  execute: () => { return "compress_context must be injected"; },
};

const agentSelfInvokeTool = {
  name: "agent_self_invoke",
  description: "Agent自我递归调用: 将子任务交给另一个Clinn实例处理并返回结果",
  dangerous: true,
  parameters: {
    task: { type: "string", required: true, description: "要交给子Agent的任务描述" },
    context: { type: "string", required: false, description: "额外上下文" },
  },
  execute: () => { return "agent_self_invoke must be injected"; },
};

const saveToolTool = {
  name: "save_tool",
  description: "编写并持久化一个JS工具模块. 代码必须是完整的CommonJS模块, 导出工具对象. 下次启动自动加载. 模块格式: module.exports = { tool_a: { name, description, parameters, execute: async (args) => '...' }, tool_b: { ... } }",
  dangerous: true,
  parameters: {
    name: { type: "string", required: true, description: "工具文件名(不含.js), 如 'my_utils'" },
    code: { type: "string", required: true, description: "完整的JS模块代码, CommonJS格式, 导出工具对象" },
  },
  execute: () => { return "save_tool must be injected"; },
};

const deleteToolFileTool = {
  name: "delete_tool_file",
  description: "删除一个持久化工具文件并卸载其导出的所有工具",
  dangerous: true,
  parameters: {
    name: { type: "string", required: true, description: "工具文件名(不含.js), 如 'my_utils'" },
  },
  execute: () => { return "delete_tool_file must be injected"; },
};

const listSavedToolsTool = {
  name: "list_saved_tools",
  description: "列出所有持久化保存的工具文件及其导出的工具名",
  parameters: {},
  execute: () => { return "list_saved_tools must be injected"; },
};

module.exports = {
  exec_console: execConsoleTool,
  wait_command: waitCommandTool,
  web_fetch: webFetchTool,
  set_timer: setTimerTool,
  search_memory: searchMemoryTool,
  save_memory: saveMemoryTool,
  list_memory: listMemoryTool,
  delete_memory: deleteMemoryTool,
  compress_context: compressContextTool,
  agent_self_invoke: agentSelfInvokeTool,
  save_tool: saveToolTool,
  delete_tool_file: deleteToolFileTool,
  list_saved_tools: listSavedToolsTool,
};
