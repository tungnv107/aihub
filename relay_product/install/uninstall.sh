#!/bin/bash
set -eu
main() {
  [ "$(uname -s)" = Darwin ] || { printf '%s\n' 'This uninstall command is for macOS.'; return 1; }
  relay_root="${TDH_RELAY_HOME:-$HOME/Library/Application Support/TDHRelay}"
  case "$relay_root" in /*) ;; *) return 1;; esac
  [ "$relay_root" != / ] && [ "$relay_root" != "$HOME" ] && [ ! -L "$relay_root" ] || return 1
  [ -f "$relay_root/product.id" ] || { printf '%s\n' 'TDH Relay is not installed.'; return 0; }
  [ "$(cat "$relay_root/product.id")" = tdh-relay ] || return 1
  relay_node="$relay_root/runtime/bin/node"
  relay_cli="$relay_root/app/relay_product/cli.mjs"
  [ -f "$relay_cli" ] || { printf '%s\n' 'Application already removed; backups retained.'; return 0; }
  "$relay_node" "$relay_cli" unsync --home "$relay_root"
  relay_plist="$HOME/Library/LaunchAgents/me.tudonghoa.codex-relay.plist"
  if [ -f "$relay_plist" ]; then
    grep -F 'TDH Relay managed startup' "$relay_plist" >/dev/null || return 1
    if launchctl print "gui/$(id -u)/me.tudonghoa.codex-relay" >/dev/null 2>&1; then launchctl bootout "gui/$(id -u)" "$relay_plist"; fi
    rm -f "$relay_plist"
  fi
  "$relay_node" "$relay_cli" stop --home "$relay_root"
  [ ! -L "$relay_root/app" ] && [ ! -L "$relay_root/runtime" ] || return 1
  rm -rf "$relay_root/app" "$relay_root/runtime"
  printf '%s\n' "Removed. Codex configuration restored. Backups and statistics remain in $relay_root"
  printf '%s\n' 'Close and reopen Codex.'
}
main "$@"
