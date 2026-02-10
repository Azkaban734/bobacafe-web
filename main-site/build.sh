#!/usr/bin/env bash
set -e
# Run from repo root or from main-site
if [ -d "schedule-app" ]; then
  cd schedule-app
elif [ -d "../schedule-app" ]; then
  cd ../schedule-app
else
  echo "Error: schedule-app folder not found" && exit 1
fi
npm ci
npm run build
# Target: main-site/schedule-app (relative to repo root)
mkdir -p ../main-site/schedule-app
cp -r build/* ../main-site/schedule-app/
