// js/builder-modals.js
// Modal open/close/populate logic for the donation builder

class ModalManager {
	constructor(state) {
		this.state = state;
		this.memeConfirmPending = false;
		this.greenConfirmPending = false;
		this.greenPreviewAudio = null;

		// DOM references
		this.modalFish = document.getElementById('modal-fish');
		this.modalMeme = document.getElementById('modal-meme');
		this.modalGreen = document.getElementById('modal-green');
		this.btnConfirmMeme = document.getElementById('btn-confirm-meme');
		this.btnConfirmGreen = document.getElementById('btn-confirm-green');

		this._initCloseButtons();
		this._initFishModal();
		this._initMemeModal();
		this._initGreenModal();
	}

	_cleanupHoverVideos() {
		document.querySelectorAll('.modal-asset .hover-video').forEach(v => {
			v.pause();
			v.removeAttribute('src');
			v.load();
			v.remove();
		});
		document.querySelectorAll('.modal-asset').forEach(el => el.classList.remove('loading-video'));
	}

	_initCloseButtons() {
		document.querySelectorAll('.modal-close').forEach(btn => {
			btn.onclick = () => {
				this.modalFish.classList.add('hidden');
				this.modalMeme.classList.add('hidden');
				this.modalGreen.classList.add('hidden');
				document.getElementById('modal-info').classList.add('hidden');
				document.getElementById('meme-preview-player').pause();
				const greenPlayer = document.getElementById('green-preview-player');
				greenPlayer.pause();
				if (this.greenPreviewAudio) { this.greenPreviewAudio.pause(); this.greenPreviewAudio = null; }
				this._cleanupHoverVideos();
			};
		});

		document.getElementById('btn-how-it-works').addEventListener('click', () => {
			document.getElementById('modal-info').classList.remove('hidden');
		});
	}

	// ==================== FISH MODAL ====================

	_initFishModal() {
		document.getElementById('open-fish-modal').onclick = () => {
			this.openFishModal();
		};
	}

	// The fish modal is grid-only: a click picks the fish and closes it, so
	// there is no preview pane and no confirm button (both existed in an
	// older layout). Touching them here used to throw halfway through the
	// opener — the modal appeared but nothing after this point ran.
	openFishModal() {
		this.modalFish.classList.remove('hidden');
		GridPopulator.populateFishGrid();

		const modalTitle = this.modalFish.querySelector('h2');
		modalTitle.textContent = "Добавить Рыбку";
		this.state.selectedFishId = null;

		document.querySelectorAll('#fish-grid .modal-asset').forEach(el => el.classList.remove('selected'));
	}

	selectFishItem(id) {
		this.state.fish = [{ id }];
		this.state.notifyChange();
		this.modalFish.classList.add('hidden');
	}

	// ==================== MEME MODAL ====================

	_initMemeModal() {
		const btnOpen = document.getElementById('open-meme-modal');
		btnOpen.onclick = (e) => {
			e.stopPropagation();
			if (this.state.greenScreen && !this.memeConfirmPending) {
				this.memeConfirmPending = true;
				btnOpen.innerHTML = '<span class="material-icons">help_outline</span>';
				btnOpen.className = 'btn-icon-confirm';
				const resetHandler = () => { this._resetMemeConfirm(); document.removeEventListener('click', resetHandler); };
				setTimeout(() => document.addEventListener('click', resetHandler, { once: true }), 0);
				return;
			}
			this.memeConfirmPending = false;
			this.openMemeModal();
		};

		this.btnConfirmMeme.onclick = () => {
			const timingEl = document.querySelector('input[name="meme-timing"]:checked');
			const timing = timingEl ? timingEl.value : 'b';
			const id = this.state.selectedMemeId;
			this.state.memes = [{ id, timing }];
			this.state.greenScreen = null; // Mutually exclusive
			this.state.notifyChange();
			// Confirming is what counts as "using" it — browsing the grid does
			// not. Mark the cell now so it reads as used the moment the modal
			// is reopened, not only on the donator's next visit.
			if (MemeHistory.add(id)) {
				const cell = document.querySelector(`#meme-grid .modal-asset[data-item-id="${id}"]`);
				if (cell) cell.classList.add('used');
			}
			document.getElementById('meme-preview-player').pause();
			this._cleanupHoverVideos();
			this.modalMeme.classList.add('hidden');
		};

		// Volume slider in meme modal
		const elMemeVolumeSlider = document.getElementById('meme-volume-slider');
		if (elMemeVolumeSlider) {
			elMemeVolumeSlider.addEventListener('input', (e) => {
				this._syncVolume(e.target.value);
				const video = document.getElementById('meme-preview-player');
				if (video) video.volume = this.state.volume;
			});
		}
	}

	_resetMemeConfirm() {
		this.memeConfirmPending = false;
		const btn = document.getElementById('open-meme-modal');
		if (this.state.memes.length > 0) {
			btn.innerHTML = '<span class="material-icons">edit</span>';
			btn.className = 'btn-icon-edit';
		} else {
			btn.innerHTML = '<span class="material-icons">add</span>';
			btn.className = 'btn-icon-add';
		}
	}

	openMemeModal() {
		this.modalMeme.classList.remove('hidden');
		GridPopulator.populateMemeGrid(this);

		const modalTitle = this.modalMeme.querySelector('h2');
		modalTitle.textContent = "Театр Мемов";
		this.btnConfirmMeme.textContent = "ДОБАВИТЬ МЕМ";
		this.state.selectedMemeId = null;
		document.querySelectorAll('#meme-grid .modal-asset').forEach(el => el.classList.remove('selected'));
		const video = document.getElementById('meme-preview-player');
		video.src = "";
		document.querySelector('.video-overlay-text').style.display = 'block';
		this.btnConfirmMeme.disabled = true;

		document.getElementById('time-b').checked = true;

		const memeOverride = document.getElementById('meme-override-indicator');
		if (this.state.greenScreen) {
			memeOverride.style.display = 'flex';
			memeOverride.innerHTML = `
				<div class="override-thumb-wrap">
					<video src="greenScreenMemes/v${this.state.greenScreen.id}.webm" autoplay muted loop playsinline></video>
					<span class="override-x-mark">✕</span>
				</div>
				<span class="material-icons override-arrow">arrow_forward</span>
				<span class="override-new-label">●</span>
			`;
		} else {
			memeOverride.style.display = 'none';
		}
	}

	selectMemeItem(id) {
		this.state.selectedMemeId = id;
		const isMobile = window.innerWidth <= 900;
		const items = document.querySelectorAll('#meme-grid .modal-asset');
		items.forEach(el => {
			el.classList.remove('selected');
			// Clean up any active hover videos
			const hv = el.querySelector('.hover-video');
			if (hv) {
				hv.pause();
				hv.removeAttribute('src');
				hv.load();
				hv.remove();
			}
			el.classList.remove('loading-video');
		});

		// Look the cell up by id, NOT by position: the meme grid is shuffled
		// on every page load, so items[id - 1] is a different meme entirely.
		const cell = document.querySelector(`#meme-grid .modal-asset[data-item-id="${id}"]`);
		if (cell) {
			cell.classList.add('selected');

			// On mobile, keep a looping video in the selected cell since there's no hover
			if (isMobile) {
				const cellVid = document.createElement('video');
				cellVid.className = 'hover-video';
				cellVid.src = `memes/meme${id}.webm`;
				cellVid.muted = false;
				cellVid.volume = this.state.volume !== undefined ? this.state.volume : 0.5;
				cellVid.loop = true;
				cellVid.playsInline = true;
				cellVid.autoplay = true;
				cell.appendChild(cellVid);
				cellVid.play().catch(e => console.log("Mobile meme cell video play error", e));
			}
		}

		const video = document.getElementById('meme-preview-player');
		video.src = `memes/meme${id}.webm`;
		if (isMobile) {
			video.pause();
		} else {
			video.muted = false;
			video.volume = this.state.volume;
			video.play().catch(e => console.log("Video preview error", e));
		}

		document.querySelector('.video-overlay-text').style.display = 'none';
		this.btnConfirmMeme.disabled = false;
	}

	// ==================== GREEN SCREEN MODAL ====================

	_initGreenModal() {
		const btnOpen = document.getElementById('open-green-modal');
		btnOpen.onclick = (e) => {
			e.stopPropagation();
			if (this.state.memes.length > 0 && !this.greenConfirmPending) {
				this.greenConfirmPending = true;
				btnOpen.innerHTML = '<span class="material-icons">help_outline</span>';
				btnOpen.className = 'btn-icon-confirm';
				const resetHandler = () => { this._resetGreenConfirm(); document.removeEventListener('click', resetHandler); };
				setTimeout(() => document.addEventListener('click', resetHandler, { once: true }), 0);
				return;
			}
			this.greenConfirmPending = false;
			this.openGreenModal();
		};

		this.btnConfirmGreen.onclick = () => {
			const timingEl = document.querySelector('input[name="green-timing"]:checked');
			const timing = timingEl ? timingEl.value : 'b';
			this.state.greenScreen = { id: this.state.selectedGreenId, timing };
			this.state.memes = []; // Mutually exclusive
			this.state.notifyChange();

			const video = document.getElementById('green-preview-player');
			video.pause();
			if (this.greenPreviewAudio) { this.greenPreviewAudio.pause(); this.greenPreviewAudio = null; }
			this._cleanupHoverVideos();
			this.modalGreen.classList.add('hidden');
		};

		// Volume slider in green modal
		const elGreenVolumeSlider = document.getElementById('green-volume-slider');
		if (elGreenVolumeSlider) {
			elGreenVolumeSlider.addEventListener('input', (e) => {
				this._syncVolume(e.target.value);
				if (this.greenPreviewAudio) this.greenPreviewAudio.volume = this.state.volume;
			});
		}
	}

	_resetGreenConfirm() {
		this.greenConfirmPending = false;
		const btn = document.getElementById('open-green-modal');
		if (this.state.greenScreen) {
			btn.innerHTML = '<span class="material-icons">edit</span>';
			btn.className = 'btn-icon-edit';
		} else {
			btn.innerHTML = '<span class="material-icons">add</span>';
			btn.className = 'btn-icon-add';
		}
	}

	openGreenModal() {
		this.modalGreen.classList.remove('hidden');
		GridPopulator.populateGreenGrid(this);

		const modalTitle = this.modalGreen.querySelector('h2');
		modalTitle.textContent = "Хромокеи";
		this.btnConfirmGreen.textContent = "ДОБАВИТЬ ХРОМОКЕЙ";
		this.state.selectedGreenId = null;
		document.querySelectorAll('#green-grid .modal-asset').forEach(el => el.classList.remove('selected'));
		const video = document.getElementById('green-preview-player');
		video.src = "";
		document.querySelector('.green-overlay-text').style.display = 'block';
		this.btnConfirmGreen.disabled = true;

		if (this.greenPreviewAudio) { this.greenPreviewAudio.pause(); this.greenPreviewAudio = null; }

		document.getElementById('green-time-b').checked = true;

		const elGreenVolumeSlider = document.getElementById('green-volume-slider');
		if (elGreenVolumeSlider) elGreenVolumeSlider.value = this.state.volume;

		const greenOverride = document.getElementById('green-override-indicator');
		if (this.state.memes.length > 0) {
			const m = this.state.memes[0];
			greenOverride.style.display = 'flex';
			greenOverride.innerHTML = `
				<div class="override-thumb-wrap">
					<video src="memes/meme${m.id}.webm" autoplay muted loop playsinline></video>
					<span class="override-x-mark">✕</span>
				</div>
				<span class="material-icons override-arrow">arrow_forward</span>
				<span class="override-new-label">●</span>
			`;
		} else {
			greenOverride.style.display = 'none';
		}
	}

	selectGreenItem(id) {
		this.state.selectedGreenId = id;
		const isMobile = window.innerWidth <= 900;
		const items = document.querySelectorAll('#green-grid .modal-asset');
		items.forEach(el => {
			el.classList.remove('selected');
			// Clean up any active hover videos
			const hv = el.querySelector('.hover-video');
			if (hv) {
				hv.pause();
				hv.removeAttribute('src');
				hv.load();
				hv.remove();
			}
			el.classList.remove('loading-video');
		});

		// By id, matching the meme grid — the green grid is not shuffled today,
		// but position-based lookup is the kind of assumption that breaks
		// silently the moment it is.
		const cell = document.querySelector(`#green-grid .modal-asset[data-item-id="${id}"]`);
		if (cell) {
			cell.classList.add('selected');

			// On mobile, keep a looping video in the selected cell since there's no hover
			if (isMobile) {
				const cellVid = document.createElement('video');
				cellVid.className = 'hover-video';
				cellVid.src = `greenScreenMemes/v${id}.webm`;
				cellVid.muted = false;
				cellVid.volume = this.state.volume !== undefined ? this.state.volume : 0.5;
				cellVid.loop = true;
				cellVid.playsInline = true;
				cellVid.autoplay = true;
				cell.appendChild(cellVid);
				cellVid.play().catch(() => {});
			}
		}

		if (this.greenPreviewAudio) { this.greenPreviewAudio.pause(); this.greenPreviewAudio = null; }

		const video = document.getElementById('green-preview-player');
		video.src = `greenScreenMemes/v${id}.webm`;
		if (isMobile) {
			video.pause();
		} else {
			video.muted = true;
			video.play().catch(e => console.log("Green preview error", e));
		}

		this.greenPreviewAudio = new Audio(`greenScreenMemes/v${id}.wav`);
		this.greenPreviewAudio.volume = this.state.volume;
		this.greenPreviewAudio.loop = true;
		this.greenPreviewAudio.play().catch(e => console.log("Green audio preview error", e));

		document.querySelector('.green-overlay-text').style.display = 'none';
		this.btnConfirmGreen.disabled = false;
	}

	// ==================== VOLUME SYNC ====================

	_syncVolume(val) {
		this.state.volume = parseFloat(val);
		const elGlobalVolume = document.getElementById('global-volume');
		const elMemeVolumeSlider = document.getElementById('meme-volume-slider');
		if (elGlobalVolume) elGlobalVolume.value = this.state.volume;
		if (elMemeVolumeSlider) elMemeVolumeSlider.value = this.state.volume;
	}

	// ==================== DASHBOARD LISTS ====================

	renderDashboardLists() {
		const state = this.state;
		const btnFishAdd = document.getElementById('open-fish-modal');
		const btnMemeAdd = document.getElementById('open-meme-modal');
		const btnGreenAdd = document.getElementById('open-green-modal');
		const elFishList = document.getElementById('fish-list-container');
		const elMemeList = document.getElementById('meme-list-container');
		const elGreenList = document.getElementById('green-list-container');

		// FISH LIST
		elFishList.innerHTML = '';
		if (state.fish.length === 0) {
			elFishList.innerHTML = '<span class="empty-text">Рыбка не выбрана</span>';
			btnFishAdd.innerHTML = '<span class="material-icons">add</span>';
			btnFishAdd.className = 'btn-icon-add';
		} else {
			btnFishAdd.innerHTML = '<span class="material-icons">edit</span>';
			btnFishAdd.className = 'btn-icon-edit';
			state.fish.forEach((f, idx) => {
				const card = document.createElement('div');
				card.className = 'item-card fish-card';
				card.innerHTML = `
					<div style="display:flex; align-items:center; gap: 10px; overflow:hidden;">
						<div style="flex-shrink: 0; width: 40px; height: 40px; background: #222; border-radius: 4px; display:flex; justify-content:center; align-items:center;">
							<img src="fish/fish${f.id}.png" style="max-width:32px; max-height:32px; object-fit:contain;">
						</div>
						<div class="item-info" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
							<span class="item-title">Рыбка #${f.id}</span>
						</div>
					</div>
					<div class="item-actions">
						<button class="btn-mini del" title="Удалить"><span class="material-icons">close</span></button>
					</div>
				`;
				card.querySelector('.del').onclick = () => {
					state.fish.splice(idx, 1);
					state.notifyChange();
				};
				elFishList.appendChild(card);
			});
		}

		// MEME LIST
		elMemeList.innerHTML = '';
		if (state.memes.length === 0) {
			elMemeList.innerHTML = '<span class="empty-text">Мем не выбран</span>';
			btnMemeAdd.innerHTML = '<span class="material-icons">add</span>';
			btnMemeAdd.className = 'btn-icon-add';
		} else {
			btnMemeAdd.innerHTML = '<span class="material-icons">edit</span>';
			btnMemeAdd.className = 'btn-icon-edit';
			state.memes.forEach((m, idx) => {
				const card = document.createElement('div');
				card.className = 'item-card meme-card';
				let timeLabel = "ДО СООБЩЕНИЯ";
				if (m.timing === 'a') timeLabel = "В КОНЦЕ СООБЩЕНИЯ";
				card.innerHTML = `
					<div style="display:flex; align-items:center; gap: 10px; overflow:hidden;">
						<div style="flex-shrink: 0; width: 80px; height: 45px; background: #000; border-radius: 4px; overflow:hidden; display:flex; align-items:center; justify-content:center;">
							<video src="memes/meme${m.id}.webm" style="width:100%; height:100%; object-fit:cover;" autoplay loop muted></video>
						</div>
						<div class="item-info" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
							<span class="item-meta" style="font-weight:bold; color:#fff;">${timeLabel}</span>
						</div>
					</div>
					<div class="item-actions">
						<button class="btn-mini del" title="Удалить"><span class="material-icons">close</span></button>
					</div>
				`;
				card.querySelector('.del').onclick = () => {
					state.memes.splice(idx, 1);
					state.notifyChange();
				};
				elMemeList.appendChild(card);
			});
		}

		// GREEN SCREEN LIST
		elGreenList.innerHTML = '';
		if (!state.greenScreen) {
			elGreenList.innerHTML = '<span class="empty-text">Хромокей не выбран</span>';
			btnGreenAdd.innerHTML = '<span class="material-icons">add</span>';
			btnGreenAdd.className = 'btn-icon-add';
		} else {
			btnGreenAdd.innerHTML = '<span class="material-icons">edit</span>';
			btnGreenAdd.className = 'btn-icon-edit';
			const g = state.greenScreen;
			const card = document.createElement('div');
			card.className = 'item-card meme-card';
			let timeLabel = "ДО СООБЩЕНИЯ";
			if (g.timing === 'a') timeLabel = "В КОНЦЕ СООБЩЕНИЯ";
			card.innerHTML = `
				<div style="display:flex; align-items:center; gap: 10px; overflow:hidden;">
					<div style="flex-shrink: 0; width: 80px; height: 45px; background: #000; border-radius: 4px; overflow:hidden; display:flex; align-items:center; justify-content:center;">
						<video src="greenScreenMemes/v${g.id}.webm" style="width:100%; height:100%; object-fit:cover;" autoplay loop muted></video>
					</div>
					<div class="item-info" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
						<span class="item-title" style="color:#4CAF50;">Хромокей #${g.id}</span>
						<span class="item-meta" style="font-weight:bold; color:#fff;">${timeLabel}</span>
					</div>
				</div>
				<div class="item-actions">
					<button class="btn-mini del" title="Удалить"><span class="material-icons">close</span></button>
				</div>
			`;
			card.querySelector('.del').onclick = () => {
				state.greenScreen = null;
				state.notifyChange();
			};
			elGreenList.appendChild(card);
		}
	}
}

// ==================== GRID POPULATOR (static factory) ====================
// Optimized: Uses thumbnail images + lazy loading + deferred video on hover.
// Videos are NOT loaded until the user hovers over a specific cell.

class GridPopulator {

	// Shared IntersectionObserver for lazy-loading thumbnail images
	static _lazyObserver = null;

	static _getLazyObserver() {
		if (!GridPopulator._lazyObserver) {
			GridPopulator._lazyObserver = new IntersectionObserver((entries) => {
				entries.forEach(entry => {
					if (entry.isIntersecting) {
						const img = entry.target;
						if (img.dataset.src) {
							img.src = img.dataset.src;
							img.removeAttribute('data-src');
						}
						GridPopulator._lazyObserver.unobserve(img);
					}
				});
			}, {
				rootMargin: '200px', // Start loading 200px before visible
				threshold: 0.01
			});
		}
		return GridPopulator._lazyObserver;
	}

	/**
	 * Creates a thumbnail element for a grid cell.
	 * Uses a .webp thumbnail if available, falls back to a styled placeholder.
	 * @param {string} thumbSrc - Path to thumbnail image
	 * @param {number} index - Item index for placeholder text
	 * @returns {HTMLElement}
	 */
	static _createThumbnail(thumbSrc, index) {
		const img = document.createElement('img');
		img.className = 'thumb-img';
		img.alt = `#${index}`;
		img.dataset.src = thumbSrc; // Lazy-loaded via IntersectionObserver
		img.loading = 'lazy';

		// On error (thumbnail doesn't exist), replace with placeholder
		img.onerror = () => {
			const placeholder = document.createElement('div');
			placeholder.className = 'thumb-placeholder';
			placeholder.innerHTML = `<span class="material-icons placeholder-icon">smart_display</span>`;
			if (img.parentElement) {
				img.parentElement.replaceChild(placeholder, img);
			}
		};

		return img;
	}

	/** Fisher-Yates, on a copy. */
	static _shuffled(items) {
		const out = items.slice();
		for (let i = out.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[out[i], out[j]] = [out[j], out[i]];
		}
		return out;
	}

	/**
	 * Generic grid populator factory — optimized version.
	 * @param {string} gridId - DOM id of the grid container
	 * @param {number} count - total number of items
	 * @param {string} thumbPathTemplate - Template for thumbnail path, e.g. "memes/thumbs/meme{N}.webp"
	 * @param {string} videoPathTemplate - Template for video path, e.g. "memes/meme{N}.webm"
	 * @param {Function} onClick - (index) => void click handler
	 * @param {string} searchInputId - DOM id of the search input for filtering
	 * @param {object} [opts] - {shuffle, history}
	 *   shuffle: draw the grid in a random order instead of 1..N. Built ONCE
	 *     per page load, so the order holds while the modal is reopened but
	 *     is different on the donator's next visit — with 250 memes, a fixed
	 *     order means everyone only ever sees the first few dozen.
	 *   history: an AssetHistory whose ids get the "уже использован" mark.
	 */
	static _populateLazy(gridId, count, thumbPathTemplate, videoPathTemplate, onClick, searchInputId, opts = {}) {
		const grid = document.getElementById(gridId);
		if (grid.children.length > 0) {
			// Grid already populated — just reset search filter
			GridPopulator._initSearch(searchInputId, gridId);
			return;
		}

		const frag = document.createDocumentFragment();
		const observer = GridPopulator._getLazyObserver();

		const order = Array.from({ length: count }, (_, k) => k + 1);
		const ids = opts.shuffle ? GridPopulator._shuffled(order) : order;

		for (const i of ids) {
			const div = document.createElement('div');
			div.className = 'modal-asset';
			div.dataset.itemId = i;
			if (opts.history && opts.history.has(i)) div.classList.add('used');

			// Create thumbnail (lazy-loaded image)
			const thumbSrc = thumbPathTemplate.replace('{N}', i);
			const thumb = GridPopulator._createThumbnail(thumbSrc, i);
			div.appendChild(thumb);

			// ID badge + "already used" ribbon (CSS shows the ribbon only on .used)
			div.innerHTML += `<span class="id-badge">${i}</span>`
				+ `<span class="used-badge">УЖЕ БЫЛ</span>`;

			// Hover: load and play video on demand
			let hoverVideo = null;
			let hoverTimeout = null;

			div.onmouseenter = () => {
				// Small delay to avoid loading videos during fast scrolling
				hoverTimeout = setTimeout(() => {
					if (!hoverVideo) {
						hoverVideo = document.createElement('video');
						hoverVideo.className = 'hover-video';
						hoverVideo.muted = true;
						hoverVideo.loop = true;
						hoverVideo.playsInline = true;
						hoverVideo.preload = 'auto';
					}
					const videoSrc = videoPathTemplate.replace('{N}', i);
					hoverVideo.src = videoSrc;
					div.classList.add('loading-video');
					div.appendChild(hoverVideo);

					hoverVideo.addEventListener('canplay', function onCanPlay() {
						div.classList.remove('loading-video');
						hoverVideo.removeEventListener('canplay', onCanPlay);
					});

					hoverVideo.play().catch(() => {
						div.classList.remove('loading-video');
					});
				}, 150); // 150ms delay prevents loading during fast scroll
			};

			div.onmouseleave = () => {
				clearTimeout(hoverTimeout);
				div.classList.remove('loading-video');
				// On mobile, keep video playing if cell is selected
				if (div.classList.contains('selected')) return;
				if (hoverVideo && hoverVideo.parentElement) {
					hoverVideo.pause();
					hoverVideo.removeAttribute('src');
					hoverVideo.load(); // Free memory
					hoverVideo.remove();
				}
			};

			div.onclick = () => onClick(i);

			// Observe the thumbnail for lazy loading
			const imgEl = div.querySelector('.thumb-img');
			if (imgEl) observer.observe(imgEl);

			frag.appendChild(div);
		}
		grid.appendChild(frag);

		// Set up search filtering
		GridPopulator._initSearch(searchInputId, gridId);
	}

	/**
	 * Initializes search/filter for a grid.
	 */
	static _initSearch(searchInputId, gridId) {
		const searchInput = document.getElementById(searchInputId);
		if (!searchInput) return;

		// Remove previous listener if any (re-opening modal)
		const newInput = searchInput.cloneNode(true);
		searchInput.parentNode.replaceChild(newInput, searchInput);
		newInput.value = '';

		newInput.addEventListener('input', () => {
			const query = newInput.value.trim();
			const grid = document.getElementById(gridId);
			const items = grid.querySelectorAll('.modal-asset');

			items.forEach(item => {
				const id = item.dataset.itemId;
				if (!query || id.includes(query)) {
					item.classList.remove('hidden-by-search');
				} else {
					item.classList.add('hidden-by-search');
				}
			});
		});
	}

	static populateFishGrid() {
		const totalFish = CONFIG.FISH.TEXTURE_COUNT || 167;
		// Fish uses images natively — keep the original approach but with lazy loading
		const grid = document.getElementById('fish-grid');
		if (grid.children.length > 0) return;

		const frag = document.createDocumentFragment();
		for (let i = 1; i <= totalFish; i++) {
			const div = document.createElement('div');
			div.className = 'modal-asset';
			const img = document.createElement('img');
			img.src = `fish/fish${i}.png`;
			img.loading = 'lazy';
			div.appendChild(img);
			div.innerHTML += `<span class="id-badge">${i}</span>`;
			div.onclick = () => {
				if (window._builderModals) window._builderModals.selectFishItem(i);
			};
			frag.appendChild(div);
		}
		grid.appendChild(frag);
	}

	static populateMemeGrid(modalManager) {
		// Was hardcoded to 218 and ignored CONFIG entirely, so new memes stayed
		// invisible here even after the config was bumped.
		const totalMemes = (CONFIG.MEMES && CONFIG.MEMES.COUNT) || 1;
		GridPopulator._populateLazy(
			'meme-grid',
			totalMemes,
			'memes/thumbs/meme{N}.webp',
			'memes/meme{N}.webm',
			(i) => {
				if (window._builderModals) window._builderModals.selectMemeItem(i);
			},
			'meme-search',
			{ shuffle: true, history: MemeHistory }
		);
	}

	static populateGreenGrid(modalManager) {
		const totalGreens = CONFIG.GREEN_SCREEN.COUNT || 13;
		GridPopulator._populateLazy(
			'green-grid',
			totalGreens,
			'greenScreenMemes/thumbs/v{N}.webp',
			'greenScreenMemes/v{N}.webm',
			(i) => {
				if (window._builderModals) window._builderModals.selectGreenItem(i);
			},
			'green-search'
		);
	}
}
