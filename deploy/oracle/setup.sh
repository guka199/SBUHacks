#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu VM (Oracle Cloud Always Free, Ampere A1): Docker + open ports 80/443.
set -euo pipefail
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl git iptables-persistent
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# Oracle's Ubuntu images reject everything except SSH in iptables; allow web traffic and keep it after reboots.
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 6 -p tcp --dport "$port" -j ACCEPT
done
sudo netfilter-persistent save
echo "Done. Log out and back in (docker group), then: docker compose -f deploy/oracle/docker-compose.yml up -d --build"
