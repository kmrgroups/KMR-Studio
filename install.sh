#!/usr/bin/env bash
# KMR Studio one-time installer for Ubuntu (Oracle Cloud Always Free works great).
# Usage:  bash install.sh
set -e
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-3456}"
RUN_USER="$(whoami)"
say() { printf "\n\033[1;33m==> %s\033[0m\n" "$1"; }

say "Installing system packages (ffmpeg, fonts for all languages, python)"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ffmpeg unzip curl ca-certificates python3 python3-venv python3-pip \
  fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji fontconfig
sudo fc-cache -f >/dev/null 2>&1 || true

NODE_MAJOR=$(node -v 2>/dev/null | sed 's/v\([0-9]*\).*/\1/' || echo 0)
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 20 ]; then
  say "Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

say "Installing the voice engine (edge-tts)"
python3 -m venv "$APP_DIR/.venv"
"$APP_DIR/.venv/bin/pip" install -q --upgrade pip
"$APP_DIR/.venv/bin/pip" install -q --upgrade edge-tts kaggle

# Small servers (1 GB RAM) need swap to render video
MEM_MB=$(free -m | awk '/Mem:/ {print $2}')
if [ "$MEM_MB" -lt 3500 ] && ! swapon --show | grep -q swapfile; then
  say "Adding 4 GB swap for rendering"
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

say "Opening port $PORT in the server firewall"
if ! sudo iptables -C INPUT -p tcp --dport "$PORT" -j ACCEPT 2>/dev/null; then
  LINE=$(sudo iptables -L INPUT --line-numbers -n | awk '/REJECT/ {print $1; exit}')
  if [ -n "$LINE" ]; then sudo iptables -I INPUT "$LINE" -p tcp --dport "$PORT" -j ACCEPT; else sudo iptables -A INPUT -p tcp --dport "$PORT" -j ACCEPT; fi
fi
if command -v netfilter-persistent >/dev/null; then sudo netfilter-persistent save >/dev/null 2>&1 || true
else echo iptables-persistent iptables-persistent/autosave_v4 boolean true | sudo debconf-set-selections; sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent >/dev/null 2>&1 || true; fi
if command -v ufw >/dev/null && sudo ufw status | grep -q active; then sudo ufw allow "$PORT"/tcp; fi

say "Creating the background service (starts on boot, restarts on crash)"
mkdir -p "$APP_DIR/data"
sudo tee /etc/systemd/system/lumen-studio.service >/dev/null <<UNIT
[Unit]
Description=KMR Studio
After=network-online.target
Wants=network-online.target

[Service]
User=$RUN_USER
WorkingDirectory=$APP_DIR
ExecStart=$(command -v node) $APP_DIR/server.js
Restart=always
RestartSec=3
Environment=PORT=$PORT
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable lumen-studio >/dev/null
sudo systemctl restart lumen-studio
sleep 2

IP=$(curl -s --max-time 6 https://api.ipify.org || echo "YOUR-SERVER-IP")
say "Done!"
echo "Open this in your browser:  http://$IP:$PORT"
echo "If it does not open, add an Ingress rule for TCP port $PORT in Oracle Cloud (see README)."
echo "Logs: sudo journalctl -u lumen-studio -f"
