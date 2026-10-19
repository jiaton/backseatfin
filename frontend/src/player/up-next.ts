import type { Translate } from './i18n'

/** After a video ends: "Up next: <title>" with a countdown, Play now and Cancel. Big
 * buttons (the car's touchscreen); playing happens when the countdown runs out. */
export const UP_NEXT_S = 8

export function createUpNext() {
  const el = document.createElement('div')
  el.className = 'cm-upnext'
  el.setAttribute('role', 'dialog')
  el.hidden = true
  let timer = 0

  function cancel() {
    window.clearInterval(timer)
    el.hidden = true
    el.replaceChildren()
  }

  function show(t: Translate, title: string, play: () => void) {
    cancel()
    let left = UP_NEXT_S
    const heading = document.createElement('p')
    heading.className = 'cm-upnext-label'
    const name = document.createElement('p')
    name.className = 'cm-upnext-title'
    name.textContent = title
    const now = document.createElement('button')
    now.className = 'cm-button cm-primary'
    now.textContent = t('playNow')
    now.addEventListener('click', () => {
      cancel()
      play()
    })
    const stop = document.createElement('button')
    stop.className = 'cm-button'
    stop.textContent = t('cancel')
    stop.addEventListener('click', cancel)
    const row = document.createElement('div')
    row.className = 'cm-row'
    row.append(now, stop)
    const render = () => (heading.textContent = t('upNext', { s: left }))
    render()
    el.append(heading, name, row)
    el.hidden = false
    timer = window.setInterval(() => {
      left -= 1
      if (left <= 0) {
        cancel()
        play()
      } else render()
    }, 1000)
  }

  return { el, show, cancel }
}

type NextVideo = { title: string; play(): void }

/** A video of a list that won't play: offer the one after it, on a tap only (the viewer
 * decides; nothing skips by itself). Nothing is shown at the list's end. */
export function offerNext(into: HTMLElement, t: Translate, upNext: () => Promise<NextVideo | null>, stop = () => {}) {
  into.querySelector('.cm-next')?.remove()
  return upNext().then(
    (next) => {
      if (!next) return
      const button = document.createElement('button')
      button.className = 'cm-button cm-primary cm-next'
      button.textContent = t('playNextOne', { title: next.title })
      button.addEventListener('click', () => {
        stop()
        next.play()
      })
      into.append(button)
    },
    () => {},
  )
}
