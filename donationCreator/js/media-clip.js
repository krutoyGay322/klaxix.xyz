// js/media-clip.js — loading and playing one video clip, predictably.
//
// THIS IS THE FIX FOR "the meme plays sound but is never visible".
//
// The old player set `video.autoplay = true`. The browser then started the
// clip the instant it was inserted, while the code was still waiting to start
// its sound on the host PC — which takes a moment (the .webm has to be
// downloaded, its soundtrack decoded, re-encoded as PCM and uploaded, because
// the host's MCI player cannot open webm). Memes are short. The video was
// over and removed from the DOM before its audio ever started, so the stream
// heard a meme it never saw.
//
// A MediaClip fixes that by construction:
//   * NOTHING autoplays. The clip starts when, and only when, run() says so.
//   * The file is downloaded ONCE, into memory. The video plays from those
//     bytes and the soundtrack is decoded from the same bytes — instead of
//     two parallel downloads of the same multi-megabyte file competing for
//     Chromium's six-connections-per-host budget (which this setup has been
//     bitten by before).
//   * By the time run() is called the clip is fully buffered, so "start" is
//     immediate and the picture lands with the sound instead of stalling.
//   * One teardown path, registered on the show context, so a clip can never
//     be left behind on screen or half-playing.

const MEDIA_CACHE = new Map();      // url -> Promise<ArrayBuffer|null>
const MEDIA_CACHE_MAX = 6;          // the meme cannon replays the same files
const SOUND_LEN_CACHE = new Map();  // url -> Promise<number> (ms of real sound)

class MediaClip {
	constructor(src, { className = '', type = 'video/webm' } = {}) {
		this.src = src;
		this.className = className;
		this.type = type;
		this.el = null;
		this.bytes = null;
		this._objectUrl = null;
		this._destroyed = false;
	}

	/** The file's bytes, cached across clips. Null if it can't be fetched
	 *  (file://, offline) — the caller then streams from the URL as before. */
	static _fetchBytes(url) {
		if (MEDIA_CACHE.has(url)) return MEDIA_CACHE.get(url);
		const job = fetch(url)
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.arrayBuffer();
			})
			.catch((err) => {
				console.warn(`[MediaClip] Could not buffer ${url} (streaming instead):`, err);
				MEDIA_CACHE.delete(url);
				return null;
			});
		MEDIA_CACHE.set(url, job);
		while (MEDIA_CACHE.size > MEDIA_CACHE_MAX) {
			MEDIA_CACHE.delete(MEDIA_CACHE.keys().next().value);
		}
		return job;
	}

	/**
	 * A private copy of the bytes for decoding. decodeAudioData DETACHES the
	 * buffer it is given, which would empty the cache entry for everyone else.
	 */
	audioBytes() {
		return this.bytes ? this.bytes.slice(0) : undefined;
	}

	/**
	 * Download the clip and get it to the point where it can start instantly.
	 * Resolves true when the clip is playable (videoWidth is known, so the
	 * caller can lay it out), false when it is not — a broken meme file is
	 * skipped, it never blocks the donation.
	 */
	async prepare(ctx, { downloadTimeout = 20000, readyTimeout = 15000 } = {}) {
		this.bytes = await ctx.wait(MediaClip._fetchBytes(this.src), {
			timeout: downloadTimeout,
			label: `download ${this.src}`
		});

		const el = document.createElement('video');
		el.className = this.className;
		el.autoplay = false;        // explicit: run() decides when this starts
		el.muted = true;            // sound comes from the host player
		el.playsInline = true;
		el.preload = 'auto';
		this.el = el;
		ctx.defer(() => this.destroy());

		if (this.bytes) {
			this._objectUrl = URL.createObjectURL(new Blob([this.bytes], { type: this.type }));
			el.src = this._objectUrl;
		} else {
			el.src = this.src;      // fall back to streaming from the server
		}

		const ok = await ctx.wait(this._whenReady(el), {
			timeout: readyTimeout,
			label: `buffer ${this.src}`,
			fallback: false
		});
		if (!ok || !el.videoWidth) {
			console.warn(`[MediaClip] ${this.src} never became playable — skipping.`);
			return false;
		}
		return true;
	}

	_whenReady(el) {
		return new Promise((resolve) => {
			if (el.readyState >= 2 && el.videoWidth) return resolve(true);
			const ready = () => { if (el.videoWidth) resolve(true); };
			el.addEventListener('loadeddata', ready, { once: true });
			el.addEventListener('canplaythrough', ready, { once: true });
			el.addEventListener('error', () => resolve(false), { once: true });
			el.load();
		});
	}

	/** Length in ms once prepared (0 if the container doesn't say). */
	get durationMs() {
		const d = this.el && this.el.duration;
		return (typeof d === 'number' && isFinite(d) && d > 0) ? d * 1000 : 0;
	}

	/** Tuning for "end the clip when the sound ends". */
	static get _trimCfg() {
		const c = (typeof CONFIG !== 'undefined' && CONFIG.MEMES
			&& CONFIG.MEMES.END_WITH_SOUND) || {};
		return {
			enabled: c.ENABLED !== false,
			minDeadTailMs: c.MIN_DEAD_TAIL_MS != null ? c.MIN_DEAD_TAIL_MS : 1000,
			tailMs: c.TAIL_MS != null ? c.TAIL_MS : 600
		};
	}

	/**
	 * How long this clip's soundtrack really is, in ms (0 = unknown).
	 *
	 * The overlay gets this for free: it already decodes the track to hand to
	 * the host player, and passes the length into run(). This is the fallback
	 * for the paths that don't — the builder preview, and any page where host
	 * audio is off — so a padded meme is cut short there too. Cached per URL
	 * because the meme cannon replays the same files.
	 */
	async _measureSoundMs() {
		if (SOUND_LEN_CACHE.has(this.src)) return SOUND_LEN_CACHE.get(this.src);
		const job = (async () => {
			const bytes = this.audioBytes();
			if (!bytes) return 0;
			const AC = window.AudioContext || window.webkitAudioContext;
			if (!AC) return 0;
			// Decode-only context: never connected to a destination, so the
			// autoplay policy can't leave it suspended and silent.
			if (!MediaClip._ctx) MediaClip._ctx = new AC();
			const decoded = await MediaClip._ctx.decodeAudioData(bytes);
			return decoded.duration * 1000;
		})().catch(() => 0);   // no audio track / undecodable -> never trim
		SOUND_LEN_CACHE.set(this.src, job);
		while (SOUND_LEN_CACHE.size > MEDIA_CACHE_MAX) {
			SOUND_LEN_CACHE.delete(SOUND_LEN_CACHE.keys().next().value);
		}
		return job;
	}

	/**
	 * When to take this clip off screen, in ms from its start — 0 meaning
	 * "when the video itself ends", the normal case.
	 *
	 * Memes downloaded from the meme sites are routinely padded to a fixed
	 * length: the AUDIO TRACK stops after a couple of seconds but the video
	 * runs on, usually looping a few frames, until the padded end. 92 of the
	 * 353 memes in this folder are like that, some with 5 seconds of dead air.
	 * Waiting for `ended` therefore parks a finished joke on screen — so when
	 * the sound is over well before the picture is, the sound wins.
	 *
	 * Deliberately conservative: a meme whose sound runs to (or past) the end
	 * is untouched, and a short gap of quiet at the end — a beat the meme is
	 * meant to have — must exceed MIN_DEAD_TAIL_MS before anything is cut.
	 *
	 * ONLY for clips whose own audio track IS their soundtrack. A green screen
	 * is played alongside a separate .wav, so its video's audio track (today
	 * there isn't one) says nothing about when that clip should end — hence
	 * the explicit `soundIsInVideo` gate rather than "measure and hope".
	 */
	async _cutAtMs(soundMs, soundIsInVideo) {
		const cfg = MediaClip._trimCfg;
		if (!cfg.enabled || !soundIsInVideo) return 0;
		const videoMs = this.durationMs;
		if (!videoMs) return 0;                       // unknown length: leave it
		let sound = soundMs > 0 ? soundMs : await this._measureSoundMs();
		if (!(sound > 0)) return 0;                   // silent or unmeasurable
		if (videoMs - sound < cfg.minDeadTailMs) return 0;
		return Math.min(videoMs, sound + cfg.tailMs);
	}

	/**
	 * Play it. Sound starts first (it is the thing with latency), the picture
	 * follows in the same tick, and the clip is over only when BOTH the video
	 * and its audio are done.
	 *
	 * @param {ShowContext} ctx
	 * @param {object} opts
	 *   startAudio  async () => handle|null — an AudioBus handle, or null if
	 *               the host isn't playing this clip's sound
	 *   onNoAudio   () => void — called when startAudio gave back null, so the
	 *               caller can fall back to the video's own audio track
	 *   soundIsInVideo  the clip's soundtrack is its own audio track (a meme),
	 *               so the clip may end when that track does. False for a
	 *               green screen, whose sound is a separate file.
	 *   soundMs     length of the real soundtrack if the caller already knows
	 *               it (the overlay decodes it for the host player anyway);
	 *               0 = measure it here. See _cutAtMs().
	 *   hardCapMs   never hold the show longer than this
	 */
	async run(ctx, { startAudio = null, onNoAudio = null, soundIsInVideo = false,
		soundMs = 0, hardCapMs = 45000 } = {}) {
		const el = this.el;
		if (!el) return;

		// Worked out BEFORE the clip starts, so the cut is timed from the
		// first frame rather than from whenever the decode happened to finish.
		const cutAtMs = await this._cutAtMs(soundMs, soundIsInVideo);

		let audio = null;
		if (startAudio) audio = await startAudio();
		// Nothing is carrying this clip's sound for us (no host bridge, host
		// down, no audio track, muted preview) — let the caller decide, e.g.
		// unmute the video and let the page play it the old way.
		if (!audio && onNoAudio) onNoAudio();
		ctx.check();

		const videoOver = new Promise((resolve) => {
			el.addEventListener('ended', resolve, { once: true });
			el.addEventListener('error', resolve, { once: true });
		});

		try {
			const started = el.play();
			if (started && typeof started.then === 'function') await started;
		} catch (err) {
			console.warn(`[MediaClip] ${this.src} refused to start:`, err);
		}

		const played = Promise.all([videoOver, audio ? audio.done : Promise.resolve()]);

		// A padded meme: end it once the sound is over instead of sitting
		// through the dead tail. The timer starts with the picture, and is
		// always cleared — a leaked one would fire over a later donation.
		let over = played;
		let cutTimer = null;
		if (cutAtMs > 0) {
			console.log(`[MediaClip] ${this.src}: sound ends at `
				+ `${Math.round(cutAtMs)}ms of ${Math.round(this.durationMs)}ms — cutting the dead tail.`);
			over = Promise.race([
				played,
				new Promise((resolve) => { cutTimer = setTimeout(resolve, cutAtMs); })
			]);
		}

		const expected = cutAtMs > 0
			? cutAtMs
			: Math.max(this.durationMs, audio ? audio.durationMs : 0, 1000);
		try {
			await ctx.wait(over, {
				timeout: Math.min(hardCapMs, expected + 4000),
				label: `clip ${this.src}`
			});
		} finally {
			if (cutTimer) clearTimeout(cutTimer);
		}
	}

	/** Idempotent. Registered on the show context by prepare(), so it runs
	 *  whether the clip finished, was cancelled, or threw. */
	destroy() {
		if (this._destroyed) return;
		this._destroyed = true;
		const el = this.el;
		if (el) {
			try { el.pause(); } catch (e) { /* never started */ }
			el.removeAttribute('src');
			try { el.load(); } catch (e) { /* detached already */ }
			if (el.parentNode) el.parentNode.removeChild(el);
		}
		if (this._objectUrl) {
			URL.revokeObjectURL(this._objectUrl);
			this._objectUrl = null;
		}
		this.bytes = null;          // the cache still holds the shared copy
	}
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = { MediaClip };
}
