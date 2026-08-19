// js/asset-counts.js
// How many memes / green screens / fish actually exist right now.
//
// The proxy counts the folders (/api/asset-counts) so nobody has to remember
// to bump CONFIG after dropping new files in — that was missed twice, and
// both times the new memes were invisible to the builder grid AND unrollable
// by the meme cannon with no error anywhere.
//
// FAIL-SOFT by design: the CONFIG numbers stay as the fallback, so opening a
// page over file://, or with the proxy down, behaves exactly as before.

const AssetCounts = {
	_loaded: null,

	/**
	 * Re-ask even if already loaded. The OBS overlay can sit open for days
	 * while the streamer keeps dropping memes in, and a cannon that only
	 * knows the count from boot would never roll any of them.
	 */
	refresh() {
		this._loaded = null;
		return this.load();
	},

	/** Resolve once per page; later calls reuse the same promise. */
	load() {
		if (this._loaded) return this._loaded;
		this._loaded = fetch('/api/asset-counts', { cache: 'no-store' })
			.then(r => {
				// A 404 here means the proxy predates this route — worth
				// saying out loud, or the grid silently caps at the stale
				// CONFIG number and looks like the old bug all over again.
				if (!r.ok) throw new Error(`proxy returned ${r.status}`);
				return r.json();
			})
			.then(data => {
				if (!data || !data.success) return null;
				// A zero means the folder was unreadable — never let that
				// silently empty a grid; the CONFIG fallback is better.
				if (data.memes > 0) CONFIG.MEMES.COUNT = data.memes;
				if (data.greenScreens > 0) CONFIG.GREEN_SCREEN.COUNT = data.greenScreens;
				if (data.fish > 0) CONFIG.FISH.TEXTURE_COUNT = data.fish;
				console.log('[Assets] on disk:', data.memes, 'memes,',
					data.greenScreens, 'green screens,', data.fish, 'fish');
				return data;
			})
			.catch(err => {
				console.warn(`[Assets] Live count unavailable (${err.message}) — `
					+ `using CONFIG fallback: ${CONFIG.MEMES.COUNT} memes. `
					+ `Restart the proxy if you just added new ones.`);
				return null;
			});
		return this._loaded;
	},
};
