#!/bin/bash
# Convenience wrapper for deploy/deploy.sh
cd "$(dirname "$0")/deploy" && exec ./deploy.sh "$@"