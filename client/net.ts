import { io } from 'socket.io-client'

const KEY = 'bg_token'
// sessionStorage first: two tabs of the same browser can then be two different players.
export const getToken = () => sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY)
export function saveToken(token: string | null, remember = false) {
  sessionStorage.removeItem(KEY)
  localStorage.removeItem(KEY)
  if (token) (remember ? localStorage : sessionStorage).setItem(KEY, token)
}

export const socket = io({ auth: (cb) => cb({ token: getToken() }) })

export function call<T = any>(event: string, data: unknown = {}): Promise<T> {
  return new Promise((ok, ko) =>
    socket.emit(event, data, (r: { ok?: T; error?: string }) => (r.error ? ko(new Error(r.error)) : ok(r.ok as T))),
  )
}

let audio: AudioContext | undefined
export function beep(freq = 660) {
  try {
    audio ??= new AudioContext()
    const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime
    o.frequency.value = freq
    g.gain.setValueAtTime(0.08, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
    o.connect(g).connect(audio.destination)
    o.start()
    o.stop(t + 0.25)
  } catch {
    // no audio available: stay silent
  }
}
