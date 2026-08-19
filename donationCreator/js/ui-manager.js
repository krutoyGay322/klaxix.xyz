// js/ui-manager.js

class UIManager {
	constructor() {
		// Containers are targeted dynamically in displayDonation
	}

	/**
	 * Displays a visual donation alert in a specific grid slot
	 * @param {string} username 
	 * @param {string} message 
	 * @param {number} styleId
	 * @param {number} positionId
	 * @param {number} magnitude
	 * @returns {HTMLElement|null} the alert box, so the caller can take it
	 *   away early if its donation is cancelled
	 */
	displayDonation(username, message, styleId, positionId) {
		const trimmed = (message || '').trim();
		if (trimmed.length === 0 || trimmed === '[ссылка]') {
			message = 'Ничего не написал потому что он СИГМА';
		}

		// Select the 3x3 container based on the ID
		const targetContainer = document.getElementById(`pos-${positionId}`);
		if (!targetContainer) {
			console.warn(`[UI] Position P${positionId} not found.`);
			return null;
		}

		const alertDiv = document.createElement('div');

		alertDiv.className = `donation-alert donation-style-${styleId}`;

		const userEl = document.createElement('div');
		userEl.className = 'alert-user';
		userEl.textContent = username;

		const msgEl = document.createElement('div');
		msgEl.className = 'alert-message';
		msgEl.textContent = message;

		alertDiv.appendChild(userEl);
		alertDiv.appendChild(msgEl);

		// Prepend so the newest shows at the top of the stack in that corner
		targetContainer.prepend(alertDiv);

		// Self-destruct logic
		setTimeout(() => {
			alertDiv.classList.add('fade-out');
			setTimeout(() => {
				alertDiv.remove();
			}, 1000);
		}, CONFIG.UI.MESSAGE_DISPLAY_TIME);

		return alertDiv;
	}
}