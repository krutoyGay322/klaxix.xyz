// js/meme-history.js
// "Уже использован" — which memes this donator has already put into a code.
//
// The builder is a static page: it hands over a text code that the donator
// pastes into DonationAlerts, and never hears from them again. So the only
// place this can live is their own browser. localStorage, keyed per asset
// kind, capped, and completely optional — every read is wrapped because
// private-mode browsers throw on access rather than returning null.
//
// A meme counts as used the moment it is CONFIRMED into the code, not when
// it is clicked in the grid: browsing is not using.

class AssetHistory {
	constructor(key, max = 500) {
		this.key = key;
		this.max = max;
		this._cache = null;
	}

	/** Set of ids used before. Read once per page, then kept in memory. */
	all() {
		if (this._cache) return this._cache;
		let ids = [];
		try {
			const raw = localStorage.getItem(this.key);
			if (raw) ids = JSON.parse(raw);
		} catch (e) { /* private mode / corrupt value — start empty */ }
		this._cache = new Set(Array.isArray(ids) ? ids.filter(Number.isInteger) : []);
		return this._cache;
	}

	has(id) {
		return this.all().has(id);
	}

	/** Remember one id. Returns true if it was new. */
	add(id) {
		if (!Number.isInteger(id)) return false;
		const set = this.all();
		if (set.has(id)) return false;
		set.add(id);
		this._persist();
		return true;
	}

	clear() {
		this._cache = new Set();
		try { localStorage.removeItem(this.key); } catch (e) { /* nothing to do */ }
	}

	_persist() {
		const set = this.all();
		// Oldest entries fall off first — Set preserves insertion order.
		while (set.size > this.max) set.delete(set.values().next().value);
		try {
			localStorage.setItem(this.key, JSON.stringify([...set]));
		} catch (e) { /* storage full or blocked — the mark is a nicety */ }
	}
}

const MemeHistory = new AssetHistory('dc.usedMemes.v1');
