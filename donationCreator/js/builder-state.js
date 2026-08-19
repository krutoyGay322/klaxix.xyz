// js/builder-state.js
// Centralized state management for the donation builder

class BuilderState {
	constructor() {
		this.message = "Привет стример, спасибо за контент. Сосал?";
		this.username = "Аноним";
		this.voice = 7;
		this.fish = [];
		this.memes = [];
		this.greenScreen = null; // { id, timing }
		this.volume = 0.5;

		// Modal selection state
		this.selectedFishId = null;
		this.selectedMemeId = null;
		this.selectedGreenId = null;

		// Change listeners
		this._listeners = [];
	}

	onChange(fn) {
		this._listeners.push(fn);
	}

	notifyChange() {
		for (const fn of this._listeners) fn();
	}
}
