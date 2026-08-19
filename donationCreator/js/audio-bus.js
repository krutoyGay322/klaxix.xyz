// js/audio-bus.js — every sound a donation makes, on one leash.
//
// WHY THIS EXISTS: donation audio plays on the HOST PC (DBDStreaming's MCI
// player — see js/host-audio.js), where a sound OUTLIVES the page code that
// started it. Two things went wrong because of that:
//
//   1. CHANNEL COLLISIONS. Channels were named globally: the alert voice was
//      always "donation-voice" and a meme was always "meme-<memeId>". A
//      donation that was still speaking when the next one started shared the
//      channel with it, and the host player closes a device to reopen it —
//      so donation B cut donation A off mid-word, or A's leftovers cut B off.
//      Here every channel id is derived from the SHOW's key, so two donations
//      can never name the same channel. (Two copies of the SAME donation —
//      the OBS source and a preview tab — deliberately still do, which is
//      what makes sound_player's "already_playing" de-duplication work.)
//
//   2. UNSTOPPABLE LEFTOVERS. Nothing tracked what was playing, so aborting a
//      donation could remove its visuals while its sound played on. Every
//      handle here is registered against the show and stopped when the show
//      ends — cancelled OR completed. THE GUARANTEE: when a show is over, it
//      is silent.
//
// Browser-fallback playback (host down, or the builder, which has no host
// bridge at all) goes through the same ledger, so the guarantee holds there
// too.

class AudioBus {
	/** @param {object|null} host  the HostAudio singleton, if the page has one */
	constructor(host) {
		this.host = host || null;
		this._live = new Map();     // ctx.key -> Set<handle>
		this._armed = new Set();    // ctx.keys that already registered teardown
	}

	get hostReady() {
		return !!(this.host && this.host.enabled);
	}

	/** Channel name for one role within one show. Stable, short, MCI-safe. */
	channelId(ctx, role) {
		return `don-${ctx.key}-${String(role).replace(/[^a-zA-Z0-9_-]/g, '')}`.slice(0, 64);
	}

	// ── Playback ─────────────────────────────────────────────────────────────

	/**
	 * Play audio that exists only in the page (synthesized speech, a meme's
	 * soundtrack decoded out of its .webm).
	 *
	 * @param {ShowContext} ctx
	 * @param {string} role      'voice-intro', 'meme-1', ...
	 * @param {Blob}   blob
	 * @param {object} opts      {volume, ext, browserUrl, tailMs}
	 *   browserUrl: what to play in-page if the host declines. Omit to make a
	 *   host failure return null so the caller can do something smarter (the
	 *   meme player unmutes the video instead).
	 * @returns {Promise<object|null>} handle {mode, durationMs, done, stop}
	 */
	async playBlob(ctx, role, blob, opts = {}) {
		if (!blob) return null;
		if (this.hostReady) {
			const id = this.channelId(ctx, role);
			const ms = await this.host.playBlob(blob, {
				id,
				volume: opts.volume != null ? opts.volume : 1,
				ext: opts.ext || 'mp3'
			});
			if (ms !== null) return this._hostHandle(ctx, id, ms, opts.tailMs || 0);
		}
		if (opts.browserUrl) return this._browserHandle(ctx, opts.browserUrl, opts);
		return null;
	}

	/**
	 * Play a file that lives in the donationCREATOR folder (a green screen's
	 * .wav). Same contract as playBlob.
	 */
	async playUrl(ctx, role, url, opts = {}) {
		if (!url) return null;
		if (this.hostReady) {
			const id = this.channelId(ctx, role);
			const ms = await this.host.playFile(url, {
				id,
				volume: opts.volume != null ? opts.volume : 1
			});
			if (ms !== null) return this._hostHandle(ctx, id, ms, opts.tailMs || 0);
		}
		if (opts.browserUrl !== null) {
			return this._browserHandle(ctx, opts.browserUrl || url, opts);
		}
		return null;
	}

	/** Play in this page, deliberately (the bytes are already a blob: URL and
	 *  there is nothing for the host to open). Tracked like everything else. */
	playInPage(ctx, role, url, opts = {}) {
		if (!url) return null;
		return this._browserHandle(ctx, url, opts);
	}

	/**
	 * Decode a media file's soundtrack ahead of time (MCI cannot open .webm,
	 * so the page extracts the track and the host plays that). Returns null
	 * when the page can't — no audio track, undecodable, no host to play it.
	 *
	 * @returns {Promise<{blob: Blob, soundMs: number}|null>} `soundMs` is the
	 *   real length of the sound, which the meme player uses to end a padded
	 *   clip when it stops making noise. See host-audio.js mediaAudio().
	 * @param {ArrayBuffer} [buffer] bytes already in hand, to avoid a second
	 *   download of the same file.
	 */
	async prepareMediaAudio(url, buffer) {
		if (!this.hostReady || !this.host.mediaAudio) return null;
		try {
			return await this.host.mediaAudio(url, buffer);
		} catch (err) {
			console.warn('[AudioBus] Could not prepare host audio for', url, err);
			return null;
		}
	}

	// ── Handles ──────────────────────────────────────────────────────────────

	/** A sound playing on the host: we know its length, and we can stop it. */
	_hostHandle(ctx, id, durationMs, tailMs) {
		const total = durationMs > 0 ? durationMs + tailMs : 0;
		let finish = null;
		const done = new Promise((resolve) => { finish = resolve; });
		let timer = total > 0 ? setTimeout(() => handle.settle(), total) : null;
		const handle = {
			mode: 'host',
			id,
			durationMs,
			done,
			stopped: false,
			// Playback ran its course: let go of the channel, but do NOT tell
			// the host to stop — it has already finished, and a copy of this
			// page running a few milliseconds behind is still using it.
			settle: () => {
				if (handle.stopped) return;
				handle.stopped = true;
				if (timer) { clearTimeout(timer); timer = null; }
				this._forget(ctx, handle);
				finish();
			},
			stop: () => {
				if (handle.stopped) { return; }
				handle.stopped = true;
				if (timer) { clearTimeout(timer); timer = null; }
				this._forget(ctx, handle);
				if (this.host) this.host.stop(id);
				finish();
			}
		};
		this._remember(ctx, handle);
		// Length unknown (the host couldn't measure it): nothing to wait for,
		// and nothing the ledger can usefully hold on to.
		if (total === 0) handle.settle();
		return handle;
	}

	/** In-page fallback playback — tracked exactly like a host sound. */
	_browserHandle(ctx, url, opts) {
		const audio = new Audio(url);
		audio.volume = opts.volume != null ? opts.volume : 1;
		let finish = null;
		const done = new Promise((resolve) => { finish = resolve; });
		const handle = {
			mode: 'browser',
			id: url,
			durationMs: 0,
			done,
			stopped: false,
			settle: () => handle.stop(),
			stop: () => {
				if (handle.stopped) return;
				handle.stopped = true;
				try { audio.pause(); } catch (e) { /* already gone */ }
				this._forget(ctx, handle);
				finish();
			}
		};
		const over = () => handle.stop();
		audio.addEventListener('ended', over, { once: true });
		audio.addEventListener('error', () => {
			console.warn('[AudioBus] In-browser playback failed for', url);
			over();
		}, { once: true });
		this._remember(ctx, handle);
		audio.play().catch((err) => {
			console.warn('[AudioBus] In-browser playback rejected:', err);
			over();
		});
		return handle;
	}

	// ── Ledger ───────────────────────────────────────────────────────────────

	_remember(ctx, handle) {
		let set = this._live.get(ctx.key);
		if (!set) { set = new Set(); this._live.set(ctx.key, set); }
		set.add(handle);
		// First sound of this show: bind "show over -> silence" once.
		if (!this._armed.has(ctx.key)) {
			this._armed.add(ctx.key);
			ctx.defer(() => {
				this._armed.delete(ctx.key);
				this.stopShow(ctx);
			});
		}
	}

	_forget(ctx, handle) {
		const set = this._live.get(ctx.key);
		if (!set) return;
		set.delete(handle);
		if (!set.size) this._live.delete(ctx.key);
	}

	/** Silence everything this show started. Handles that already ran their
	 *  course are gone from the ledger, so this only ever cuts what is
	 *  genuinely still playing. */
	stopShow(ctx) {
		const set = this._live.get(ctx.key);
		if (!set || !set.size) return;
		console.log(`[AudioBus] Silencing ${set.size} sound(s) left over from ${ctx.label}.`);
		for (const handle of [...set]) handle.stop();
		this._live.delete(ctx.key);
	}

	/** Anything at all this page is still playing. */
	stopEverything() {
		for (const set of [...this._live.values()]) {
			for (const handle of [...set]) handle.stop();
		}
		this._live.clear();
	}

	/**
	 * A donation that was mid-alert when the overlay reloaded (OBS refresh,
	 * crash, cache flip) left its voice talking on the host with nobody left
	 * to stop it. Ask the host to drop every channel this overlay owns.
	 * Best-effort and fail-open: an older DBD app without the endpoint just
	 * 404s and we carry on.
	 */
	stopOrphans() {
		if (!this.hostReady || !this.host.stopPrefix) return;
		this.host.stopPrefix('don-');
	}
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = { AudioBus };
}
