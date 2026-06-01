/**
 * Trae IDE + Claude Hermes 风格扩展工具集
 * 参考 Trae: TodoWrite / SearchCodebase / Glob / Grep / Read / WebSearch / WebFetch
 *            SearchReplace / Write / DeleteFile / RunCommand / CheckCommandStatus
 *            GetDiagnostics / OpenPreview / Skill
 * 参考 Hermes: 同上 + 对话管理 / 技能调用
 */
const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");
const https = require("https");
const http = require("http");

const todoWriteTool = {
  name: "todo_write",
  description: "创建和更新结构化任务列表, 追踪当前会话中所有任务进度. 每次变更都传完整列表",
  parameters: {
    todos: { type: "string", required: true, description: "JSON字符串, 格式: [{\"id\":\"1\",\"content\":\"任务描述\",\"status\":\"pending|in_progress|completed\",\"priority\":\"high|medium|low\"}], 最多10项" },
  },
  execute: async ({ todos }) => {
    try {
      const list = JSON.parse(todos);
      if (!Array.isArray(list)) return "[失败] todos 必须是数组";
      if (list.length > 10) return `[警告] 最多10项, 收到${list.length}项`;
      const counts = { pending: 0, in_progress: 0, completed: 0 };
      const lines = [];
      for (const t of list) {
        counts[t.status] = (counts[t.status] || 0) + 1;
        const icon = t.status === "completed" ? "✓" : t.status === "in_progress" ? "▶" : "○";
        lines.push(`  ${icon} [${t.id}] ${t.content}`);
      }
      return `[Todo | ${list.length}项 | ▶${counts.in_progress} ○${counts.pending} ✓${counts.completed}]\n${lines.join("\n")}`;
    } catch (e) {
      return `[失败] JSON解析错误: ${e.message}`;
    }
  },
};

const searchReplaceTool = {
  name: "search_replace",
  description: "搜索并替换文件内容(精确匹配). 比edit_lines更安全: 必须唯一匹配才能替换",
  dangerous: true,
  parameters: {
    filePath: { type: "string", required: true, description: "要编辑的文件路径" },
    oldStr: { type: "string", required: true, description: "要替换的原始文本块(必须与文件中完全一致)" },
    newStr: { type: "string", required: true, description: "替换后的新文本块" },
  },
  execute: async ({ filePath, oldStr, newStr }) => {
    if (!fs.existsSync(filePath)) return `[不存在] ${filePath}`;
    const content = fs.readFileSync(filePath, "utf-8");
    const idx = content.indexOf(oldStr);
    if (idx === -1) return `[失败] 未找到匹配文本, 请用 read_file 确认文件内容`;
    const secondIdx = content.indexOf(oldStr, idx + 1);
    if (secondIdx !== -1) return `[失败] 匹配到多处(至少2处), 请提供更精确的上下文使其唯一`;
    const newContent = content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
    fs.writeFileSync(filePath, newContent, "utf-8");
    const oldLines = oldStr.split("\n").length;
    const newLines = newStr.split("\n").length;
    return `[OK] 已替换 ${filePath}: ${oldLines}行 → ${newLines}行`;
  },
};

const globTool = {
  name: "glob",
  description: "文件模式匹配: 支持 **/*.js / src/**/*.ts 等glob模式, 按修改时间排序",
  parameters: {
    pattern: { type: "string", required: true, description: "glob模式, 如 '**/*.js' 或 'src/**/*.test.ts'" },
    dirPath: { type: "string", required: false, description: "搜索根目录, 默认当前目录" },
  },
  execute: async ({ pattern, dirPath }) => {
    const root = dirPath || process.cwd();
    if (!fs.existsSync(root)) return `[不存在] ${root}`;
    try {
      const cmd = `Get-ChildItem -Path "${root}" -Filter "${pattern.split("/").pop()}" -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch 'node_modules|\\\\\.git\\\\' } | Select-Object -First 100 | ForEach-Object { $_.FullName }`;
      const output = execSync(cmd, { cwd: root, encoding: "utf-8", timeout: 8000, maxBuffer: 1024 * 1024, shell: "powershell.exe" });
      const files = output.trim().split("\r\n").filter(Boolean);
      return files.length > 0 ? files.join("\n") : `[无匹配] ${pattern} 在 ${root}`;
    } catch (e) {
      return `[无匹配] ${pattern} 在 ${root}`;
    }
  },
};

const grepTool = {
  name: "grep",
  description: "正则搜索文件内容(ripgrep风格). 返回 文件路径:行号:内容",
  parameters: {
    pattern: { type: "string", required: true, description: "正则表达式" },
    dirPath: { type: "string", required: false, description: "搜索目录, 默认当前目录" },
    glob: { type: "string", required: false, description: "文件过滤glob, 如 '*.js'" },
    headLimit: { type: "number", required: false, description: "结果上限, 默认50" },
    ignoreCase: { type: "boolean", required: false, description: "忽略大小写, 默认true" },
  },
  execute: async ({ pattern, dirPath, glob, headLimit, ignoreCase }) => {
    const root = dirPath || process.cwd();
    if (!fs.existsSync(root)) return `[不存在] ${root}`;
    const max = headLimit || 50;
    const ic = ignoreCase !== false;
    const globFilter = glob ? ` --include="${glob}"` : "";
    const icFlag = ic ? " -i" : "";
    try {
      const cmd = `grep -rn${icFlag}${globFilter} -m ${max} "${pattern.replace(/"/g, '\\"')}" "${root}"`;
      const output = execSync(cmd, { cwd: root, encoding: "utf-8", timeout: 15000, maxBuffer: 2 * 1024 * 1024 });
      const lines = output.trim().split("\n").slice(0, max);
      return lines.length > 0 ? lines.join("\n") : `[无匹配] "${pattern}" 在 ${root}`;
    } catch (e) {
      if (e.stdout) return e.stdout.trim().split("\n").slice(0, max).join("\n");
      return `[无匹配] "${pattern}" 在 ${root}`;
    }
  },
};

const readTool = {
  name: "read",
  description: "读取文件内容(支持行范围). 比read_file更灵活: 可指定offset+limit",
  parameters: {
    filePath: { type: "string", required: true, description: "文件绝对路径" },
    offset: { type: "number", required: false, description: "起始行号(1开始), 默认1" },
    limit: { type: "number", required: false, description: "读取行数, 默认200" },
  },
  execute: async ({ filePath, offset, limit }) => {
    if (!fs.existsSync(filePath)) return `[不存在] ${filePath}`;
    const lines = fs.readFileSync(filePath, "utf-8").split("\n");
    const s = (offset || 1) - 1;
    const e = Math.min(lines.length, s + (limit || 200));
    if (s >= lines.length) return `[越界] 行${offset || 1}, 文件共 ${lines.length} 行`;
    return lines.slice(s, e).map((l, i) => `${s + i + 1}| ${l}`).join("\n") + (e < lines.length ? `\n(共${lines.length}行, 显示${s + 1}-${e})` : "");
  },
};

const writeTool = {
  name: "write",
  description: "写入文件(创建或覆盖, 自动建父目录). 内容中 \\n 表示换行",
  dangerous: true,
  parameters: {
    filePath: { type: "string", required: true, description: "文件绝对路径" },
    content: { type: "string", required: true, description: "写入内容" },
  },
  execute: async ({ filePath, content }) => {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, "utf-8");
    return `[OK] 已写入 ${filePath} (${content.length} 字符, ${content.split("\n").length} 行)`;
  },
};

const lsTool = {
  name: "ls",
  description: "列出目录内容, 按类型分组显示",
  parameters: {
    dirPath: { type: "string", required: false, description: "目录路径, 默认当前目录" },
    ignore: { type: "string", required: false, description: "忽略的glob模式, JSON数组字符串, 如 '[\"node_modules\",\".git\"]'" },
  },
  execute: async ({ dirPath, ignore }) => {
    const root = dirPath || process.cwd();
    if (!fs.existsSync(root)) return `[不存在] ${root}`;
    const ignoreList = ignore ? JSON.parse(ignore) : [];
    const entries = fs.readdirSync(root, { withFileTypes: true })
      .filter((e) => !ignoreList.some((p) => e.name.includes(p) || e.name === p));
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => `[DIR]  ${e.name}/`);
    const files = entries.filter((e) => e.isFile()).map((e) => {
      try { return `[FILE] ${e.name} (${fs.statSync(path.join(root, e.name)).size}B)`; }
      catch (_) { return `[FILE] ${e.name}`; }
    });
    return `${root}\n${dirs.concat(files).join("\n") || "(空目录)"}`;
  },
};

const treeTool = {
  name: "tree",
  description: "递归生成目录文件树(一次性看完整个项目结构, 不用逐目录 ls). 自动忽略 node_modules/.git 等",
  parameters: {
    dirPath: { type: "string", required: false, description: "根目录路径, 默认当前目录" },
    maxDepth: { type: "number", required: false, description: "最大递归深度, 默认5, 最大8" },
    ignore: { type: "string", required: false, description: "额外忽略的glob模式, JSON数组字符串, 如 '[\"dist\",\"*.log\"]'" },
  },
  execute: async ({ dirPath, maxDepth, ignore }) => {
    const root = dirPath || process.cwd();
    if (!fs.existsSync(root)) return `[不存在] ${root}`;
    const maxD = Math.min(maxDepth || 5, 8);
    const extraIgnore = ignore ? JSON.parse(ignore) : [];
    const defaultIgnore = ["node_modules", ".git", ".svn", "__pycache__", ".DS_Store", "Thumbs.db", ".idea", ".vscode"];
    const ignoreSet = new Set([...defaultIgnore, ...extraIgnore]);

    function shouldIgnore(name) {
      return ignoreSet.has(name) || extraIgnore.some((p) => {
        if (p.includes("*")) {
          const re = new RegExp("^" + p.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
          return re.test(name);
        }
        return false;
      });
    }

    function walk(dir, depth, prefix) {
      if (depth > maxD) return "";
      let result = "";
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
          .filter((e) => !shouldIgnore(e.name));
      } catch (_) {
        return prefix + "(无权限)\n";
      }
      const dirs = entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
      const files = entries.filter((e) => e.isFile()).sort((a, b) => a.name.localeCompare(b.name));
      const all = [...dirs, ...files];
      for (let i = 0; i < all.length; i++) {
        const entry = all[i];
        const isLast = i === all.length - 1;
        const connector = isLast ? "└── " : "├── ";
        const childPrefix = prefix + (isLast ? "    " : "│   ");
        if (entry.isDirectory()) {
          result += prefix + connector + entry.name + "/\n";
          result += walk(path.join(dir, entry.name), depth + 1, childPrefix);
        } else {
          let size = "";
          try { size = ` (${fs.statSync(path.join(dir, entry.name)).size}B)`; } catch (_) {}
          result += prefix + connector + entry.name + size + "\n";
        }
      }
      return result;
    }

    const rootName = path.basename(root) || root;
    let output = rootName + "/\n";
    output += walk(root, 1, "");
    const lineCount = output.split("\n").filter(Boolean).length;
    return output.trimEnd() + `\n\n${lineCount} 项 (深度≤${maxD})`;
  },
};

const webSearchTool = {
  name: "web_search",
  description: "用Bing搜索互联网获取实时信息. 用于查文档/新闻/最新资料. 自动回退浏览器",
  parameters: {
    query: { type: "string", required: true, description: "搜索关键词" },
    num: { type: "number", required: false, description: "结果数量, 默认5, 最多10" },
  },
  execute: async ({ query, num }) => {
    const n = Math.min(num || 5, 10);

    const bingSearch = async () => {
      const bingUrl = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&count=${n}`;
      return new Promise((resolve) => {
        const mod = bingUrl.startsWith("https") ? https : http;
        const req = mod.get(bingUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36" },
        }, (res) => {
          if (res.statusCode !== 200) { resolve(null); return; }
          let d = "";
          res.on("data", (c) => (d += c));
          res.on("end", () => {
            const lis = d.match(/<li class="b_algo"[^>]*>([\s\S]*?)<\/li>/g) || [];
            const results = [];
            for (let i = 0; i < Math.min(n, lis.length); i++) {
              const titleM = lis[i].match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
              if (!titleM) continue;
              const title = titleM[2].replace(/<[^>]+>/g, "").trim().slice(0, 120);
              const urlFound = titleM[1];
              const descM = lis[i].match(/<p[^>]*>([\s\S]*?)<\/p>/);
              const desc = descM ? descM[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&ensp;|&#0183;|&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) : "";
              results.push(`${i + 1}. ${title}${desc ? "\n   " + desc : ""}${urlFound ? "\n   " + urlFound : ""}`);
            }
            resolve(results.length > 0 ? `[Bing搜索: ${query}]\n${results.join("\n")}` : null);
          });
        });
        req.on("error", () => resolve(null));
        req.setTimeout(12000, () => { req.destroy(); resolve(null); });
      });
    };

    const browserSearch = async () => {
      try {
        const { browse_page: bp } = require("./browser");
        const raw = await bp.execute({
          url: `https://cn.bing.com/search?q=${encodeURIComponent(query)}&count=${n}`,
          waitMs: 1500,
          extractLinks: false,
        });
        const lines = raw.split("\n").map(l => l.trim()).filter(l => l.length > 20);
        const results = [];
        for (const line of lines) {
          if (results.length >= n) break;
          if (line.includes("[浏览器") || line.includes("[HTTP")) continue;
          results.push(`${results.length + 1}. ${line.slice(0, 200)}`);
        }
        if (results.length > 0) return `[浏览器搜索: ${query}]\n${results.join("\n")}`;
      } catch (_) {}
      return null;
    };

    const bingResult = await bingSearch();
    if (bingResult) return bingResult;

    const browserResult = await browserSearch();
    if (browserResult) return browserResult;

    return `[搜索: ${query}] 未获取到有效结果, 建议用 browse_page 直接搜索`;
  },
};

const checkStatusTool = {
  name: "check_command_status",
  description: "检查之前启动的非阻塞命令的状态. 用于 dev server / watch 等长时间运行的命令",
  parameters: {
    commandId: { type: "string", required: false, description: "命令ID(exec_console返回的PID或标识)" },
  },
  execute: async ({ commandId }) => {
    return `[提示] 当前无活跃后台命令. 如需检查进程: 用 exec_console 执行 tasklist / Get-Process 查询.`;
  },
};

const openPreviewTool = {
  name: "open_preview",
  description: "尝试在浏览器中打开URL预览(如本地开发服务器)",
  parameters: {
    url: { type: "string", required: true, description: "预览URL, 如 http://localhost:3000" },
  },
  execute: async ({ url }) => {
    try {
      execSync(`start "${url}"`, { shell: true, timeout: 3000 });
      return `[OK] 已在浏览器中打开 ${url}`;
    } catch (_) {
      return `[未打开] 无法启动浏览器, 请手动访问: ${url}`;
    }
  },
};

const getDiagnosticsTool = {
  name: "get_diagnostics",
  description: "获取当前项目的语言诊断信息(语法错误/类型错误等). 调用后自动运行 lint check",
  parameters: {},
  execute: async () => {
    const cwd = process.cwd();
    const results = [];
    try {
      const out = execSync("npx tsc --noEmit 2>&1 || echo ''", { cwd, encoding: "utf-8", timeout: 30000, maxBuffer: 512 * 1024 });
      const errors = out.trim().split("\n").filter((l) => l.includes("error TS"));
      if (errors.length > 0) results.push(`[TypeScript] ${errors.length} 个错误`);
      results.push(...errors.slice(0, 20));
    } catch (_) {}
    try {
      const out = execSync("npx eslint . --format compact 2>&1 || echo ''", { cwd, encoding: "utf-8", timeout: 30000, maxBuffer: 512 * 1024 });
      const warns = out.trim().split("\n").filter((l) => l.includes("warning") || l.includes("error"));
      if (warns.length > 0) results.push(`[ESLint] ${warns.length} 个问题`);
      results.push(...warns.slice(0, 10));
    } catch (_) {}
    return results.length > 0 ? results.join("\n") : "[无诊断] 未发现 lint/类型错误, 或项目无 tsc/eslint 配置";
  },
};

const skillTool = {
  name: "skill",
  description: "执行一个技能模块: 从 Skills/ 目录加载预定义的技能脚本. 技能是一组预置指令",
  parameters: {
    name: { type: "string", required: true, description: "技能名, 如 'code_review' / 'refactor' / 'test_gen'" },
  },
  execute: async ({ name }) => {
    const skillDir = path.join(process.cwd(), "Skills");
    if (!fs.existsSync(skillDir)) return `[无技能目录] ${skillDir} 不存在, 请创建 Skills/ 目录并放入 .js 脚本`;
    const skillPath = path.join(skillDir, name + ".js");
    if (!fs.existsSync(skillPath)) {
      const available = fs.readdirSync(skillDir).filter((f) => f.endsWith(".js")).map((f) => f.replace(".js", ""));
      return `[无此技能] ${name}\n可用技能: ${available.length > 0 ? available.join(", ") : "(空)"}`;
    }
    try {
      const mod = require(skillPath);
      return `[技能: ${name}]\n${mod.description || "(无描述)"}\n指令: ${mod.instructions || "(无指令)"}`;
    } catch (e) {
      return `[技能加载失败] ${e.message}`;
    }
  },
};

const forgetConversationTool = {
  name: "forget_conversation",
  description: "主动遗忘当前对话历史(清空上下文), 保留记忆条目. 上下文过长时主动调用以节省token",
  parameters: {
    keepSummary: { type: "boolean", required: false, description: "是否先自动生成摘要并保存到记忆, 默认true" },
  },
  execute: () => { return "forget_conversation must be injected"; },
};

const restartSessionTool = {
  name: "restart_session",
  description: "完全重置对话: 清空历史 + 清空记忆, 开始全新会话. 相当于重启对话",
  parameters: {},
  execute: () => { return "restart_session must be injected"; },
};

module.exports = {
  todo_write: todoWriteTool,
  search_replace: searchReplaceTool,
  glob: globTool,
  grep: grepTool,
  read: readTool,
  write: writeTool,
  ls: lsTool,
  tree: treeTool,
  web_search: webSearchTool,
  check_command_status: checkStatusTool,
  open_preview: openPreviewTool,
  get_diagnostics: getDiagnosticsTool,
  skill: skillTool,
  forget_conversation: forgetConversationTool,
  restart_session: restartSessionTool,
};
