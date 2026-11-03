#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if [ -d "$PWD/bin" ]; then
  export PATH="$PWD/bin:$PATH"
fi

echo "🚀 מפעיל את מערכת Money Tracker IL בכתובת: http://localhost:3000"
exec node src/server.js
