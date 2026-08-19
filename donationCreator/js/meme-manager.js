// js/meme-manager.js — where a meme goes on screen and how big it is.
//
// The TRANSPORT (download, start, stop, sync with the host's speakers) lives
// in js/media-clip.js and js/audio-bus.js; this file is layout and policy.
// See media-clip.js for why memes used to be heard but never seen.
//
// Every playback runs under a ShowContext:
//   * a donation passes its own ctx, so the meme's sound is part of that
//     donation and dies with it — a meme can no longer keep playing into the
//     next donation;
//   * the builder preview and the meme cannon get a throwaway local ctx, so
//     they clean up after themselves the same way.

class MemeManager {
    /**
     * @param {HTMLElement} container  where windowed memes are placed
     * @param {AudioBus} [bus]         shared audio bus (the overlay passes
     *   its own; the builder gets a local one with no host bridge, which is
     *   what keeps preview sound inside the builder's own window)
     */
    constructor(container = document.body, bus = null) {
        this.zIndexCounter = 9999;
        this.container = container;
        this.bus = bus || new AudioBus(typeof hostAudio !== 'undefined' ? hostAudio : null);
        this._shows = new Set();   // contexts this manager owns (local ones)
    }

    /** Cancel everything this manager started: elements AND sound. */
    stopAll() {
        for (const ctx of [...this._shows]) ctx.cancel('stopAll');
        this._shows.clear();
        // Belt and braces: anything left by an older code path or a context
        // that was never registered here.
        document.querySelectorAll('.meme-container').forEach(e => e.remove());
        document.querySelectorAll('.greenscreen-overlay').forEach(e => e.remove());
    }

    /** Take a frame off screen. Idempotent — both the normal end of a clip
     *  and the show's teardown call it. */
    _remove(wrapper) {
        if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    }

    /** A context for playback that isn't part of a donation. */
    _localShow(kind) {
        const ctx = ShowContext.local(kind);
        this._shows.add(ctx);
        ctx.defer(() => this._shows.delete(ctx));
        return ctx;
    }

    // ── Windowed / fullscreen meme (.webm, sound baked in) ───────────────────

    /**
     * @param {object} trigger  { id }
     * @param {boolean} isMuted
     * @param {number} volume
     * @param {number} amount   donation size — decides fullscreen
     * @param {string} currency
     * @param {object} [opts]   { ctx, role } when played as part of a donation
     */
    async playMeme(trigger, isMuted = false, volume = 1, amount = 0, currency = 'RUB', opts = {}) {
        const ctx = opts.ctx || this._localShow('meme');
        const owned = !opts.ctx;
        const role = opts.role || `m${trigger.id}`;
        const src = `memes/meme${trigger.id}.webm`;

        try {
            const clip = new MediaClip(src, { className: 'meme-visual' });
            if (!await clip.prepare(ctx)) return;

            // Decode the soundtrack BEFORE anything is shown: the host player
            // can't open webm, so this is the slow part, and doing it here is
            // what keeps picture and sound together.
            const wantHostAudio = !isMuted && this.bus.hostReady;
            const track = wantHostAudio
                ? await ctx.wait(this.bus.prepareMediaAudio(src, clip.audioBytes()),
                    { timeout: 20000, label: `host audio ${src}` })
                : null;
            const audioBlob = track && track.blob;
            ctx.check();

            const wrapper = this._frameFor(clip, amount, currency);
            const fullscreen = wrapper.classList.contains('fullscreen');
            const target = fullscreen ? document.body : this.container;
            target.appendChild(wrapper);
            // Registered as a safety net (a cancelled show takes it with it);
            // in the normal case the finally below removes it the moment the
            // clip is over, so a finished meme never sits frozen on screen.
            ctx.defer(() => this._remove(wrapper));

            try {
                await clip.run(ctx, {
                    // A meme's soundtrack is baked into the file, so the clip
                    // may end when it stops. `track` already measured it for
                    // the host player; without a host (builder preview, host
                    // down) the clip measures it itself.
                    soundIsInVideo: true,
                    soundMs: track ? track.soundMs : 0,
                    startAudio: audioBlob
                        ? () => this.bus.playBlob(ctx, role, audioBlob, { volume, ext: 'wav' })
                        : null,
                    // No host audio (app down, no audio track, muted preview):
                    // the video carries its own sound exactly as it used to.
                    onNoAudio: () => {
                        clip.el.muted = isMuted;
                        clip.el.volume = volume;
                    }
                });
            } finally {
                clip.destroy();
                this._remove(wrapper);
            }
        } catch (err) {
            if (!ShowContext.isCancellation(err)) {
                console.error(`[MemeManager] ${src} failed:`, err);
            }
        } finally {
            if (owned) ctx.end();
        }
    }

    /** Build the framed wrapper and size the video inside it. */
    _frameFor(clip, amount, currency) {
        const wrapper = document.createElement('div');
        wrapper.classList.add('meme-container');
        wrapper.style.zIndex = this.zIndexCounter++;

        // clientWidth/Height = layout px — correct even when the container is
        // CSS-scaled (builder preview), where getBoundingClientRect returns
        // the transformed size.
        const screenWidth = this.container.clientWidth || innerWidth;
        const screenHeight = this.container.clientHeight || innerHeight;

        // Big donations take the whole frame — the donator's own meme or the
        // one AUTO_GIFTS rolled for them, no difference.
        const cfg = (typeof CONFIG !== 'undefined' && CONFIG) || {};
        const rates = cfg.EXCHANGE_RATES_TO_RUB || { RUB: 1 };
        const rate = rates[String(currency || 'RUB').toUpperCase()] || 1;
        const fullscreenFrom = (cfg.MEMES && cfg.MEMES.FULLSCREEN_MIN_RUB) || 500;
        if (amount * rate >= fullscreenFrom) {
            // Fullscreen override — the CSS class overrides every base
            // .meme-container constraint; sizing is left to the stylesheet.
            wrapper.classList.add('fullscreen');
            wrapper.appendChild(clip.el);
            return wrapper;
        }

        const maxW = screenWidth * 0.5;
        const maxH = screenHeight * 0.5;
        const ratio = clip.el.videoWidth / clip.el.videoHeight;
        let renderW = clip.el.videoWidth;
        let renderH = clip.el.videoHeight;

        // Normalize how BIG a meme looks. Rendering 1:1 made low-res clips
        // (some are 118×118) postage stamps next to 512px ones. Scale the
        // small ones up until they cover TARGET_AREA_RATIO of the container —
        // by AREA, not width or height, so a tall clip and a wide one read as
        // the same size instead of one of them hogging the screen. The scale
        // applies to both axes, so aspect ratio is untouched. Only upscaling
        // happens here: a meme already at or above the target keeps its own
        // size and hits the 50% clamp below exactly as before.
        const TARGET_AREA_RATIO = 0.11;  // ≈ the size a 512×512 meme already had
        const MAX_UPSCALE = 3;           // beyond this a 118px source is pure mush
        const targetArea = screenWidth * screenHeight * TARGET_AREA_RATIO;
        const grow = Math.min(Math.sqrt(targetArea / (renderW * renderH)), MAX_UPSCALE);
        if (grow > 1) {
            renderW *= grow;
            renderH *= grow;
        }
        if (renderW > maxW) {
            renderW = maxW;
            renderH = renderW / ratio;
        }
        if (renderH > maxH) {
            renderH = maxH;
            renderW = renderH * ratio;
        }

        // Size the video to the EXACT aspect-true dimensions so the wrapper
        // hugs it — no pillarbox/letterbox black bars.
        clip.el.style.width = `${Math.round(renderW)}px`;
        clip.el.style.height = `${Math.round(renderH)}px`;

        const BORDER = 10; // 2 × 5px white frame on the wrapper
        const maxX = Math.max(0, screenWidth - renderW - BORDER);
        const maxY = Math.max(0, screenHeight - renderH - BORDER);
        wrapper.style.left = `${Math.floor(Math.random() * maxX)}px`;
        wrapper.style.top = `${Math.floor(Math.random() * maxY)}px`;
        wrapper.style.transform = `rotate(${Math.floor(Math.random() * 20) - 10}deg)`;

        wrapper.appendChild(clip.el);
        return wrapper;
    }

    // ── Green screen (transparent .webm + its own .wav) ──────────────────────

    /**
     * @param {object} trigger { id }
     * @param {boolean} isMuted
     * @param {number} volume
     * @param {object} [opts]  { ctx, role }
     */
    async playGreenScreen(trigger, isMuted = false, volume = CONFIG.GREEN_SCREEN.DEFAULT_VOLUME, opts = {}) {
        const ctx = opts.ctx || this._localShow('green');
        const owned = !opts.ctx;
        const role = opts.role || `g${trigger.id}`;
        const videoSrc = `greenScreenMemes/v${trigger.id}.webm`;
        const audioSrc = `greenScreenMemes/v${trigger.id}.wav`;

        try {
            const clip = new MediaClip(videoSrc, { className: 'meme-visual greenscreen-visual' });
            if (!await clip.prepare(ctx)) return;

            const wrapper = document.createElement('div');
            wrapper.classList.add('greenscreen-overlay');
            wrapper.style.zIndex = this.zIndexCounter++;
            wrapper.appendChild(clip.el);
            // Body, so the green screen stays above every container.
            document.body.appendChild(wrapper);
            ctx.defer(() => this._remove(wrapper));

            try {
                await clip.run(ctx, {
                    // The .wav is a real file, so the host plays it directly —
                    // no decoding needed, unlike a meme's baked-in track.
                    startAudio: isMuted
                        ? null
                        : () => this.bus.playUrl(ctx, role, audioSrc, { volume })
                });
            } finally {
                clip.destroy();
                this._remove(wrapper);
            }
        } catch (err) {
            if (!ShowContext.isCancellation(err)) {
                console.error(`[MemeManager] Green screen ${trigger.id} failed:`, err);
            }
        } finally {
            if (owned) ctx.end();
        }
    }
}
