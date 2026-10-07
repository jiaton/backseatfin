// The car player for Jellyfin, served by the BackseatFin Jellyfin plugin
// (<jellyfin>/BackseatFin/play). No BackseatFin server: Jellyfin itself transcodes.
import { pickEngine } from './engines/detect'
import { mountPlayer, showMessage } from './page'
import { readPlayerParams } from './params'
import { createJellyfinSource, JellyfinError, serverRoot } from './sources/jellyfin'

const SERVER = 'Jellyfin'

async function main() {
  const root = serverRoot(window.location.pathname)
  const params = readPlayerParams(window.location.search, root)
  if (!params) return showMessage('noItem', SERVER, {}, root)
  // Without our server there's no JSMpeg stream to fall back to.
  if ((await pickEngine()) !== 'webcodecs') return showMessage('needsWebCodecs', SERVER, {}, root)
  try {
    mountPlayer(await createJellyfinSource(params.item, root), params)
  } catch (e) {
    if (e instanceof JellyfinError && e.status === 401) showMessage('signedOut', SERVER, {}, root)
    else showMessage('loadFailed', SERVER, { detail: String(e) }, root)
  }
}

void main()
