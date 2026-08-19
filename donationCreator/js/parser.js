// js/parser.js

class MessageParser {
	async init() {
		// Word filtering is delegated to TextFilter (js/text-filter.js) —
		// blacklist.txt words become extra bounded stems there, so they get
		// the same evasion-resistant matching (homoglyphs, spacing) as the
		// built-ins instead of the old per-word \b regex that was trivially
		// dodged. The builder page loads the parser WITHOUT TextFilter on
		// purpose (previewing your own text needs no filter) — skip there.
		if (typeof TextFilter === 'undefined') return;
		try {
			const response = await fetch('blacklist.txt');
			if (response.ok) {
				const text = await response.text();
				const words = text.split('\n')
					.map(word => word.trim())
					.filter(word => word.length > 0);
				TextFilter.setExtraWords(words, 'blacklist');
				console.log(`[Parser] Loaded ${words.length} blacklist.txt words into TextFilter`);
			} else {
				console.warn('[Parser] blacklist.txt not found. Using built-in filter stems only.');
			}
		} catch (error) {
			console.error('[Parser] Failed to load blacklist.txt:', error);
		}
	}

	// 1d. Parse Meme Commands (e.g., {m1}, {m1:b})
	parseMemeCommands(rawMessage) {
		rawMessage = rawMessage || '';
		const memeCommands = [];
		const memeMatches = [...rawMessage.matchAll(CONFIG.FISH.MEME_COMMAND_REGEX)];

		if (memeMatches.length > 0) {
			const match = memeMatches[0];
			const id = parseInt(match[1]);
			const innerContent = match[2];

			let timing = 'before';

			if (innerContent) {
				const timingMatch = innerContent.match(CONFIG.FISH.PARAM_REGEX_TIMING);
				if (timingMatch) {
					const code = timingMatch[1];
					if (code === 'b') timing = 'before';
					else if (code === 'a') timing = 'after';
				}
			}

			memeCommands.push({
				id,
				timing
			});
		}
		return memeCommands;
	}

	// 1e. Parse Green Screen Commands (e.g., {g1}, {g3:a})
	parseGreenScreenCommand(rawMessage) {
		rawMessage = rawMessage || '';
		const matches = [...rawMessage.matchAll(CONFIG.FISH.GREEN_COMMAND_REGEX)];

		if (matches.length > 0) {
			const match = matches[0];
			const id = parseInt(match[1]);
			const innerContent = match[2];

			if (id >= 1 && id <= CONFIG.GREEN_SCREEN.COUNT) {
				let timing = 'before';

				if (innerContent) {
					const timingMatch = innerContent.match(CONFIG.FISH.PARAM_REGEX_TIMING);
					if (timingMatch) {
						const code = timingMatch[1];
						if (code === 'b') timing = 'before';
						else if (code === 'a') timing = 'after';
					}
				}

				return { id, timing };
			}
		}
		return null;
	}

	parse(rawMessage, donatorName) {
		rawMessage = rawMessage || '';
		let cleanMessage = rawMessage;
		let ttsMessage = rawMessage;
		let styleId = CONFIG.UI.DEFAULT_STYLE_ID;
		let positionId = CONFIG.UI.DEFAULT_POS;
		const fishCommands = [];

		// 1. Parse Style and Position Tags
		// (Feature removed - defaults to style 1, pos 5)



		// 1c. Parse Voice (e.g., {v2})
		let voiceIdx = null;
		const voiceMatches = [...rawMessage.matchAll(CONFIG.FISH.VOICE_COMMAND_REGEX)];
		if (voiceMatches.length > 0) {
			// Use the last voice tag found
			const lastVoiceMatch = voiceMatches[voiceMatches.length - 1];
			voiceIdx = parseInt(lastVoiceMatch[1]);
		} else {
			// No voice specified — pick a random one
			const voiceKeys = Object.keys(CONFIG.TTS.VOICES);
			voiceIdx = parseInt(voiceKeys[Math.floor(Math.random() * voiceKeys.length)]);
		}

		// 1d. Parse Meme & Green Screen Commands (mutually exclusive)
		const greenScreenCommand = this.parseGreenScreenCommand(rawMessage);
		const memeCommands = greenScreenCommand ? [] : this.parseMemeCommands(rawMessage);

		// 2. Parse Fish Commands (e.g., {f1:s1.2})
		const fishMatches = [...rawMessage.matchAll(CONFIG.FISH.COMMAND_REGEX)];
		if (fishMatches.length > 0) {
			const match = fishMatches[0];
			const id = parseInt(match[1]);
			const innerContent = match[2];

			const sizeMatch = innerContent.match(CONFIG.FISH.PARAM_REGEX_SIZE);
			const rawSize = sizeMatch ? parseFloat(sizeMatch[1]) : CONFIG.FISH.DEFAULT_SIZE;
			const clampedSize = Math.max(CONFIG.FISH.MIN_SIZE, Math.min(rawSize, CONFIG.FISH.MAX_SIZE));

			const nameMatch = innerContent.match(CONFIG.FISH.PARAM_REGEX_NAME);
			const customName = nameMatch ? nameMatch[1].trim() : donatorName;

			const extMatch = innerContent.match(CONFIG.FISH.PARAM_REGEX_EXT);
			const extensionUnits = extMatch ? parseInt(extMatch[1]) : 0;

			if (id >= 1 && id <= CONFIG.FISH.TEXTURE_COUNT) {
				fishCommands.push({
					id,
					size: clampedSize,
					name: customName,
					lifespan: CONFIG.LIFESPAN.BASE_SECONDS * (1 + extensionUnits)
				});
			}
		}

		// 3. Cleanup Message
		cleanMessage = cleanMessage.replace(CONFIG.FISH.COMMAND_REGEX, '');
		cleanMessage = cleanMessage.replace(CONFIG.FISH.STYLE_COMMAND_REGEX, '');
		cleanMessage = cleanMessage.replace(CONFIG.FISH.VOICE_COMMAND_REGEX, '');
		cleanMessage = cleanMessage.replace(CONFIG.FISH.MEME_COMMAND_REGEX, '');
		cleanMessage = cleanMessage.replace(CONFIG.FISH.GREEN_COMMAND_REGEX, '');
		cleanMessage = cleanMessage.replace(/\s\s+/g, ' ').trim();

		ttsMessage = ttsMessage.replace(CONFIG.FISH.COMMAND_REGEX, '');
		ttsMessage = ttsMessage.replace(CONFIG.FISH.STYLE_COMMAND_REGEX, '');
		ttsMessage = ttsMessage.replace(CONFIG.FISH.VOICE_COMMAND_REGEX, '');
		ttsMessage = ttsMessage.replace(CONFIG.FISH.MEME_COMMAND_REGEX, '');
		ttsMessage = ttsMessage.replace(CONFIG.FISH.GREEN_COMMAND_REGEX, '');

		// 4. URL and Link Filtering
		const urlRegex = /https?:\/\/[^\s]+/gi;
		cleanMessage = cleanMessage.replace(urlRegex, '[ссылка]');
		ttsMessage = ttsMessage.replace(urlRegex, '');

		// 5. Banned Word Filter — one evasion-resistant pass (built-in stems
		// + blacklist.txt + DBD extra_words, see init). Display gets the
		// mask; TTS gets the word dropped, like the old behaviour.
		if (CONFIG.CONTENT.ENABLE_FILTER && typeof TextFilter !== 'undefined') {
			cleanMessage = TextFilter.censorText(cleanMessage);
			ttsMessage = TextFilter.censorText(ttsMessage, ' ');
		}

		ttsMessage = ttsMessage.replace(/\s\s+/g, ' ').trim();

		return {
			fishCommands,
			memeCommands,
			greenScreenCommand,
			cleanMessage,
			ttsMessage,
			donatorName,
			styleId,
			positionId,
			voiceIdx
		};
	}
}