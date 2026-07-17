/**
 * audio.js — standalone browser-only sound playback for the roulette.
 *
 * Same exported API as DBDStreaming's shared/audio.js (playOverlaySound,
 * startOverlayLoop, setOverlayLoopVolume, stopOverlayLoop) so SlotMachine.jsx
 * needs no sound changes — but with every server/API path removed. Sounds play
 * via plain <audio> elements with direct URLs (no fetch/blob), so the page
 * also works when opened straight from disk (file://).
 *
 * Added here (not in the main app): a MASTER volume the panel controls. Every
 * sound asks for its own logical volume (e.g. 0.45 for the jackpot); what
 * actually plays is `logical * master`, and changing the master retunes
 * already-playing sounds and loops live.
 *
 * Leading slashes are stripped from sound URLs: SlotMachine asks for
 * '/sounds/slots/…' (server-absolute in the original app), which here
 * resolves relative to index.html instead.
 */

function _rel(url) {
  return url.startsWith('/') ? url.slice(1) : url;
}

function _clamp(v) {
  return Math.max(0, Math.min(1, v));
}

let _master = 1.0;

// Playing sounds, each mapped to the volume it ASKED for (pre-master).
// Doubles as the strong reference that stops mid-playback GC.
const _active = new Map();   // HTMLAudioElement -> logical volume
const _loops = new Map();    // id -> { audio, volume, stopped }

export function setMasterVolume(v) {
  _master = _clamp(v);
  for (const [audio, logical] of _active) {
    try { audio.volume = _clamp(logical * _master); } catch (_) {}
  }
  for (const rec of _loops.values()) {
    if (rec.stopped) continue;
    try { rec.audio.volume = _clamp(rec.volume * _master); } catch (_) {}
  }
}

export function getMasterVolume() {
  return _master;
}

/**
 * Kill every sound immediately — one-shots and loops alike.
 *
 * Also an addition over the main app, where the server owned playback and a
 * page teardown couldn't strand a loop. Here the page owns it: switching
 * roulette type mid-spin must not leave the reel loop grinding away under the
 * next cabinet. Every sound on this page comes from the slot machine, so
 * "stop everything" is exactly the right scope on its teardown.
 */
export function stopAllOverlaySounds() {
  for (const audio of _active.keys()) {
    try { audio.pause(); } catch (_) {}
  }
  _active.clear();
  for (const rec of _loops.values()) {
    rec.stopped = true;
    try { rec.audio.pause(); } catch (_) {}
  }
  _loops.clear();
}

export function playOverlaySound(url, volume = 1.0) {
  try {
    const audio = new Audio(encodeURI(_rel(url)));
    audio.volume = _clamp(volume * _master);
    const cleanup = () => _active.delete(audio);
    audio.onended = cleanup;
    audio.onerror = (e) => {
      console.error('[Roulette] Audio element error:', url, e);
      cleanup();
    };
    _active.set(audio, volume);
    audio.play().catch(e => {
      cleanup();
      console.error('[Roulette] Audio playback failed:', url, e);
    });
  } catch (e) {
    console.error('[Roulette] Audio playback failed:', url, e);
  }
}

// ── Named loops (the slot-machine reel spin) ────────────────────────────────

export function startOverlayLoop(id, url, volume = 1.0) {
  stopOverlayLoop(id); // never stack two loops under one id
  const rec = { audio: new Audio(encodeURI(_rel(url))), volume, stopped: false };
  rec.audio.loop = true;
  rec.audio.volume = _clamp(volume * _master);
  _loops.set(id, rec);
  rec.audio.play().catch(e => console.error('[Roulette] Loop playback failed:', url, e));
}

export function setOverlayLoopVolume(id, volume) {
  const rec = _loops.get(id);
  if (!rec || rec.stopped) return;
  rec.volume = volume;
  rec.audio.volume = _clamp(volume * _master);
}

export function stopOverlayLoop(id, fadeMs = 0) {
  const rec = _loops.get(id);
  if (!rec) return;
  rec.stopped = true;
  _loops.delete(id);
  const audio = rec.audio;
  const done = () => { try { audio.pause(); } catch (_) {} };
  if (fadeMs > 0) {
    const startVol = audio.volume;
    const steps = Math.max(1, Math.round(fadeMs / 50));
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      try { audio.volume = Math.max(0, startVol * (1 - i / steps)); } catch (_) {}
      if (i >= steps) { clearInterval(t); done(); }
    }, fadeMs / steps);
  } else {
    done();
  }
}
