// js/style-manager.js

class StyleManager {
	constructor() {
		this.loadedStyles = new Set();
		this.styleFolder = 'styles';
	}

	/**
	 * Dynamically loads a CSS file for a specific style ID if not already loaded.
	 * @param {number} styleId 
	 * @returns {Promise} Resolves when the CSS is loaded
	 */
	async ensureStyleLoaded(styleId) {
		if (this.loadedStyles.has(styleId)) return Promise.resolve();

		return new Promise((resolve, reject) => {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.type = 'text/css';
			link.href = `${this.styleFolder}/style-${styleId}.css`;
			
			link.onload = () => {
				console.log(`%c[STYLE] Loaded style-${styleId}.css`, "color: #00ff00");
				this.loadedStyles.add(styleId);
				resolve();
			};

			link.onerror = () => {
				console.error(`[STYLE] Failed to load style-${styleId}.css (will not retry)`);
				// Mark as "loaded" to prevent retry spam on every subsequent donation
				this.loadedStyles.add(styleId);
				reject();
			};

			document.head.appendChild(link);
		});
	}
}