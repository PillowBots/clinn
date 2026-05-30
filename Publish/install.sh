#!/bin/bash
set -e

CLINN_HOME="$HOME/.clinn"
BIN_DIR="$HOME/.local/bin"
BIN_FILE="$BIN_DIR/clinn"

RED='\033[31m'
GREEN='\033[32m'
CYAN='\033[36m'
BOLD='\033[1m'
RESET='\033[0m'

echo ""
echo -e "${CYAN}${BOLD}  Clinn 安装程序${RESET}"
echo -e "  ----------------------"
echo ""

if ! command -v node &>/dev/null; then
  echo -e "${RED}(x.x) 未找到 Node.js，请先安装 Node.js >= 18${RESET}"
  echo "  macOS: brew install node"
  echo "  Ubuntu/Debian: sudo apt install nodejs"
  exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo -e "${RED}(x.x) Node.js 版本过低 ($(node -v))，需要 >= 18${RESET}"
  exit 1
fi
echo -e "  ${GREEN}(^.^)b Node.js $(node -v) 已就绪${RESET}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo -e "  安装源: ${SCRIPT_DIR}"

if [ -d "$CLINN_HOME" ]; then
  echo -e "  ${CYAN}更新现有安装...${RESET}"
  rm -rf "$CLINN_HOME"
fi

mkdir -p "$CLINN_HOME"
cp -r "$SCRIPT_DIR"/Src "$CLINN_HOME/"
cp -r "$SCRIPT_DIR"/Tools "$CLINN_HOME/"
cp -r "$SCRIPT_DIR"/Mem "$CLINN_HOME/"
cp -r "$SCRIPT_DIR"/Logos "$CLINN_HOME/"
cp "$SCRIPT_DIR"/config.json "$CLINN_HOME/"

mkdir -p "$BIN_DIR"

cat > "$BIN_FILE" << 'CLINNEOF'
#!/bin/bash
exec node "$HOME/.clinn/Src/index.js" "$@"
CLINNEOF

chmod +x "$BIN_FILE"

if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  SHELL_RC=""
  if [ -f "$HOME/.zshrc" ]; then SHELL_RC="$HOME/.zshrc"; fi
  if [ -f "$HOME/.bashrc" ]; then SHELL_RC="$HOME/.bashrc"; fi
  if [ -z "$SHELL_RC" ] && [ -f "$HOME/.bash_profile" ]; then SHELL_RC="$HOME/.bash_profile"; fi

  if [ -n "$SHELL_RC" ]; then
    echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$SHELL_RC"
    echo -e "  ${GREEN}已将 $BIN_DIR 加入 PATH ($SHELL_RC)${RESET}"
  else
    echo -e "  ${CYAN}请手动将 $BIN_DIR 加入 PATH${RESET}"
  fi
fi

echo ""
echo -e "${GREEN}${BOLD}  (^.^)b 安装完成!${RESET}"
echo ""
echo -e "  启动:   ${CYAN}clinn${RESET}"
echo -e "  配置:   ${CYAN}vim ~/.clinn/config.json${RESET}  (设置你的 API Key)"
echo -e "  模型:   默认 deepseek-chat，换 v4-pro 请修改 config.json"
echo -e "  工具:   AI 编写的持久化工具在 ${CYAN}~/.clinn/Tools/custom/${RESET}"
echo ""
echo -e "  ${BOLD}重要:${RESET} 请先编辑 ${CYAN}~/.clinn/config.json${RESET} 填入你的 DeepSeek API Key!"
echo ""
echo -e "  新终端中运行:  ${CYAN}source $SHELL_RC${RESET}  或重新打开终端"
echo ""
