#!/usr/bin/env node
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 注册 tsx loader 处理 JSX
register("tsx/esm", pathToFileURL("./"));

// 直接 import 主程序（同进程，Ctrl+C 正常）
await import(pathToFileURL(path.join(__dirname, "..", "Src", "index.jsx")).href);
