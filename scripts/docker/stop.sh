#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/scripts/docker/docker-compose.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "未检测到 docker，请先安装 Docker Desktop 或 Docker Engine。" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon 未启动，请先启动 Docker Desktop 或 Docker 服务。" >&2
  exit 1
fi

if [ ! -f "${COMPOSE_FILE}" ]; then
  echo "未找到 Compose 配置文件：${COMPOSE_FILE}" >&2
  exit 1
fi

echo "使用配置文件: ${COMPOSE_FILE}"
echo "开始停止 More See 容器..."

docker compose -f "${COMPOSE_FILE}" down

echo ""
echo "已停止 More See 容器。"
