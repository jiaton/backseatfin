/** Where our API lives relative to the page. On the car host (Emby + our player)
 * everything of ours is under /car (nginx strips it); on the admin site it's at the root. Derived from where the page
 * itself was served. */
export const API_PREFIX = window.location.pathname.startsWith('/car/') ? '/car' : ''

/** ws(s) URL for an API path, honoring the /car prefix on the car host. */
export function wsUrl(
  pathWithQuery: string,
  location: Pick<Location, 'protocol' | 'host'> = window.location,
  prefix: string = API_PREFIX,
): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${prefix}${pathWithQuery}`
}
