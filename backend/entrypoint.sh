#!/bin/sh
# Runs the server as PUID:PGID (default 1000:1000). Downloads land in the media library
# that Emby also reads, so they should belong to the same user Emby runs as.
set -e
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data
  chown "$PUID:$PGID" /app/data
  # A library folder Docker just created (root-owned, empty) is handed over too; an
  # existing one is left alone.
  lib="${LIBRARY_ROOT:-/media/youtube}"
  if [ -d "$lib" ] && [ "$(stat -c %u "$lib")" = "0" ] && [ -z "$(ls -A "$lib")" ]; then
    chown "$PUID:$PGID" "$lib"
  fi
  # Keep the supplementary groups compose added (GPU), but not root's own group 0.
  groups=$(id -G | tr ' ' '\n' | grep -vx 0 | paste -sd, -)
  if [ -n "$groups" ]; then
    exec setpriv --reuid="$PUID" --regid="$PGID" --groups="$groups" "$@"
  fi
  exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups "$@"
fi
exec "$@"
