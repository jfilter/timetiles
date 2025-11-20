#!/bin/bash
# Convenience wrapper for deployment/deploy.sh
cd "$(dirname "$0")/deployment" && exec ./deploy.sh "$@"