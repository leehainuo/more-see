#!/usr/bin/env bash
set -euo pipefail
uv run uvicorn app.main:app --reload
