class ConversationMemory {
  constructor(options = {}) {
    this.maxHistory = options.maxHistory || 30;
    this.maxEntries = options.maxEntries || 800;
    this.maxEntryChars = options.maxEntryChars || 200;
    this.history = [];
    this.entries = [];
    this._idCounter = 0;
  }

  addUser(content) {
    this.history.push({ role: "user", content });
    this._trimHistory();
  }

  addAssistant(content) {
    this.history.push({ role: "assistant", content });
    this._trimHistory();
  }

  getHistory() {
    return [...this.history];
  }

  _trimHistory() {
    while (this.history.length > this.maxHistory * 2) {
      this.history.shift();
    }
  }

  setMaxHistory(n) {
    this.maxHistory = Math.max(2, Math.min(n, 200));
  }

  addEntry(content, tags = []) {
    const text = String(content).slice(0, this.maxEntryChars);
    if (!text.trim()) return null;
    const entry = {
      id: ++this._idCounter,
      text,
      tags,
      createdAt: Date.now(),
    };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
    return entry;
  }

  searchEntries(query, limit = 5) {
    if (!query || !query.trim()) return this.entries.slice(-limit);
    const q = query.toLowerCase();
    const scored = this.entries.map((e) => {
      const lower = e.text.toLowerCase();
      let score = 0;
      if (lower === q) score = 100;
      else if (lower.includes(q)) score = 80;
      else {
        const words = q.split(/\s+/);
        for (const w of words) {
          if (w && lower.includes(w)) score += 20;
        }
      }
      const tagMatch = e.tags.some((t) => t.toLowerCase().includes(q));
      if (tagMatch) score += 30;
      return { entry: e, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.filter((s) => s.score > 0).slice(0, limit).map((s) => s.entry);
  }

  getAllEntries() {
    return [...this.entries];
  }

  getEntryCount() {
    return this.entries.length;
  }

  removeEntry(id) {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx !== -1) {
      this.entries.splice(idx, 1);
      return true;
    }
    return false;
  }

  clearEntries() {
    this.entries = [];
  }

  compressHistory(agentInstance) {
    if (this.history.length < 4) return null;
    const content = this.history.map((m) => `[${m.role}]: ${m.content}`).join("\n");
    return content;
  }

  clear() {
    this.history = [];
  }

  stats() {
    return {
      historyMessages: this.history.length,
      entries: this.entries.length,
      maxEntries: this.maxEntries,
    };
  }
}

module.exports = { ConversationMemory };
