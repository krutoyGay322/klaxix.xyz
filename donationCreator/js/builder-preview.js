// js/builder-preview.js
// Preview engine for the donation builder

class PreviewEngine {
	constructor(state) {
		this.state = state;
		this.previewRunId = 0;
		this.previewContainer = document.getElementById('aquarium');
		this.parser = new MessageParser();
		this.fishManager = new FishManager(this.previewContainer);
		this.uiManager = new UIManager();
		this.styleManager = new StyleManager();
		this.memeManager = new MemeManager(this.previewContainer);
		this.ttsManager = new TTSManager();
	}

	async runPreview(isMuted) {
		this.previewRunId++;
		const currentRunId = this.previewRunId;
		const code = document.getElementById('final-code').value;
		const user = this.state.username || "Аноним";

		document.querySelectorAll('#aquarium .fish').forEach(e => e.remove());
		document.querySelectorAll('#aquarium .donation-alert, #ui-layer .donation-alert').forEach(e => e.remove());
		this.memeManager.stopAll();

		const parsedData = this.parser.parse(code, user);

		const beforeMemes = parsedData.memeCommands.filter(t => t.timing === 'before');
		for (const trigger of beforeMemes) {
			if (this.previewRunId !== currentRunId) return;
			await this.memeManager.playMeme(trigger, isMuted, this.state.volume);
		}

		// Green screen before
		if (parsedData.greenScreenCommand && parsedData.greenScreenCommand.timing === 'before') {
			if (this.previewRunId !== currentRunId) return;
			await this.memeManager.playGreenScreen(parsedData.greenScreenCommand, isMuted, this.state.volume);
		}

		if (this.previewRunId !== currentRunId) return;

		if (parsedData.fishCommands.length > 0) this.fishManager.spawnFish(parsedData.fishCommands);

		try {
			await this.styleManager.ensureStyleLoaded(parsedData.styleId);
			if (this.previewRunId !== currentRunId) return;
			this.uiManager.displayDonation(parsedData.donatorName, parsedData.cleanMessage, parsedData.styleId, parsedData.positionId);
		} catch (e) { console.error(e); }

		const waitPromise = new Promise(r => setTimeout(r, CONFIG.UI.MESSAGE_DISPLAY_TIME));
		let ttsPromise = Promise.resolve();

		if (CONFIG.TTS.VTUBER_MAP && CONFIG.TTS.VTUBER_MAP[parsedData.voiceIdx]) {
			ttsPromise = this.ttsManager.playAvatarSequence(parsedData.voiceIdx, null, null, true, CONFIG.UI.MESSAGE_DISPLAY_TIME);
		}

		await Promise.all([ttsPromise, waitPromise]);

		if (this.previewRunId !== currentRunId) return;

		const afterMemes = parsedData.memeCommands.filter(t => t.timing === 'after');
		for (const trigger of afterMemes) {
			if (this.previewRunId !== currentRunId) return;
			await this.memeManager.playMeme(trigger, isMuted, this.state.volume);
		}

		// Green screen after
		if (parsedData.greenScreenCommand && parsedData.greenScreenCommand.timing === 'after') {
			if (this.previewRunId !== currentRunId) return;
			await this.memeManager.playGreenScreen(parsedData.greenScreenCommand, isMuted, this.state.volume);
		}
	}
}
