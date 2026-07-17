import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { playOverlaySound, startOverlayLoop, setOverlayLoopVolume, stopOverlayLoop, stopAllOverlaySounds } from './audio.js';

/**
 * SlotMachine — Casino roulette component (perks + characters).
 *
 * Standalone fork of the DBDStreaming overlay component. Differences from the
 * original, all driven by this build being hand-operated rather than
 * dashboard-driven:
 *   - The cabinet NEVER hides itself. The original held the result 3s, played
 *     an exit animation and vanished; here it lands and stays put until the
 *     next pull. Only the app hides it (on a roulette-type switch).
 *   - The lever is the control: click it to pull. `onPull` fires, the app
 *     supplies the next result, and the reels spin.
 *   - One spin trigger for both modes: every pull bumps `spinIndex`. The
 *     original auto-spun perk mode once on appearance and used spinIndex only
 *     for characters.
 *
 * Always shows 4 reels in the standard layout.
 *
 * MODE "perks":     4 reels land on 4 different perk icons → jackpot sound.
 * MODE "character": 4 reels all land on the SAME character portrait when
 *                   isJackpot (jackpot sound + golden glow); on a miss they
 *                   land on 4 different ones (fail shake + red flash).
 *
 * Props:
 *   visible       — whether the machine is currently shown
 *   mode          — "perks" (default) or "character"
 *   perks         — array of 4 objects with { name, image }; null = idle reels
 *   library       — full icon list for random reel fill (items with .icon field)
 *   isJackpot     — (character mode) whether this spin is a jackpot
 *   characterName — (character mode) name of the landed character
 *   spinIndex     — bump this to spin; every distinct value spins once
 *   canPull       — whether the lever accepts a click right now
 *   onPull        — called when the lever is pulled
 *   onComplete    — called once the reels have settled (cabinet stays visible)
 */

const CELL_HEIGHT = 140;
const VISIBLE_CELLS = 3;      // 3 cells visible in viewport
const LAND_ROW = 1;            // Middle row is the "payline"
const BUFFER_CELLS = 50;       // Total cells in the reel strip (more = longer spin)
const LAND_INDEX = 47;         // Index where the final perk lands

export function SlotMachine({ visible, mode = 'perks', perks, library, isJackpot = true, characterName = '', spinIndex = 0, canPull = false, onPull, onComplete }) {
  const containerRef = useRef(null);
  const reelRefs = useRef([null, null, null, null]);
  const reelVpRefs = useRef([null, null, null, null]);
  const leverRef = useRef(null);
  const doneCount = useRef(0);
  const mountedRef = useRef(true);
  // When `visible` flipped true — used to skip the entry-animation delay
  // for spins triggered while the cabinet is already on screen.
  const visibleSinceRef = useRef(0);
  // Reel start positions need a fresh random spread whenever the icon set
  // changes: left at 0 (the original's default) every reel opens on the same
  // strip position, so an idle cabinet shows the SAME icon four times across.
  // The original never showed one long enough to notice — this build parks on
  // it between pulls.
  const needsReseedRef = useRef(true);
  const [phase, setPhase] = useState('idle'); // idle | spinning | landed
  const [scale, setScale] = useState(1);
  const overlayRef = useRef(null);

  // Character mode visual effects (driven by completion, not props directly)
  const [showFailFlash, setShowFailFlash] = useState(false);
  const [showFailShake, setShowFailShake] = useState(false);
  const [showJackpotGlow, setShowJackpotGlow] = useState(false);
  const [showCharName, setShowCharName] = useState(false);

  const isCharMode = mode === 'character';

  // All sounds go through shared/audio.js (host-side playback with browser
  // fallback); the reel spin is the named loop below.
  const SPIN_LOOP_ID = 'slot-spin';

  // Collect random icon from library for reel fill, optionally avoiding duplicates
  const getRandomIcon = useCallback((excludeIcons = []) => {
    if (!library || library.length === 0) return '';
    let validItems = library;
    if (excludeIcons.length > 0) {
      validItems = library.filter(item => !excludeIcons.includes(item.icon || item.image || ''));
      if (validItems.length === 0) validItems = library; // Fallback if library is too small
    }
    const item = validItems[Math.floor(Math.random() * validItems.length)];
    return item.icon || item.image || '';
  }, [library]);

  // Ref to store the currently visible icons so we can seamlessly stitch them 
  // to the top (indexes 0, 1, 2) of the new spin's reels.
  const lastCellsRef = useRef(null);

  // Reset the "stitch previous visible icons onto the new reel top" cache when
  // the reel content changes, so the idle reels never show the PREVIOUS
  // roulette's icons:
  //   - mode switches (perks ↔ character), OR
  //   - the character set changes while idle — e.g. closing the survivor
  //     roulette and opening the killer one (both are mode 'character', so the
  //     mode check alone would leave survivor icons cached in the killer reels).
  // The cache is intentionally kept across spin steps of the SAME session
  // (perks is non-null then) so consecutive spins still stitch seamlessly.
  // In PERK mode the library prop is memoized upstream and only changes
  // identity on a role switch (survivor ↔ killer) — then the cached icons
  // belong to the other role's reels and must never be stitched, even
  // mid-roll (role and perks arrive in the same render, so isIdle is false).
  const currentModeRef = useRef(mode);
  const currentLibraryRef = useRef(library);
  const isIdle = !perks || perks.length === 0;
  if (currentModeRef.current !== mode ||
      (currentLibraryRef.current !== library && (isIdle || mode !== 'character'))) {
    lastCellsRef.current = null;
    needsReseedRef.current = true;
  }
  currentModeRef.current = mode;
  currentLibraryRef.current = library;

  const masterStrip = useMemo(() => {
    // Normal case: shuffle the full icon library into the reel strip.
    // Fallback: if the library never loaded (page came up during a server
    // restart), build the strip from the rolled perks themselves — a
    // repetitive reel is infinitely better than a dead, silent cabinet.
    const icons = (library && library.length > 0)
      ? library.map(item => item.icon || item.image || '')
      : (perks || []).map(p => p.image || p.icon || '').filter(Boolean);
    if (icons.length === 0) return [];
    return [...icons].sort(() => 0.5 - Math.random());
  }, [library, perks]);

  const reelStartIndicesRef = useRef([0, 0, 0, 0]);
  const targetYsRef = useRef([0, 0, 0, 0]);

  // Build reel cell data: contiguous slices from the master strip
  const reelData = useMemo(() => {
    if (masterStrip.length === 0) return [];

    if (needsReseedRef.current) {
      needsReseedRef.current = false;
      reelStartIndicesRef.current = reelStartIndicesRef.current.map(
        () => Math.floor(Math.random() * masterStrip.length)
      );
    }

    const newReelData = [];
    const newTargetYs = [];
    const hasPerks = perks && perks.length === 4;

    for (let reelIdx = 0; reelIdx < 4; reelIdx++) {
      let startIndex = reelStartIndicesRef.current[reelIdx];

      const finalIcon = hasPerks ? 
        ((typeof perks[reelIdx] === 'object' && perks[reelIdx] !== null) 
          ? (perks[reelIdx].icon || perks[reelIdx].image || '') 
          : '') 
        : '';

      let targetIndex = startIndex;
      if (finalIcon) {
        targetIndex = masterStrip.indexOf(finalIcon);
        if (targetIndex === -1) targetIndex = Math.floor(Math.random() * masterStrip.length);
      } else {
        targetIndex = Math.floor(Math.random() * masterStrip.length);
      }

      let steps = targetIndex - startIndex;
      const minSteps = 40 + reelIdx * 10; // staggered spin distances
      while (steps < minSteps) {
        steps += masterStrip.length;
      }

      const cells = [];
      let prevIcons = [];
      if (lastCellsRef.current && lastCellsRef.current[reelIdx] && lastCellsRef.current[reelIdx].length === 3) {
        prevIcons = lastCellsRef.current[reelIdx];
      }

      for (let i = -1; i <= steps + 1; i++) {
        if (i === -1) {
          cells.push({ icon: prevIcons[0] || masterStrip[(startIndex - 1 + masterStrip.length) % masterStrip.length], isFinal: false });
        } else if (i === 0) {
          cells.push({ icon: prevIcons[1] || masterStrip[startIndex % masterStrip.length], isFinal: false });
        } else if (i === 1) {
          cells.push({ icon: prevIcons[2] || masterStrip[(startIndex + 1) % masterStrip.length], isFinal: false });
        } else {
          const idx = (startIndex + i) % masterStrip.length;
          const normalizedIdx = idx < 0 ? idx + masterStrip.length : idx;
          cells.push({ icon: masterStrip[normalizedIdx], isFinal: i === steps });
        }
      }

      newReelData.push(cells);
      newTargetYs.push(steps * CELL_HEIGHT);
      if (hasPerks) {
        reelStartIndicesRef.current[reelIdx] = targetIndex;
      }
    }

    targetYsRef.current = newTargetYs;
    return newReelData;
  }, [perks, masterStrip]);

  const capturePhaseRef = useRef('idle');
  useEffect(() => {
    const prevPhase = capturePhaseRef.current;
    capturePhaseRef.current = phase;
    // Capture the visible icons when the machine is idle or has landed.
    if (phase === 'idle' && reelData && reelData.length === 4) {
      lastCellsRef.current = reelData.map(reel => [reel[0].icon, reel[1].icon, reel[2].icon]);
    } else if (phase === 'landed' && reelData && reelData.length === 4) {
      // Guard: capture only on the spinning→landed transition. When the
      // NEXT spin's reelData arrives while we're still 'landed', this
      // effect re-runs with the NEW reels and (without the guard) would
      // overwrite the cache with icons of the FUTURE landing position —
      // the stitched top would then flash wrong icons on the next spin.
      if (prevPhase === 'landed') return;
      lastCellsRef.current = reelData.map((reel, idx) => {
        const steps = Math.round(targetYsRef.current[idx] / CELL_HEIGHT);
        return [
          reel[steps].icon,
          reel[steps + 1].icon,
          reel[steps + 2].icon
        ];
      });
    }
  }, [phase, reelData]);

  // When reelData changes for a new spin, we must reset the reel transforms to 0 
  // BEFORE the browser paints, otherwise it will paint the bottom of the new reel
  // using the previous landed transform.
  const prevReelDataRef = useRef(reelData);
  useLayoutEffect(() => {
    if (prevReelDataRef.current !== reelData) {
      prevReelDataRef.current = reelData;
      // The original gated this reset to character mode — perk mode could
      // never get a second spin while landed, because the cabinet always
      // exited first. This build parks on 'landed', so BOTH modes need it:
      // without the reset the new strip paints at the old landed offset and
      // random icons flash in before the spin starts. At translateY(0) the
      // stitched top cells show exactly the icons already on screen.
      if (phase === 'landed') {
        reelRefs.current.forEach(el => {
          if (el) {
            el.style.transition = 'none';
            el.style.transform = 'translateY(0px)';
          }
        });
      }
    }
  }, [reelData, phase]);

  // Ensure SVG blur filters exist in DOM for motion blur
  useEffect(() => {
    if (document.getElementById('slot-vbf0')) return;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;';
    const defs = document.createElementNS(NS, 'defs');
    for (let i = 0; i < 4; i++) {
      const f = document.createElementNS(NS, 'filter');
      f.setAttribute('id', 'slot-vb' + i);
      f.setAttribute('x', '-15%');
      f.setAttribute('y', '-15%');
      f.setAttribute('width', '130%');
      f.setAttribute('height', '130%');
      const b = document.createElementNS(NS, 'feGaussianBlur');
      b.setAttribute('id', 'slot-vbf' + i);
      b.setAttribute('stdDeviation', '0 0');
      f.appendChild(b);
      defs.appendChild(f);
    }
    svg.appendChild(defs);
    document.body.appendChild(svg);
    return () => {
      if (svg.parentNode) svg.parentNode.removeChild(svg);
    };
  }, []);

  // Auto-scale to fit the overlay box using React state
  useEffect(() => {
    function fit() {
      // Cabinet total: ~860px wide (with lever), ~560px tall.
      // Measured against the overlay, not the window: on phones app.css
      // shrinks the overlay with media queries so the panel gets its own
      // space instead of covering the cabinet.
      const box = overlayRef.current;
      const w = box ? box.clientWidth : window.innerWidth;
      const h = box ? box.clientHeight : window.innerHeight;
      // Phones use nearly all the space; desktop keeps the roomier margin
      // and the slightly-smaller-than-fit look.
      const small = w < 700 || h < 520;
      const margin = small ? 12 : 40;
      const s = Math.min((w - margin) / 900, (h - margin) / 560);
      setScale(small ? s : s * 0.85);
    }
    fit();
    window.addEventListener('resize', fit);
    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && overlayRef.current) {
      ro = new ResizeObserver(fit);
      ro.observe(overlayRef.current);
    }
    return () => {
      window.removeEventListener('resize', fit);
      if (ro) ro.disconnect();
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Helper: set vertical blur on reel i
  function setStd(i, b) {
    const f = document.getElementById('slot-vbf' + i);
    if (f) f.setAttribute('stdDeviation', '0 ' + b.toFixed(2));
  }

  // Animate a single reel
  function animateReel(reelIdx, duration, targetY) {
    const el = reelRefs.current[reelIdx];
    const vp = reelVpRefs.current[reelIdx];
    if (!el) return;

    const overshoot = 11;

    // Reset position
    el.style.transition = 'none';
    el.style.transform = 'translateY(0px)';
    void el.offsetHeight; // force reflow

    // Apply motion blur filter
    if (vp) vp.style.filter = `url(#slot-vb${reelIdx})`;
    setStd(reelIdx, 0);

    const start = performance.now();
    let lastPos = 0;
    let lastT = start;

    function tick(now) {
      if (!mountedRef.current) return;
      let t = (now - start) / (duration * 1000);

      if (t >= 1) {
        // Settle bounce
        settle(el, reelIdx, targetY, overshoot);
        return;
      }

      // Ease-out quartic
      const e = 1 - Math.pow(1 - t, 4);
      const pos = -((targetY + overshoot) * e);
      el.style.transform = `translateY(${pos}px)`;

      // Motion blur based on velocity
      const dt = (now - lastT) || 16;
      const v = Math.abs(pos - lastPos) / dt;
      setStd(reelIdx, Math.min(11, v * 0.85));
      lastPos = pos;
      lastT = now;

      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // Settle bounce after main spin
  function settle(el, reelIdx, targetY, overshoot) {
    const start = performance.now();
    const dur = 280;
    const from = -(targetY + overshoot);
    const to = -targetY;
    const c1 = 2.3, c3 = c1 + 1;

    function ease(t) {
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    setStd(reelIdx, 0);
    triggerReelStopImpact(reelIdx);

    function tick(now) {
      if (!mountedRef.current) return;
      let t = (now - start) / dur;
      if (t >= 1) {
        el.style.transform = `translateY(${to}px)`;
        reelDone(reelIdx);
        return;
      }
      const e = ease(t);
      el.style.transform = `translateY(${from + (to - from) * e}px)`;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // Called the exact moment the reel hits the locking mechanism (start of bounce)
  function triggerReelStopImpact(reelIdx) {
    // Remove blur filter for instant sharpness
    const vp = reelVpRefs.current[reelIdx];
    if (vp) vp.style.filter = 'none';

    // Play reel stop sound
    playOverlaySound('/sounds/slots/Reel Stop.wav', 0.5);

    // Step down the spin volume to simulate fewer reels spinning
    // Volume steps: 0.35 -> 0.25 -> 0.15 -> 0.05
    // (Using doneCount before it increments)
    const newVol = 0.05 + Math.max(0, 2 - doneCount.current) * 0.10;
    setOverlayLoopVolume(SPIN_LOOP_ID, newVol);
  }

  // Called when the bounce animation fully finishes
  function reelDone(reelIdx) {
    doneCount.current += 1;
    if (doneCount.current >= 4) {
      allReelsDone();
    }
  }

  // All 4 reels finished. The cabinet STAYS on screen — the result (glow,
  // fail flash, landed reels) persists until the next pull replaces it.
  function allReelsDone() {
    // Fade out the spinning loop over 0.8s instead of an abrupt stop
    stopOverlayLoop(SPIN_LOOP_ID, 800);

    if (isCharMode) {
      setShowCharName(true);
      if (isJackpotRef.current) {
        // JACKPOT — play win sound + golden glow (both stay up)
        playOverlaySound('/sounds/slots/Jackpot 1.wav', 0.45);
        setShowJackpotGlow(true);
      } else {
        // FAIL — shake + red flash, no jackpot sound
        setShowFailFlash(true);
        setShowFailShake(true);
        setTimeout(() => {
          if (!mountedRef.current) return;
          setShowFailFlash(false);
          setShowFailShake(false);
        }, 600);
      }
    } else {
      playOverlaySound('/sounds/slots/Jackpot 1.wav', 0.45);
    }

    setPhase('landed');
    if (onComplete) onComplete();
  }

  // We need a ref for isJackpot so the async allReelsDone reads the current value
  const isJackpotRef = useRef(isJackpot);
  useEffect(() => { isJackpotRef.current = isJackpot; }, [isJackpot]);

  // Start the spin sequence
  const startSpin = useCallback(() => {
    if (phase === 'spinning' || reelData.length === 0) return;

    // Reset visual effects
    setShowFailFlash(false);
    setShowFailShake(false);
    setShowJackpotGlow(false);
    setShowCharName(false);

    doneCount.current = 0;
    setPhase('spinning');

    // Play lever pull animation
    const lever = leverRef.current;
    if (lever) {
      lever.classList.remove('pull');
      void lever.offsetHeight;
      lever.classList.add('pull');
    }

    // Play reel start sound
    playOverlaySound('/sounds/slots/Reel Start.wav', 0.55);

    // Start the looping spin sound (host-side, browser fallback)
    setTimeout(() => {
      if (!mountedRef.current || phaseRef.current !== 'spinning') return;
      startOverlayLoop(SPIN_LOOP_ID, '/sounds/slots/Reel Spin (Loopable).wav', 0.35);
    }, 150);

    // Stagger reel start times
    for (let i = 0; i < 4; i++) {
      const duration = 2.8 + i * 0.7; // Each reel takes longer — total ~5.5s for last reel
      const targetY = targetYsRef.current[i];
      setTimeout(() => {
        if (!mountedRef.current) return;
        animateReel(i, duration, targetY);
      }, i * 100);
    }
  }, [isCharMode, perks, reelData]);

  // We need a ref for phase so the async audio fetch doesn't play if we stopped early
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Track when the cabinet became visible, so spins triggered while it is
  // already on screen start instantly instead of sitting static for the
  // entry-animation delay (the "characters switch, freeze, THEN roll"
  // glitch on the first крутить of a character roulette).
  useEffect(() => {
    if (visible) visibleSinceRef.current = performance.now();
  }, [visible]);

  // Spin whenever the app hands us a new spinIndex with a result attached.
  // Same path for both modes — every lever pull bumps spinIndex.
  const lastSpinIndexRef = useRef(-1);
  useEffect(() => {
    if (visible && perks && perks.length === 4 && reelData.length === 4) {
      if (spinIndex !== lastSpinIndexRef.current && spinIndex >= 0) {
        lastSpinIndexRef.current = spinIndex;
        // Only wait out the entry animation if the cabinet JUST appeared;
        // on a cabinet that has been visible for a while, spin now.
        const sinceVisible = performance.now() - visibleSinceRef.current;
        const delay = Math.max(0, 600 - sinceVisible);
        if (phase === 'idle' && delay > 0) {
          setTimeout(() => {
            if (mountedRef.current) startSpin();
          }, delay);
        } else {
          startSpin();
        }
      }
    }

    if (!visible) {
      lastSpinIndexRef.current = -1;
      setPhase('idle');
      // Hiding must also wipe the result of the last spin. Rendering null does
      // NOT unmount this component, so without an explicit reset the golden
      // glow (or a fail flash) from the previous roulette rides along and
      // reappears on the next cabinet.
      setShowJackpotGlow(false);
      setShowFailFlash(false);
      setShowFailShake(false);
      setShowCharName(false);
      stopAllOverlaySounds();
    }
  }, [visible, perks, reelData, spinIndex, startSpin, phase]);

  // ── Lever ─────────────────────────────────────────────────────────────────
  // The lever is the only control: the app decides whether a pull is allowed
  // (canPull), and a spin in flight always blocks one.
  const pullable = canPull && phase !== 'spinning';
  const handleLeverPull = useCallback(() => {
    if (!pullable) return;
    if (onPull) onPull();
  }, [pullable, onPull]);

  // Cleanup sounds on unmount. mountedRef going false (above) already makes
  // every in-flight reel animation and pending timer bail out, so nothing can
  // reach allReelsDone and fire a jackpot sound for a spin that's been
  // navigated away from — but sounds ALREADY playing need stopping by hand.
  useEffect(() => {
    return () => {
      stopAllOverlaySounds();
    };
  }, []);

  if (!visible || reelData.length === 0) return null;

  const overlayClasses = [
    'slot-machine-overlay',
    visible ? 'visible' : '',
    'entering',
  ].filter(Boolean).join(' ');

  const cabinetClasses = [
    'slot-cabinet',
    showFailShake ? 'fail-shake' : '',
    showJackpotGlow ? 'jackpot-glow' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={overlayClasses} ref={overlayRef}>
      <div className="slot-scale-wrapper" style={{ transform: `scale(${scale})` }}>
        <div style={{ position: 'relative', width: '740px' }}>

          {/* LEVER — click it to spin */}
          <div
            className={`slot-lever-area ${pullable ? 'pullable' : ''}`}
            onClick={handleLeverPull}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleLeverPull(); } }}
            role="button"
            tabIndex={pullable ? 0 : -1}
            aria-label="Дёрнуть рычаг"
            aria-disabled={!pullable}
          >
            <div className="slot-lever-hub">
              <div className="slot-lever-hub-inner" />
            </div>
            <div ref={leverRef} className="slot-lever-arm">
              <div className="slot-lever-collar" />
              <div className="slot-lever-shaft" />
              <div className="slot-lever-ferrule" />
              <div className="slot-lever-ball">
                <div className="slot-lever-ball-shine" />
              </div>
            </div>
          </div>

          {/* CABINET */}
          <div className={cabinetClasses}>
            {/* Corner bolts */}
            <div className="slot-bolt tl" />
            <div className="slot-bolt tr" />
            <div className="slot-bolt bl" />
            <div className="slot-bolt br" />

            {/* Reel bezel */}
            <div className="slot-bezel">
              <div className="slot-reel-container">

                {/* 4 Reels */}
                {reelData.map((cells, reelIdx) => (
                  <div
                    key={reelIdx}
                    ref={el => { reelVpRefs.current[reelIdx] = el; }}
                    className="slot-reel-viewport"
                  >
                    <div
                      ref={el => { reelRefs.current[reelIdx] = el; }}
                      className="slot-reel-strip"
                    >
                      {cells.map((cell, cellIdx) => (
                        <div key={cellIdx} className="slot-reel-cell">
                          <img
                            src={encodeURI(cell.icon)}
                            alt=""
                            draggable="false"
                            loading="eager"
                          />
                        </div>
                      ))}
                    </div>

                    {/* Reel overlays */}
                    <div className="slot-reel-highlight" />
                    <div className="slot-reel-vignette" />
                    <div className="slot-reel-sheen" />
                  </div>
                ))}

                {/* Payline indicator */}
                <div className="slot-payline">
                  <div className="slot-payline-arrow-left" />
                  <div className="slot-payline-line" />
                  <div className="slot-payline-arrow-right" />
                </div>

                {/* Fail flash overlay (character mode) */}
                {isCharMode && (
                  <div className={`slot-fail-flash ${showFailFlash ? 'active' : ''}`} />
                )}

                </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
