#!/usr/bin/env bash
set -euo pipefail

app_binary="${1:?release binary path required}"

expect_running() {
  set +e
  "$@"
  status=$?
  set -e
  if [[ "$status" -ne 124 ]]; then
    echo "smoke process exited unexpectedly with status $status"
    exit "$status"
  fi
}

expect_running dbus-run-session -- xvfb-run -a env \
  GDK_BACKEND=x11 timeout 8s "$app_binary"

expect_running dbus-run-session -- xvfb-run -a env \
  GDK_BACKEND=x11 WEBKIT_DISABLE_DMABUF_RENDERER=1 timeout 8s "$app_binary"

runtime_dir="$(mktemp -d)"
chmod 700 "$runtime_dir"
XDG_RUNTIME_DIR="$runtime_dir" weston \
  --backend=headless-backend.so \
  --socket=wayland-screen-wall \
  --idle-time=0 \
  >"$runtime_dir/weston.log" 2>&1 &
weston_pid=$!
trap 'kill "$weston_pid" 2>/dev/null || true' EXIT

for _ in {1..50}; do
  [[ -S "$runtime_dir/wayland-screen-wall" ]] && break
  sleep 0.1
done
[[ -S "$runtime_dir/wayland-screen-wall" ]] || {
  cat "$runtime_dir/weston.log"
  exit 1
}

expect_running dbus-run-session -- env \
  XDG_RUNTIME_DIR="$runtime_dir" \
  WAYLAND_DISPLAY=wayland-screen-wall \
  GDK_BACKEND=wayland \
  timeout 8s "$app_binary"
