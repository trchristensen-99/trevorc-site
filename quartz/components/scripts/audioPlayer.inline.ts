const STORAGE_POS_PREFIX = "trevorc-audio-pos:"
const STORAGE_SPEED_KEY = "trevorc-audio-speed"

function fmt(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")
  return `${m}:${s}`
}

function attachAudioPlayer(player: HTMLDivElement) {
  const audio = player.querySelector("audio") as HTMLAudioElement | null
  if (!audio) return

  const key = player.getAttribute("data-audio-key") ?? audio.src
  const storageKey = STORAGE_POS_PREFIX + key

  // Restore saved position (only if past 1s and not near end)
  const saved = localStorage.getItem(storageKey)
  if (saved) {
    const t = parseFloat(saved)
    const restore = () => {
      const dur = audio.duration
      if (!isNaN(t) && t > 1 && (!isFinite(dur) || t < dur - 5)) {
        audio.currentTime = t
      }
    }
    if (audio.readyState >= 1) restore()
    else audio.addEventListener("loadedmetadata", restore, { once: true })
  }

  // Save / clear position
  let lastSaved = 0
  const save = () => {
    const now = audio.currentTime
    const dur = audio.duration
    if (isFinite(dur) && now >= dur - 1) {
      localStorage.removeItem(storageKey)
    } else if (now > 1) {
      localStorage.setItem(storageKey, String(now))
    }
    lastSaved = now
  }
  const onPause = () => save()
  const onEnded = () => localStorage.removeItem(storageKey)
  const onTimeUpdate = () => {
    if (Math.abs(audio.currentTime - lastSaved) > 5) save()
  }
  const onUnload = () => save()

  audio.addEventListener("pause", onPause)
  audio.addEventListener("ended", onEnded)
  audio.addEventListener("timeupdate", onTimeUpdate)
  window.addEventListener("beforeunload", onUnload)

  // Skip buttons
  const back15 = player.querySelector('[data-action="back15"]') as HTMLButtonElement | null
  const fwd15 = player.querySelector('[data-action="fwd15"]') as HTMLButtonElement | null
  const onBack = () => {
    audio.currentTime = Math.max(0, audio.currentTime - 15)
  }
  const onFwd = () => {
    audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 15)
  }
  back15?.addEventListener("click", onBack)
  fwd15?.addEventListener("click", onFwd)

  // Speed
  const speedSelect = player.querySelector('[data-action="speed"]') as HTMLSelectElement | null
  if (speedSelect) {
    const savedSpeed = localStorage.getItem(STORAGE_SPEED_KEY)
    if (savedSpeed) {
      speedSelect.value = savedSpeed
      audio.playbackRate = parseFloat(savedSpeed)
    }
    const onSpeed = () => {
      const v = parseFloat(speedSelect.value)
      audio.playbackRate = v
      localStorage.setItem(STORAGE_SPEED_KEY, speedSelect.value)
    }
    speedSelect.addEventListener("change", onSpeed)
    window.addCleanup(() => speedSelect.removeEventListener("change", onSpeed))
  }

  // Time-remaining status
  const status = player.querySelector(".audio-player-status") as HTMLElement | null
  const updateStatus = () => {
    if (!status) return
    const remaining = audio.duration - audio.currentTime
    status.textContent = isFinite(remaining) ? `${fmt(remaining)} left` : ""
  }
  audio.addEventListener("timeupdate", updateStatus)
  audio.addEventListener("loadedmetadata", updateStatus)

  window.addCleanup(() => {
    audio.removeEventListener("pause", onPause)
    audio.removeEventListener("ended", onEnded)
    audio.removeEventListener("timeupdate", onTimeUpdate)
    audio.removeEventListener("timeupdate", updateStatus)
    audio.removeEventListener("loadedmetadata", updateStatus)
    window.removeEventListener("beforeunload", onUnload)
    back15?.removeEventListener("click", onBack)
    fwd15?.removeEventListener("click", onFwd)
  })
}

function init() {
  document
    .querySelectorAll<HTMLDivElement>(".audio-player")
    .forEach((p) => attachAudioPlayer(p))
}

document.addEventListener("nav", init)
