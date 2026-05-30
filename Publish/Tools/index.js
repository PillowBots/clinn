const fs = require("fs");
const path = require("path");
const fileTools = require("./file_tools");
const searchTools = require("./search_tools");
const editTools = require("./edit_tools");

let toolRegistry = {
  ...fileTools,
  ...searchTools,
  ...editTools,
};

let permissionCallback = null;
let trustedNames = new Set();
const CUSTOM_DIR = path.join(__dirname, "custom");

function loadCustomTools() {
  if (!fs.existsSync(CUSTOM_DIR)) return;
  const files = fs.readdirSync(CUSTOM_DIR).filter((f) => f.endsWith(".js"));
  for (const file of files) {
    try {
      const mod = require(path.join(CUSTOM_DIR, file));
      if (typeof mod === "object" && mod !== null) {
        Object.assign(toolRegistry, mod);
      }
    } catch (e) {
      // skip broken custom tools
    }
  }
}

loadCustomTools();

function saveToolToFile(name, code) {
  if (!fs.existsSync(CUSTOM_DIR)) fs.mkdirSync(CUSTOM_DIR, { recursive: true });
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) return `[失败] 工具名不合法: ${name}, 只允许字母数字下划线`;

  const sanitized = code.trim();
  if (!sanitized) return "[失败] 代码不能为空";
  if (sanitized.length > 50000) return "[失败] 代码过长, 最大50000字符";

  const filePath = path.join(CUSTOM_DIR, name + ".js");
  fs.writeFileSync(filePath, sanitized, "utf-8");

  try {
    delete require.cache[require.resolve(filePath)];
    const mod = require(filePath);
    if (typeof mod !== "object" || mod === null) {
      fs.unlinkSync(filePath);
      return `[失败] 模块必须导出对象, 如 module.exports = { tool_name: { name, description, parameters, execute } }`;
    }
    Object.assign(toolRegistry, mod);
  } catch (e) {
    fs.unlinkSync(filePath);
    return `[失败] 语法错误: ${e.message}`;
  }

  const keys = Object.keys(require(filePath));
  return `[OK] 工具已持久化: ${name}.js (导出: ${keys.join(", ")}) | 路径: ${filePath}`;
}

function deleteToolFile(name) {
  const filePath = path.join(CUSTOM_DIR, name + ".js");
  if (!fs.existsSync(filePath)) return `[不存在] ${name}.js`;
  if (!filePath.startsWith(CUSTOM_DIR)) return "[拒绝] 路径越界";

  const keys = Object.keys(require(filePath));
  fs.unlinkSync(filePath);
  delete require.cache[require.resolve(filePath)];

  for (const k of keys) {
    delete toolRegistry[k];
    trustedNames.delete(k);
  }

  return `[OK] 已删除持久化工具: ${name}.js (移除: ${keys.join(", ")})`;
}

function listCustomTools() {
  if (!fs.existsSync(CUSTOM_DIR)) return [];
  const files = fs.readdirSync(CUSTOM_DIR).filter((f) => f.endsWith(".js"));
  return files.map((f) => {
    const name = f.replace(/\.js$/, "");
    const p = path.join(CUSTOM_DIR, f);
    let keys = [];
    try { keys = Object.keys(require(p)); } catch (_) {}
    return { file: f, name, exports: keys };
  });
}

function setPermissionCallback(cb) { permissionCallback = cb; }
function setTrusted(names) { trustedNames = new Set(names); }
function addTrusted(name) { trustedNames.add(name); }
function removeTrusted(name) { trustedNames.delete(name); }
function loadTools() { return { ...toolRegistry }; }

function registerTool(name, tool) { toolRegistry[name] = tool; }

function unregisterTool(name) {
  const filePath = path.join(CUSTOM_DIR, name + ".js");
  if (fs.existsSync(filePath)) {
    return `[提示] ${name} 是持久化工具, 请用 /tool_del_saved ${name} 或 delete_tool_file 删除`;
  }
  delete toolRegistry[name];
  trustedNames.delete(name);
}

function searchToolRegistry(query) {
  const q = query.toLowerCase();
  return Object.entries(toolRegistry)
    .filter(([name, tool]) => {
      if (name.toLowerCase().includes(q)) return true;
      if (tool.description && tool.description.toLowerCase().includes(q)) return true;
      return false;
    })
    .map(([name, tool]) => ({ name, description: tool.description || "", parameters: tool.parameters || {} }));
}

function getTool(name) { return toolRegistry[name] || null; }

async function checkPermission(name, args) {
  if (trustedNames.has(name)) return true;
  if (permissionCallback) return permissionCallback(name, args);
  return false;
}

async function executeTool(name, args) {
  const tool = toolRegistry[name];
  if (!tool) throw new Error(`unknown tool: ${name}`);
  if (tool.dangerous) {
    const allowed = await checkPermission(name, args);
    if (!allowed) throw new Error(`permission denied: ${name}`);
  }
  return tool.execute(args);
}

function toFunctionDeclarations() {
  return Object.entries(toolRegistry).map(([key, tool]) => {
    const properties = {};
    const required = [];
    if (tool.parameters) {
      for (const [pn, pd] of Object.entries(tool.parameters)) {
        properties[pn] = { type: pd.type, description: pd.description };
        if (pd.required) required.push(pn);
      }
    }
    return {
      type: "function",
      function: {
        name: key,
        description: tool.description || "",
        parameters: { type: "object", properties, required },
      },
    };
  });
}

function listToolNames() { return Object.keys(toolRegistry); }

module.exports = {
  loadTools, getTool, executeTool, checkPermission, toFunctionDeclarations,
  registerTool, unregisterTool, searchToolRegistry, listToolNames,
  setPermissionCallback, setTrusted, addTrusted, removeTrusted,
  saveToolToFile, deleteToolFile, listCustomTools,
  CUSTOM_DIR,
};
