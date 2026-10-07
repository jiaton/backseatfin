// The car player for Emby (our server's /car/play): Emby through our server.
import { HttpError } from './api'
import { pickEngine } from './engines/detect'
import { mountPlayer, showMessage } from './page'
import { readPlayerParams } from './params'
import { createBackseatfinSource } from './sources/backseatfin'

const SERVER = 'Emby'

async function main() {
  const params = readPlayerParams(window.location.search)
  if (!params) return showMessage('noItem', SERVER)
  try {
    const source = await createBackseatfinSource(params.item, await pickEngine())
    mountPlayer(source, params)
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) showMessage('signedOut', SERVER)
    else showMessage('loadFailed', SERVER, { detail: String(e) })
  }
}

void main()
