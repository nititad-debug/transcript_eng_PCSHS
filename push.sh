#!/usr/bin/env bash
# ใช้: ./push.sh https://github.com/<user>/<repo>.git
set -e
git init -b main
git add .
git commit -m "TranscriptEN: standalone app with server"
git remote add origin "$1"
git push -u origin main
