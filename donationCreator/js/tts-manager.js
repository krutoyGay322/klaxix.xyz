// js/tts-manager.js

// All official ElevenLabs v3 emotional context tags
const EMOTION_TAGS = [
    // 🎭 Core Emotional States
    '[happy]', '[happily]', '[sad]', '[sorrowful]', '[angry]', '[excited]',
    '[nervous]', '[nervously]', '[frustrated]', '[calm]', '[tired]',
    '[curious]', '[sarcastic]', '[mischievously]', '[shaken]', '[awe]',
    // 🗣️ Tone & Attitude Cues
    '[cheerfully]', '[cheerful]', '[flatly]', '[deadpan]', '[playfully]',
    '[firm]', '[resigned tone]', '[dramatic tone]',
    // 🔊 Volume & Vocal Intensity
    '[whispers]', '[whisper]', '[whispering]', '[shouts]', '[shouting]',
    '[quietly]', '[loudly]',
    // ⏱️ Delivery Flow & Pacing
    '[rushed]', '[drawn out]', '[fast]', '[slow]', '[hesitates]',
    '[stammers]', '[interrupting]', '[overlapping]',
    // 😭 Emotional Vocalizations — Sorrow
    '[crying]', '[cry]', '[tear up]', '[sob]', '[sobs]', '[wail]',
    // 😭 Emotional Vocalizations — Amusement
    '[laughs]', '[laughing]', '[laughs harder]', '[starts laughing]',
    '[hysterical laughing]', '[big laugh]', '[light chuckle]',
    '[giggle]', '[giggles]', '[snorts]', '[wheezing]',
    // 😭 Emotional Vocalizations — Tension/Relief
    '[sigh]', '[sighs]', '[heavy sigh]', '[breathy sigh]',
    '[sigh of relief]', '[exhales]', '[gasp]', '[gasps]', '[gulp]',
    '[gulps]', '[swallows]',
    // 🎙️ Experimental Delivery Styles
    '[sings]', '[singing]'
];

class TTSManager {
    /** @param {AudioBus} [bus] shared audio bus. The builder passes none and
     *  gets a local one with no host bridge, so its previews stay in the
     *  builder's own window. */
    constructor(bus = null) {
        this.proxyUrl = CONFIG.TTS.PROXY_URL || '/tts';
        this.voices = CONFIG.TTS.VOICES || {};
        this.modelId = CONFIG.TTS.MODEL_ID;
        this.enabled = CONFIG.TTS.ENABLED;
        this.bus = bus || new AudioBus(typeof hostAudio !== 'undefined' ? hostAudio : null);
        this.currentAvatarSequenceId = 0;
        // blob URL -> the Blob behind it. The synthesized voice exists only
        // in this page, so host playback (js/host-audio.js) has to upload the
        // bytes; keeping them here lets playSpeech() do that without changing
        // the {introUrl, messageUrl} contract every caller already uses.
        this._blobs = new Map();
    }

    /** Remember the bytes behind a blob URL (bounded — a donation that dies
     *  before playback must not pin its audio in memory forever). */
    _rememberBlob(url, blob) {
        this._blobs.set(url, blob);
        while (this._blobs.size > 8) {
            this._blobs.delete(this._blobs.keys().next().value);
        }
    }

    /**
     * Returns a random ElevenLabs v3 emotion tag from the master list
     */
    _getRandomEmotionTag() {
        return EMOTION_TAGS[Math.floor(Math.random() * EMOTION_TAGS.length)];
    }

    static localizeCurrency(currency) {
        const CURRENCY_MAP = {
            'RUB': 'Рублей',
            'USD': 'Долларов',
            'EUR': 'Евро',
            'UAH': 'Гривен',
            'KZT': 'Тенге',
            'BYN': 'Белорусских рублей'
        };
        return CURRENCY_MAP[(currency || '').toUpperCase()] || currency;
    }

    /**
     * Synthesize one text via the local proxy. Returns a blob URL or null.
     * A cancelled show aborts the request instead of paying for speech that
     * will never be played.
     */
    async _makeSpeechRequest(text, targetVoiceId, ctx = null) {
        if (!text) return null;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        if (ctx) ctx.defer(() => controller.abort());
        try {
            const response = await fetch(this.proxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    voiceId: targetVoiceId,
                    modelId: this.modelId
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`TTS proxy error: ${response.status}`);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            this._rememberBlob(url, blob);
            return url;
        } catch (err) {
            clearTimeout(timeoutId);
            throw err;
        }
    }

    async preloadSpeech(ttsText, voiceIdx = 1, username = 'Аноним', amount = 0, currency = 'RUB', ctx = null) {
        if (!this.enabled) {
            return null;
        }

        const isEmptyMessage = !ttsText || ttsText.trim().length === 0;

        const localizedCurrency = TTSManager.localizeCurrency(currency);

        // Build the split TTS segments
        const displayAmount = Number.isInteger(amount) ? amount : Math.round(amount);

        // Pick a random emotion tag to prepend to the message (hidden from UI)
        const emotionTag = this._getRandomEmotionTag();
        console.log(`[TTS] Random emotion tag selected: ${emotionTag}`);

        let introText;
        let messageText;

        if (isEmptyMessage) {
            introText = `Пользователь ${username} отправил ${displayAmount} ${localizedCurrency}`;
            messageText = emotionTag + " И Ничего не написал потому что он СИГМА" + " ЪЪЪЪЪ";
        } else {
            introText = `Пользователь ${username} отправил ${displayAmount} ${localizedCurrency} и написал:`;
            messageText = emotionTag + " " + ttsText.trim() + " ЪЪЪЪЪ";
        }

        console.log(`[TTS] Generating voices (${voiceIdx}) for Intro and Message.`);

        try {
            const targetVoiceId = this.voices[voiceIdx] || this.voices[1];

            // Synthesis goes through the local proxy (/tts) so the
            // ElevenLabs API key never reaches the browser.
            // Fetch both in parallel
            const [introUrl, messageUrl] = await Promise.all([
                this._makeSpeechRequest(introText, targetVoiceId, ctx),
                this._makeSpeechRequest(messageText, targetVoiceId, ctx)
            ]);

            // Synthesized audio must not outlive the donation that paid for
            // it, whether it gets played or the show dies first.
            if (ctx) {
                ctx.defer(() => this._forget(introUrl));
                ctx.defer(() => this._forget(messageUrl));
            }
            return { introUrl, messageUrl };

        } catch (error) {
            console.error("[TTS] Failed to generate speech:", error);
            return null;
        }
    }

    /**
     * Speak one preloaded segment. Resolves when it has finished playing;
     * rejects (ShowCancelled) if the donation is cancelled mid-sentence,
     * which is what stops an abandoned donation from talking over the next.
     *
     * PRIMARY PATH: the HOST PC plays it (DBDStreaming's MCI player), exactly
     * like the perk-roll voice, tarot and every meme sound — so the donation
     * comes out of the speakers the streamer is listening to instead of
     * living and dying inside OBS's browser source.
     * FALLBACK: in-browser playback (host disabled, DBD app not running, or
     * the upload failed) — the original behavior, unchanged.
     *
     * The channel is named per SHOW and per segment: two donations can no
     * longer land on one channel and cut each other off, while two copies of
     * the SAME donation still share one and de-duplicate through the host.
     *
     * @param {string} audioUrl blob URL from preloadSpeech
     * @param {ShowContext} ctx
     * @param {string} role     'voice-intro' | 'voice-msg'
     */
    async playSpeech(audioUrl, ctx, role = 'voice') {
        if (!audioUrl) return;
        const blob = this._blobs.get(audioUrl);
        this._blobs.delete(audioUrl);

        const volume = TTSManager.voiceVolume();
        // No bytes (only the blob URL survived) — nothing to hand the host,
        // so play it here.
        const handle = blob
            ? await this.bus.playBlob(ctx, role, blob, {
                volume,
                ext: 'mp3',
                browserUrl: audioUrl,
                // Small tail margin: MCI's reported length runs a touch short
                // of the real thing, and the next segment takes over the
                // moment this wait ends — without it the end of the intro
                // gets clipped by the start of the message.
                tailMs: 120
            })
            : this.bus.playInPage(ctx, role, audioUrl, { volume });
        if (!handle) {
            console.warn('[TTS] Nothing could play this segment.');
            this._forget(audioUrl);
            return;
        }
        try {
            await ctx.wait(handle.done, {
                // A voice line that somehow never reports back must not hold
                // the donation forever.
                timeout: Math.max(30000, handle.durationMs + 10000),
                label: 'voice segment'
            });
        } finally {
            this._forget(audioUrl);
        }
    }

    /** Drop a synthesized segment's memory. Safe to call more than once. */
    _forget(audioUrl) {
        if (!audioUrl) return;
        this._blobs.delete(audioUrl);
        try { URL.revokeObjectURL(audioUrl); } catch (e) { /* already revoked */ }
    }

    /** Level for every synthesized line (the donation reader).
     *  Kept in config so it can be matched against the DBD overlay's voices
     *  without touching code. */
    static voiceVolume() {
        const v = CONFIG.HOST_AUDIO && CONFIG.HOST_AUDIO.TTS_VOLUME;
        return (typeof v === 'number' && v >= 0 && v <= 1) ? v : 1.0;
    }

    /** Cut this show's voice off. Host-side audio outlives the page code that
     *  started it, so an abandoned donation must say so explicitly. */
    stopSpeech(ctx) {
        if (ctx) { this.bus.stopShow(ctx); return; }
        this.bus.stopEverything();
    }

    /**
     * Avatar pops up, speaks the intro, speaks the message, leaves.
     * Every wait is show-aware: cancelling the donation unwinds the whole
     * sequence instead of leaving it running in the background.
     *
     * @param {ShowContext} [ctx] omit for a standalone run (builder preview)
     */
    async playAvatarSequence(voiceIdx, introUrl, messageUrl, isMuted = false, delayDuration = 8000, ctx = null) {
        const owned = !ctx;
        const show = ctx || ShowContext.local('voice');
        this.currentAvatarSequenceId++;
        const seqId = this.currentAvatarSequenceId;
        const superseded = () => this.currentAvatarSequenceId !== seqId;

        const charPrefix = CONFIG.TTS.VTUBER_MAP[voiceIdx];
        const vtuberLayer = document.getElementById('vtuber-layer');

        try {
            if (!charPrefix || !vtuberLayer) {
                if (!isMuted) {
                    await this.playSpeech(introUrl, show, 'voice-intro');
                    await this.playSpeech(messageUrl, show, 'voice-msg');
                } else {
                    await show.sleep(delayDuration);
                }
                return;
            }

            // Clean up any existing state immediately
            vtuberLayer.innerHTML = '';
            vtuberLayer.classList.remove('show');

            const img = document.createElement('img');
            img.className = 'vtuber-avatar';
            // The static site ships without the chars/ art — hide the avatar
            // instead of showing a broken-image icon in the preview.
            img.onerror = () => { img.style.display = 'none'; };
            img.src = `chars/${charPrefix}Mute.png`;
            vtuberLayer.appendChild(img);
            // However this show ends, the avatar leaves with it.
            show.defer(() => {
                if (superseded()) return;
                vtuberLayer.classList.remove('show');
                vtuberLayer.innerHTML = '';
            });

            // Pop up (force reflow so the animation replays if it was just
            // removed)
            void vtuberLayer.offsetWidth;
            vtuberLayer.classList.add('show');

            await show.sleep(500);
            if (superseded()) return;

            if (!isMuted && introUrl) {
                await this.playSpeech(introUrl, show, 'voice-intro');
            } else if (isMuted) {
                await show.sleep(2000);   // approximate intro time
            }
            if (superseded()) return;

            img.src = `chars/${charPrefix}Talking.png`;
            img.classList.add('vtuber-talking');

            if (!isMuted && messageUrl) {
                await this.playSpeech(messageUrl, show, 'voice-msg');
            } else if (isMuted) {
                await show.sleep(Math.max(0, delayDuration - 2000));
            }
            if (superseded()) return;

            img.src = `chars/${charPrefix}Mute.png`;
            img.classList.remove('vtuber-talking');
            vtuberLayer.classList.remove('show');

            await show.sleep(800);
            if (!superseded()) vtuberLayer.innerHTML = '';
        } finally {
            if (owned) show.end();
        }
    }
}
