const fs = require("fs");
const path = require("path");

const MEM_DIR = path.join(__dirname, "..", "mem");

function ensureDir() {
  if (!fs.existsSync(MEM_DIR)) fs.mkdirSync(MEM_DIR, { recursive: true });
}

function todayFile() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return path.join(MEM_DIR, `history-${yyyy}-${mm}-${dd}.json`);
}

function loadFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw.trim()) return [];
    return JSON.parse(raw);
  } catch (_) {
    return [];
  }
}

function saveFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function saveTurn(userMessage, assistantResponse, cwd, allMessages) {
  ensureDir();
  const file = todayFile();
  const records = loadFile(file);
  records.push({
    id: Date.now(),
    time: new Date().toISOString(),
    cwd: cwd || process.cwd(),
    user: userMessage,
    assistant: assistantResponse,
    messages: allMessages || [],
  });
  saveFile(file, records);
}

function listHistoryFiles() {
  ensureDir();
  try {
    return fs.readdirSync(MEM_DIR)
      .filter((f) => f.startsWith("history-") && f.endsWith(".json"))
      .sort()
      .reverse();
  } catch (_) {
    return [];
  }
}

function listRecentTurns(limit = 20) {
  const files = listHistoryFiles();
  const turns = [];
  for (const file of files) {
    const records = loadFile(path.join(MEM_DIR, file));
    for (let i = records.length - 1; i >= 0; i--) {
      turns.push({ ...records[i], file });
      if (turns.length >= limit) return turns;
    }
  }
  return turns;
}

function searchHistory(query, limit = 10) {
  const files = listHistoryFiles();
  const results = [];
  const q = query.toLowerCase();
  for (const file of files) {
    if (results.length >= limit) break;
    const records = loadFile(path.join(MEM_DIR, file));
    for (let i = records.length - 1; i >= 0; i--) {
      const r = records[i];
      const userLower = (r.user || "").toLowerCase();
      const assistantLower = (r.assistant || "").toLowerCase();
      const msgLower = JSON.stringify(r.messages || []).toLowerCase();
      if (userLower.includes(q) || assistantLower.includes(q) || msgLower.includes(q)) {
        results.push({
          file,
          cwd: r.cwd || "",
          user: r.user.slice(0, 200),
          assistant: r.assistant.slice(0, 300),
          time: r.time,
        });
        if (results.length >= limit) break;
      }
    }
  }
  return results;
}

function getFileList() {
  const files = listHistoryFiles();
  return files.map((f) => {
    const filePath = path.join(MEM_DIR, f);
    const records = loadFile(filePath);
    const stat = fs.statSync(filePath);
    return {
      file: f,
      turns: records.length,
      size: Math.round(stat.size / 1024),
      created: stat.birthtime.toISOString(),
    };
  });
}

function loadFileTurns(fileName, limit = 50) {
  const filePath = path.join(MEM_DIR, fileName);
  const records = loadFile(filePath);
  return records.slice(-limit);
}

module.exports = {
  saveTurn,
  listRecentTurns,
  searchHistory,
  getFileList,
  loadFileTurns,
  listHistoryFiles,
  MEM_DIR,
};
