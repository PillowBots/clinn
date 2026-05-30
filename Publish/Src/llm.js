const https = require("https");

class LLMClient {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL;
    this.model = config.model;
    this.maxTokens = config.maxTokens;
    this.temperature = config.temperature;
    this.topP = config.topP;
    this.totalPromptTokens = 0;
    this.totalCompletionTokens = 0;
  }

  getUsage() {
    return {
      prompt: this.totalPromptTokens,
      completion: this.totalCompletionTokens,
    };
  }

  resetUsage() {
    this.totalPromptTokens = 0;
    this.totalCompletionTokens = 0;
  }

  async chat(messages, tools = null) {
    const body = {
      model: this.model,
      messages,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      top_p: this.topP,
      stream: false,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const result = await this._request("/chat/completions", JSON.stringify(body));
    this._accumulateUsage(result.usage);
    return result;
  }

  async chatStream(messages, onChunk, tools = null) {
    const body = {
      model: this.model,
      messages,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      top_p: this.topP,
      stream: true,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const result = await this._requestStream("/chat/completions", JSON.stringify(body), onChunk);
    if (result.usage) {
      this._accumulateUsage(result.usage);
    }
    return result;
  }

  _accumulateUsage(usage) {
    if (!usage) return;
    if (usage.prompt_tokens) this.totalPromptTokens += usage.prompt_tokens;
    if (usage.completion_tokens) this.totalCompletionTokens += usage.completion_tokens;
  }

  _request(path, body) {
    const url = new URL(path, this.baseURL);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.error) {
              reject(new Error(json.error.message));
            } else {
              resolve(json);
            }
          } catch (e) {
            reject(new Error(`parse error: ${data.slice(0, 200)}`));
          }
        });
      });

      req.on("error", reject);
      req.write(body);
      req.end();
    });
  }

  _requestStream(path, body, onChunk) {
    const url = new URL(path, this.baseURL);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let buffer = "";
        let toolCallBuffer = null;
        let totalContent = "";

        res.on("data", (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const jsonStr = trimmed.slice(6);
            if (jsonStr === "[DONE]") continue;
            try {
              const json = JSON.parse(jsonStr);

              if (json.usage) {
                this._pendingUsage = json.usage;
              }

              const delta = json.choices?.[0]?.delta;

              if (delta?.content) {
                totalContent += delta.content;
                if (onChunk) onChunk(delta.content);
              }

              if (delta?.tool_calls) {
                if (!toolCallBuffer) toolCallBuffer = [];
                for (const tc of delta.tool_calls) {
                  const idx = tc.index || 0;
                  if (!toolCallBuffer[idx]) {
                    toolCallBuffer[idx] = {
                      id: tc.id || "",
                      type: "function",
                      function: { name: "", arguments: "" },
                    };
                  }
                  if (tc.id) toolCallBuffer[idx].id = tc.id;
                  if (tc.function?.name) toolCallBuffer[idx].function.name += tc.function.name;
                  if (tc.function?.arguments) toolCallBuffer[idx].function.arguments += tc.function.arguments;
                }
              }
            } catch (_) {}
          }
        });

        res.on("end", () => {
          const result = {
            toolCalls: toolCallBuffer || null,
            content: totalContent || null,
            usage: this._pendingUsage || null,
          };
          this._pendingUsage = null;
          resolve(result);
        });
      });

      req.on("error", reject);
      req.write(body);
      req.end();
    });
  }
}

module.exports = LLMClient;
