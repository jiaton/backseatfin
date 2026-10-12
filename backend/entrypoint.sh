#!/bin/sh
# Runs the server as PUID:PGID (default 1000:1000). Downloads land in the media library
# that Emby also reads, so they should belong to the same user Emby runs as.
set -e
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
if [ "$(id -u)" = "0" ]; then
  # YouTube changes its site now and then and yt-dlp catches up within days: take the
  # newest release at each start (YTDLP_AUTO_UPDATE=0 keeps the image's). Never fatal.
  if [ "${YTDLP_AUTO_UPDATE:-1}" = "1" ]; then
    timeout 60 pip install --quiet --no-cache-dir --disable-pip-version-check --root-user-action=ignore --upgrade --no-deps yt-dlp \
      && echo "yt-dlp $(python -c 'import yt_dlp.version as v; print(v.__version__)')" \
      || echo "yt-dlp update skipped (offline?); using the image's"
  fi
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
