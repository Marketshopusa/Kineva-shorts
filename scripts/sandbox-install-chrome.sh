#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
if command -v google-chrome-stable >/dev/null && google-chrome-stable --version >/dev/null 2>&1; then
  google-chrome-stable --version
  command -v google-chrome-stable
  exit 0
fi
curl -fsSL -o /tmp/google-chrome.deb \
  https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
apt-get install -y /tmp/google-chrome.deb
google-chrome-stable --version
command -v google-chrome-stable
