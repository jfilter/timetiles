#!/usr/bin/env sh

# Setup script for git configuration in TimeTiles project

echo "Setting up git commit template..."
git config commit.template .gitmessage
echo "✓ Git commit template configured"

echo ""
echo "Git setup complete! When you run 'git commit' without -m flag,"
echo "you'll see a helpful template for writing commit messages."