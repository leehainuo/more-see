#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/scripts/docker/docker-compose.yml"
DOCKER_ENV_FILE="${ROOT_DIR}/scripts/docker/.env"
ENV_EXAMPLE_FILE="${ROOT_DIR}/.env.example"
POSTGRES_DATA_DIR="${ROOT_DIR}/scripts/docker/data/postgres"
POSTGRES_PGDATA_DIR="${POSTGRES_DATA_DIR}/pgdata"
REDIS_DATA_DIR="${ROOT_DIR}/scripts/docker/data/redis"

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

mkdir -p "${POSTGRES_DATA_DIR}" "${POSTGRES_PGDATA_DIR}" "${REDIS_DATA_DIR}"

if [ ! -f "${DOCKER_ENV_FILE}" ]; then
  if [ -f "${ENV_EXAMPLE_FILE}" ]; then
    cp "${ENV_EXAMPLE_FILE}" "${DOCKER_ENV_FILE}"
    echo "未检测到 ${DOCKER_ENV_FILE}，已基于 ${ENV_EXAMPLE_FILE} 自动生成。"
  else
    echo "未找到 ${DOCKER_ENV_FILE}，且模板文件 ${ENV_EXAMPLE_FILE} 也不存在。" >&2
    exit 1
  fi
fi

echo "使用配置文件: ${COMPOSE_FILE}"
echo "使用环境文件: ${DOCKER_ENV_FILE}"
echo "PostgreSQL 数据目录: ${POSTGRES_DATA_DIR}"
echo "PostgreSQL PGDATA 目录: ${POSTGRES_PGDATA_DIR}"
echo "Redis 数据目录: ${REDIS_DATA_DIR}"
echo "开始构建并启动 More See 容器..."

docker compose -f "${COMPOSE_FILE}" up --build -d

echo ""
echo "启动完成。"
echo "前端地址: http://127.0.0.1:8080"
echo "后端健康检查: http://127.0.0.1:8000/healthz"
echo "环境文件: ${DOCKER_ENV_FILE}"
echo ""
echo "常用命令:"
echo "  查看日志: docker compose -f ${COMPOSE_FILE} logs -f"
echo "  停止服务: docker compose -f ${COMPOSE_FILE} down"
