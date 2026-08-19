// js/builder.js — Thin orchestrator
// Wires together BuilderState, ModalManager, PreviewEngine, and CodeGenerator.

document.addEventListener('DOMContentLoaded', () => {

    // Ask the proxy how many memes/fish/green screens are actually on disk and
    // patch CONFIG before anything reads it. Fire-and-forget: the grids are
    // built lazily when a modal first opens, which is always long after this
    // resolves, and CONFIG's own numbers cover the case where it never does.
    AssetCounts.load();

    // ================= INSTANTIATE MODULES =================
    const state = new BuilderState();
    const codeGen = new CodeGenerator(state);
    const preview = new PreviewEngine(state);
    const modals = new ModalManager(state);

    // Expose modals globally for GridPopulator click callbacks (no bundler)
    window._builderModals = modals;

    const elMsgText = document.getElementById('msg-text');
    const elMsgVoice = document.getElementById('msg-voice');

    // ================= RESIZE LISTENER =================
    function resizePreview() {
        const wrapper = document.getElementById('preview-wrapper');
        const container = document.getElementById('preview-container');
        if (!wrapper || !container) return;
        
        const scaleX = wrapper.clientWidth / 2560;
        const scaleY = wrapper.clientHeight / 1440;
        const scale = Math.min(scaleX, scaleY);
        
        container.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }

    window.addEventListener('resize', resizePreview);
    resizePreview();

    // ================= DEBOUNCED PREVIEW =================
    let debounceTimer = null;

    function triggerChange() {
        codeGen.updateCode();
        setButtonsCopied(false);
        modals.renderDashboardLists();
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            preview.runPreview(true); // Auto-run MUTED
        }, 600);
    }

    // Wire state changes to triggerChange
    state.onChange(() => triggerChange());



    // ================= INPUT LISTENERS =================
    elMsgText.addEventListener('input', (e) => {
        state.message = e.target.value;
        document.getElementById('char-count').textContent = `${e.target.value.length} / 200`;
        triggerChange();
    });



    elMsgVoice.addEventListener('change', (e) => {
        state.voice = e.target.value;
        if (currentPreviewAudio) {
            currentPreviewAudio.pause();
            currentPreviewAudio.currentTime = 0;
            currentPreviewAudio = null;
            resetVoiceButton();
        }
        triggerChange();
    });



    // ================= COPY BUTTON =================
    document.getElementById('btn-copy').addEventListener('click', () => {
        const codeText = document.getElementById('final-code').value;
        navigator.clipboard.writeText(codeText).then(() => {
            setButtonsCopied(true);
        }).catch(() => {
            // Fallback: select and try legacy copy
            document.getElementById('final-code').select();
            try { document.execCommand('copy'); } catch (_) { /* ignore */ }
            setButtonsCopied(true);
        });
    });

    function setButtonsCopied(isCopied) {
        const btnCopy = document.getElementById('btn-copy');
        const btnsSend = [
            document.getElementById('btn-send-ru'),
            document.getElementById('btn-send-eu')
        ];
        if (!btnCopy) return;

        if (isCopied) {
            btnCopy.className = 'btn-copy-code dormant-grey';
            for (const btn of btnsSend) {
                if (btn) btn.className = 'btn-send-donate active-green';
            }
        } else {
            btnCopy.className = 'btn-copy-code active-green';
            for (const btn of btnsSend) {
                if (btn) btn.className = 'btn-send-donate dormant-grey';
            }
        }
    }

    // ================= VOICE PREVIEW =================
    const voiceFiles = {
        1: "Krasue.mp3", 2: "Henry.mp3", 3: "Tiffany.mp3", 4: "NaughtBear.mp3",
        5: "Springtrap.mp3", 6: "Senobit.mp3", 7: "Chucky.mp3", 8: "Wesker.mp3",
        9: "Sable.mp3", 10: "Bubba.mp3", 11: "Rin.mp3", 12: "AdaWong.mp3",
        13: "Kwon.mp3", 14: "Entity.mp3"
    };
    let currentPreviewAudio = null;
    let isVoicePlaying = false;
    const btnPlayVoice = document.getElementById('btn-play-voice');

    function resetVoiceButton() {
        isVoicePlaying = false;
        btnPlayVoice.innerHTML = '<span class="material-icons" style="font-size: 18px;">play_circle</span> ПРОСЛУШАТЬ';
        btnPlayVoice.style.background = '#b14ff5';
    }

    btnPlayVoice.addEventListener('click', () => {
        if (isVoicePlaying && currentPreviewAudio) {
            currentPreviewAudio.pause();
            currentPreviewAudio.currentTime = 0;
            currentPreviewAudio = null;
            resetVoiceButton();
            return;
        }

        const file = voiceFiles[state.voice];
        if (file) {
            currentPreviewAudio = new Audio(`voiceSamples/${file}`);
            currentPreviewAudio.volume = state.volume;
            currentPreviewAudio.addEventListener('ended', () => {
                currentPreviewAudio = null;
                resetVoiceButton();
            }, { once: true });
            currentPreviewAudio.play().then(() => {
                isVoicePlaying = true;
                btnPlayVoice.innerHTML = '<span class="material-icons" style="font-size: 18px;">stop_circle</span> ОСТАНОВИТЬ';
                btnPlayVoice.style.background = '#e53935';
            }).catch(e => {
                console.error("Could not play voice preview:", e);
                resetVoiceButton();
            });
        }
    });

    // ================= VOLUME SYNC =================
    const elGlobalVolume = document.getElementById('global-volume');

    function syncVolume(val) {
        state.volume = parseFloat(val);
        if (elGlobalVolume) elGlobalVolume.value = state.volume;
        const elMemeVolumeSlider = document.getElementById('meme-volume-slider');
        if (elMemeVolumeSlider) elMemeVolumeSlider.value = state.volume;
        if (currentPreviewAudio) {
            currentPreviewAudio.volume = state.volume;
        }
    }

    if (elGlobalVolume) {
        elGlobalVolume.addEventListener('input', (e) => syncVolume(e.target.value));
    }

    // ================= INIT =================
    elMsgText.value = state.message;
    document.getElementById('char-count').textContent = `${state.message.length} / 200`;
    elMsgVoice.value = state.voice;
    codeGen.updateCode();
});