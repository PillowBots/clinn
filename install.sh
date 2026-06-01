#!/usr/bin/env bash
set -euo pipefail
# Clinn v0.5.0 — Global Install (Linux / macOS / WSL)
# Usage: bash install.sh

INSTALL_LIB="/usr/local/lib/clinn"
INSTALL_BIN="/usr/local/bin/clinn"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'

command -v node &>/dev/null || { echo -e "${RED}Node.js not found. Install Node.js >= 18: https://nodejs.org${NC}"; exit 1; }

NEED_SUDO=""
if [ ! -w "/usr/local/lib" ] || [ ! -w "/usr/local/bin" ]; then
  command -v sudo &>/dev/null || { echo -e "${RED}sudo required to write to /usr/local${NC}"; exit 1; }
  NEED_SUDO="sudo"
fi

echo -e "${CYAN}Clinn v0.5.0 Global Install${NC}"

# Extract old API key before wiping
OLD_KEY=""
if [ -f "$INSTALL_LIB/config.json" ]; then
  OLD_KEY=$(node -e "try{process.stdout.write(require('$INSTALL_LIB/config.json').llm?.apiKey||'')}catch(e){}" 2>/dev/null)
fi

# Copy files
$NEED_SUDO mkdir -p "$INSTALL_LIB"
$NEED_SUDO rm -rf "$INSTALL_LIB/Src" "$INSTALL_LIB/Tools" "$INSTALL_LIB/Mem" "$INSTALL_LIB/Logos"
$NEED_SUDO cp -r "$SCRIPT_DIR/Src" "$INSTALL_LIB/"
$NEED_SUDO cp -r "$SCRIPT_DIR/Tools" "$INSTALL_LIB/"
$NEED_SUDO cp -r "$SCRIPT_DIR/Mem" "$INSTALL_LIB/"
$NEED_SUDO cp -r "$SCRIPT_DIR/Logos" "$INSTALL_LIB/"
$NEED_SUDO mkdir -p "$INSTALL_LIB/Tools/custom"
$NEED_SUDO cp "$SCRIPT_DIR/config.json" "$INSTALL_LIB/config.json"

# Merge old API key into new config
if [ -n "$OLD_KEY" ] && [ "$OLD_KEY" != "YOUR_API_KEY" ]; then
  $NEED_SUDO node -e "
    const fs=require('fs');
    const cfg=JSON.parse(fs.readFileSync('$INSTALL_LIB/config.json','utf-8'));
    cfg.llm.apiKey='$OLD_KEY';
    fs.writeFileSync('$INSTALL_LIB/config.json',JSON.stringify(cfg,null,2));
  "
fi

# Launcher
$NEED_SUDO bash -c "cat > $INSTALL_BIN" << 'EOF'
#!/usr/bin/env bash
exec node /usr/local/lib/clinn/Src/index.js "$@"
EOF
$NEED_SUDO chmod +x "$INSTALL_BIN"

echo -e "${GREEN}Done${NC}"
echo -e "  Run:       ${CYAN}clinn${NC}"
echo -e "  Config:    ${CYAN}${INSTALL_LIB}/config.json${NC}"
echo -e "  Uninstall: ${CYAN}sudo rm -rf ${INSTALL_LIB} ${INSTALL_BIN}${NC}"
