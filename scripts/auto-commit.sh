#!/bin/bash

# Auto-commit script for development
# Automatically commits and pushes changes to GitHub

cd "$(dirname "$0")/.."

# Check if there are changes
if [[ -n $(git status -s) ]]; then
    echo "📝 Changes detected, auto-committing..."

    # Add all changes
    git add .

    # Create commit with timestamp
    TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
    git commit -m "Auto-commit: Development changes at $TIMESTAMP

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

    # Push to GitHub
    echo "🚀 Pushing to GitHub..."
    git push origin main

    echo "✅ Changes committed and pushed successfully!"
else
    echo "✨ No changes to commit"
fi
