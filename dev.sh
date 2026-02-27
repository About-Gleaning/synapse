#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="${ROOT_DIR}/.run"
LOG_DIR="${ROOT_DIR}/logs"
STOP_TIMEOUT=8

SERVICES=("server" "web")

usage() {
  cat <<'EOF'
用法:
  ./dev.sh start      启动后端与前端
  ./dev.sh stop       停止后端与前端
  ./dev.sh restart    重启后端与前端
  ./dev.sh status     查看运行状态
  ./dev.sh logs       实时查看日志
EOF
}

service_cmd_desc() {
  local service="$1"
  case "$service" in
    server) echo "pnpm dev:server" ;;
    web) echo "pnpm dev:web" ;;
    *) return 1 ;;
  esac
}

pid_file() {
  local service="$1"
  echo "${RUN_DIR}/${service}.pid"
}

log_file() {
  local service="$1"
  echo "${LOG_DIR}/${service}.log"
}

is_pid_running() {
  local pid="$1"
  kill -0 "$pid" >/dev/null 2>&1
}

read_pid() {
  local service="$1"
  local file
  file="$(pid_file "$service")"
  if [[ ! -f "$file" ]]; then
    return 1
  fi

  local pid
  pid="$(tr -d '[:space:]' < "$file")"
  if [[ -z "$pid" ]]; then
    return 1
  fi
  echo "$pid"
}

ensure_dirs() {
  mkdir -p "$RUN_DIR" "$LOG_DIR"
}

ensure_pnpm() {
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "[错误] 未检测到 pnpm，请先安装 pnpm。"
    exit 1
  fi
}

start_service() {
  local service="$1"
  local pidfile logfile existing_pid
  pidfile="$(pid_file "$service")"
  logfile="$(log_file "$service")"

  if existing_pid="$(read_pid "$service" 2>/dev/null)"; then
    if is_pid_running "$existing_pid"; then
      echo "[$service] 已在运行 (PID: $existing_pid)"
      return 0
    fi
    echo "[$service] 检测到失效 PID 文件，正在清理"
    rm -f "$pidfile"
  fi

  touch "$logfile"
  echo "[$service] 启动中: $(service_cmd_desc "$service")"

  case "$service" in
    server)
      (
        cd "$ROOT_DIR"
        nohup pnpm dev:server >> "$logfile" 2>&1 &
        echo $! > "$pidfile"
      )
      ;;
    web)
      (
        cd "$ROOT_DIR"
        nohup pnpm dev:web >> "$logfile" 2>&1 &
        echo $! > "$pidfile"
      )
      ;;
    *)
      echo "[错误] 未知服务: $service"
      return 1
      ;;
  esac

  local new_pid
  new_pid="$(read_pid "$service")"
  sleep 1
  if is_pid_running "$new_pid"; then
    echo "[$service] 启动成功 (PID: $new_pid, 日志: $logfile)"
    return 0
  fi

  echo "[$service] 启动失败，请查看日志: $logfile"
  rm -f "$pidfile"
  return 1
}

stop_service() {
  local service="$1"
  local pidfile pid
  pidfile="$(pid_file "$service")"

  if ! pid="$(read_pid "$service" 2>/dev/null)"; then
    if [[ -f "$pidfile" ]]; then
      rm -f "$pidfile"
    fi
    echo "[$service] 未运行"
    return 0
  fi

  if ! is_pid_running "$pid"; then
    echo "[$service] 进程不存在，清理 PID 文件"
    rm -f "$pidfile"
    return 0
  fi

  echo "[$service] 正在停止 (PID: $pid)"
  kill "$pid" >/dev/null 2>&1 || true

  local i
  for ((i=0; i<STOP_TIMEOUT; i++)); do
    if ! is_pid_running "$pid"; then
      rm -f "$pidfile"
      echo "[$service] 已停止"
      return 0
    fi
    sleep 1
  done

  echo "[$service] 优雅停止超时，执行强制停止"
  kill -9 "$pid" >/dev/null 2>&1 || true

  if is_pid_running "$pid"; then
    echo "[$service] 强制停止失败，请手动处理 (PID: $pid)"
    return 1
  fi

  rm -f "$pidfile"
  echo "[$service] 已强制停止"
}

status_service() {
  local service="$1"
  local pid
  if pid="$(read_pid "$service" 2>/dev/null)" && is_pid_running "$pid"; then
    echo "[$service] 运行中 (PID: $pid)"
  else
    echo "[$service] 未运行"
  fi
}

start_all() {
  local failed=0
  local service
  for service in "${SERVICES[@]}"; do
    if ! start_service "$service"; then
      failed=1
    fi
  done
  return "$failed"
}

stop_all() {
  local failed=0
  local service
  for service in "${SERVICES[@]}"; do
    if ! stop_service "$service"; then
      failed=1
    fi
  done
  return "$failed"
}

status_all() {
  local service
  for service in "${SERVICES[@]}"; do
    status_service "$service"
  done
}

logs_all() {
  mkdir -p "$LOG_DIR"
  touch "$(log_file "server")" "$(log_file "web")"
  tail -n 100 -f "$(log_file "server")" "$(log_file "web")"
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    start)
      ensure_dirs
      ensure_pnpm
      start_all
      ;;
    stop)
      ensure_dirs
      stop_all
      ;;
    restart)
      ensure_dirs
      ensure_pnpm
      stop_all
      start_all
      ;;
    status)
      ensure_dirs
      status_all
      ;;
    logs)
      ensure_dirs
      logs_all
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "${1:-}"
