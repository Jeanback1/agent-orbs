#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then npm ci; fi
if [ ! -d dist ]; then npm run build; fi
exec npm start
