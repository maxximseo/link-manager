#!/bin/bash

# Start development server with auto-commit every 5 minutes

cd "$(dirname "$0")/.."

echo "🚀 Starting development server with auto-commit..."
echo "📝 Changes will be auto-committed every 5 minutes"
echo "🛑 Press Ctrl+C to stop"
echo ""

# Start auto-commit in background
(
    while true; do
        sleep 300  # 5 minutes
        bash scripts/auto-commit.sh
    done
) &
AUTO_COMMIT_PID=$!

# Trap Ctrl+C to kill auto-commit process
trap "echo ''; echo '🛑 Stopping auto-commit...'; kill $AUTO_COMMIT_PID 2>/dev/null; exit 0" INT TERM

# Start nodemon
npm run dev

# If nodemon exits, kill auto-commit
kill $AUTO_COMMIT_PID 2>/dev/null
