// js/fish-manager.js — the aquarium's inhabitants.
//
// Movement engine (reworked 2026-08-12). A fish steers a HEADING through
// layered sine wander, so it swims in organic arcs instead of straight lines
// with hard wall bounces: it banks its nose into the direction of travel,
// pulses its body with a swim stroke tied to its speed, turns around by
// flipping smoothly through the vertical, hovers in place to catch its
// breath, and winds up before a dash that leaves a bubble trail. Walls repel
// by steering, so a fish curves away from an edge instead of hitting it.
//
// THE FREEZE FIX, do not undo: OBS can stall requestAnimationFrame for
// seconds at a time (or fire it once after a long throttle). The old code
// integrated with an UNCLAMPED delta, so that one frame stepped the fish
// thousands of pixels, clampPosition() pinned it into a corner, and the
// aquarium looked dead while the countdown kept ticking. Deltas are now
// capped per frame, the shared loop survives a fish that throws, lifespan
// runs on the wall clock (no setTimeout to be throttled away), and a fish
// spawned while the source measured 0×0 waits and places itself when the
// tank has a size instead of being born pinned at (0,0).

const FISH_MOVE = {
	MAX_DT: 0.05,           // s; rAF gap above this is a stall, not a frame
	// Real fish cruise LEVEL: depth changes are shallow and slow, not the
	// roller-coaster the first cut of the wander produced.
	MAX_PITCH: 0.3,         // rad (~17°); how steeply a fish may climb or dive
	LEVEL_RATE: 0.6,        // 1/s; pull of the pitch back toward horizontal
	WALL_MARGIN: 110,       // px (design frame) where wall steering starts
	WALL_STEER: 3.2,        // how hard walls bend the heading
	SEPARATION_STEER: 2.0,  // how hard fish avoid overlapping each other
	FLIP_RATE: 7,           // 1/s; how fast the sprite mirrors on turn-around
	HOVER_CHANCE: 0.3,      // a scheduled dash becomes a breather instead
	HOVER_SPEED: 0.1,       // fraction of cruise while hovering
	TRAIL_EVERY: 0.07,      // s between dash-trail bubbles
	DEATH_TIMEOUT: 12,      // s; hard removal backstop for a dead fish
};

class Fish {
	constructor(displayName, fishId, lifespan, size, container) {
		this.container = container;
		this.id = Date.now() + Math.random();
		this.displayName = displayName;
		this.textureId = fishId;
		this.lifespan = lifespan;
		this.sizeMultiplier = size;

		// CONFIG.FISH.WIDTH/HEIGHT are 1920-frame pixels; UI_SCALE (1 in the
		// builder) maps them onto whatever resolution the host renders at.
		this.uiScale = window.UI_SCALE || 1;
		this.width = CONFIG.FISH.WIDTH * this.sizeMultiplier * this.uiScale;
		this.height = CONFIG.FISH.HEIGHT * this.sizeMultiplier * this.uiScale;

		const r = Math.random;
		const f = CONFIG.FISH;

		// ── Motion state ──
		this.x = 0;
		this.y = 0;
		this.heading = (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 0.6;
		this.speed = 0;
		this.cruise = f.IDLE_SPEED * (1.1 + r() * 0.5);
		// Two incommensurate sine layers per fish = meandering, non-repeating
		// paths that are still perfectly smooth.
		this.wanderF1 = 0.22 + r() * 0.3;
		this.wanderF2 = 0.65 + r() * 0.7;
		this.wanderP1 = r() * Math.PI * 2;
		this.wanderP2 = r() * Math.PI * 2;
		this.wanderAmp = 0.9 + r() * 0.7;
		this.bobFreq = 0.8 + r() * 0.7;
		this.bobPhase = r() * Math.PI * 2;
		this.swimPhase = r() * Math.PI * 2;

		// ── Visual state ──
		this.facingCur = Math.cos(this.heading) >= 0 ? 1 : -1;  // lerped, flips through 0
		this.stretchX = 1; this.stretchY = 1;                    // lerped body deformation
		this.targetStretchX = 1; this.targetStretchY = 1;
		this.shakeX = 0;
		this.rotation = 0;                                       // death only
		this.rotationV = 0;
		this.opacity = 1;

		// ── Lifecycle ──
		this.state = 'idle';        // idle | hover | dash | death | destroyed
		this.stateT = 0;            // seconds inside the current state
		this.dashPhase = 'none';    // windup | burst
		this.age = 0;               // accumulated CLAMPED time — drives animation
		this.bornAt = performance.now(); // wall clock — drives lifespan/countdown
		this.nextDashIn = this._dashInterval();
		this.trailT = 0;
		this.bubbleT = 0;
		this.shownSeconds = -1;
		this.updateErrors = 0;

		this.placed = false;
		this.initElement();

		const bounds = this.container.getBoundingClientRect();
		if (bounds.width >= 4 && bounds.height >= 4) this._place(bounds);
	}

	initElement() {
		this.element = document.createElement('div');
		this.element.className = 'fish';
		this.element.style.width = `${this.width}px`;
		this.element.style.visibility = 'hidden'; // until _place()

		// The body rotates (banking, death roll) and scales (swim pulse,
		// squash & stretch, the mirror flip). The nameplate lives OUTSIDE it,
		// so text never tilts with the fish.
		this.body = document.createElement('div');
		this.body.className = 'fish-body';

		this.sprite = document.createElement('img');
		this.sprite.className = 'fish-sprite';
		this.sprite.src = `fish/fish${this.textureId}.png`;
		this.body.appendChild(this.sprite);

		const infoContainer = document.createElement('div');
		infoContainer.className = 'fish-info';

		this.nameLabel = document.createElement('div');
		this.nameLabel.className = 'name-label';
		this.nameLabel.textContent = this.displayName;

		const labelScale = Math.min(1.5, Math.max(0.6, this.sizeMultiplier)) * (window.UI_SCALE || 1);
		this.nameLabel.style.fontSize = `${32 * labelScale}px`;

		this.timerLabel = document.createElement('div');
		this.timerLabel.className = 'timer-label';
		this.timerLabel.style.fontSize = `${29 * labelScale}px`;

		infoContainer.appendChild(this.nameLabel);
		infoContainer.appendChild(this.timerLabel);
		this.element.appendChild(this.body);
		this.element.appendChild(infoContainer);
		this.container.appendChild(this.element);
	}

	/** Give the fish its spot — immediately when the tank has a size, or on
	 *  the first frame where it does (OBS sources can measure 0×0 early). */
	_place(bounds) {
		const maxX = Math.max(0, bounds.width - this.width);
		const maxY = Math.max(0, bounds.height - this.height);
		this.x = Math.random() * maxX;
		this.y = Math.random() * maxY;
		this.placed = true;

		this.element.style.visibility = '';
		// left/top, NOT the `translate` property: independent transform
		// properties need Chromium 104+, and OBS builds carrying CEF 103
		// silently ignore them — the fish then renders pinned at (0,0)
		// forever while the physics runs. left/top works in every CEF.
		this.element.style.left = `${this.x}px`;
		this.element.style.top = `${this.y}px`;
		this.element.classList.add('fish-spawn-animation');
		setTimeout(() => this.element.classList.remove('fish-spawn-animation'), 700);
		playSpawnEffect(this.x + this.width / 2, this.y + this.height / 2,
			this.sizeMultiplier * this.uiScale);
	}

	_dashInterval() {
		const f = CONFIG.FISH;
		return Math.random() * (f.MAX_DASH_INTERVAL - f.MIN_DASH_INTERVAL) + f.MIN_DASH_INTERVAL;
	}

	/** Small decorative bubble at (x, y) in tank coordinates. Reuses the
	 *  .spawn-bubble CSS animation, which also removes it visually; the node
	 *  itself is collected shortly after. */
	_bubble(x, y, size) {
		const b = document.createElement('div');
		b.className = 'spawn-bubble';
		b.style.left = `${x}px`;
		b.style.top = `${y}px`;
		b.style.width = `${size}px`;
		b.style.height = `${size}px`;
		b.style.setProperty('--random-x-end', `${(Math.random() - 0.5) * 60 * this.uiScale}px`);
		b.style.setProperty('--random-y-end', `${(-20 - Math.random() * 60) * this.uiScale}px`);
		b.style.setProperty('--random-scale-end', `${0.15 + Math.random() * 0.3}`);
		this.container.appendChild(b);
		setTimeout(() => b.remove(), 1000);
	}

	// ── Steering helpers ─────────────────────────────────────────────────────

	/** Fish swim LEVEL. The pitch is constantly eased back to horizontal and
	 *  hard-capped at MAX_PITCH, so depth changes are slow, shallow drifts —
	 *  never the up-and-down rollercoaster the raw wander would produce. */
	_shapePitch(dt) {
		const dirX = Math.cos(this.heading);
		const dirY = Math.sin(this.heading);
		let pitch = Math.atan2(dirY, Math.abs(dirX));
		pitch *= Math.exp(-FISH_MOVE.LEVEL_RATE * dt);
		if (Math.abs(pitch) > FISH_MOVE.MAX_PITCH) {
			pitch = Math.sign(pitch) * FISH_MOVE.MAX_PITCH;
		}
		const side = dirX >= 0 ? 1 : -1;
		this.heading = Math.atan2(Math.sin(pitch), Math.cos(pitch) * side);
	}

	/** Blend a steering vector (already weighted) into the heading. */
	_steer(pushX, pushY, dt) {
		if (!pushX && !pushY) return;
		const dirX = Math.cos(this.heading) + pushX * dt;
		const dirY = Math.sin(this.heading) + pushY * dt;
		this.heading = Math.atan2(dirY, dirX);
	}

	_avoidWalls(bounds, dt) {
		const m = FISH_MOVE.WALL_MARGIN * this.uiScale + this.width * 0.25;
		const maxX = Math.max(1, bounds.width - this.width);
		const maxY = Math.max(1, bounds.height - this.height);
		let px = 0, py = 0;
		if (this.x < m) px += (1 - this.x / m);
		if (this.x > maxX - m) px -= (1 - (maxX - this.x) / m);
		if (this.y < m * 0.7) py += (1 - this.y / (m * 0.7));
		if (this.y > maxY - m * 0.7) py -= (1 - (maxY - this.y) / (m * 0.7));
		this._steer(px * FISH_MOVE.WALL_STEER, py * FISH_MOVE.WALL_STEER, dt);
	}

	/** Soft personal space, so a full tank schools instead of stacking. */
	_avoidNeighbors(others, dt) {
		let px = 0, py = 0;
		for (const o of others) {
			if (o === this || o.state === 'death' || o.state === 'destroyed' || !o.placed) continue;
			const dx = (this.x + this.width / 2) - (o.x + o.width / 2);
			const dy = (this.y + this.height / 2) - (o.y + o.height / 2);
			const reach = (this.width + o.width) * 0.4;
			const d = Math.hypot(dx, dy);
			if (d > reach || d === 0) continue;
			const w = (reach - d) / reach;
			px += (dx / d) * w;
			py += (dy / d) * w;
		}
		this._steer(px * FISH_MOVE.SEPARATION_STEER, py * FISH_MOVE.SEPARATION_STEER, dt);
	}

	// ── Frame update ─────────────────────────────────────────────────────────

	update(currentTime, bounds, others) {
		if (this.state === 'destroyed') return;

		// A stalled rAF (OBS throttling a source) hands us a huge gap; treat
		// it as ONE small frame instead of teleporting the fish into a wall.
		const rawDt = (currentTime - (this.lastFrameTime || currentTime)) / 1000;
		this.lastFrameTime = currentTime;
		const dt = Math.min(FISH_MOVE.MAX_DT, Math.max(0, rawDt));
		if (dt === 0) return;

		// Tank has no size (source hidden / mid-resize): freeze in place.
		if (!bounds || bounds.width < 4 || bounds.height < 4) return;
		if (!this.placed) this._place(bounds);

		this.age += dt;
		this.stateT += dt;

		// ── Lifespan on the wall clock ──
		const lifeLeft = this.lifespan - (performance.now() - this.bornAt) / 1000;
		if (this.state !== 'death') {
			const secs = Math.max(0, Math.ceil(lifeLeft));
			if (secs !== this.shownSeconds) {
				this.shownSeconds = secs;
				this.timerLabel.textContent = secs;
			}
			if (lifeLeft <= 0) this.transitionTo('death');
		}

		const f = CONFIG.FISH;

		if (this.state === 'death') {
			this._updateDeath(dt);
		} else {
			this._updateAlive(dt, bounds, others, f);
		}

		this._render();
	}

	_updateAlive(dt, bounds, others, f) {
		this.shakeX = 0;

		// ── State machine ──
		if (this.state === 'idle') {
			this.speed = lerp(this.speed, this.cruise, Math.min(1, f.DASH_DECEL_RATE * dt));
			this.nextDashIn -= dt;
			if (this.nextDashIn <= 0 && this.shownSeconds > 5) {
				this.transitionTo(Math.random() < FISH_MOVE.HOVER_CHANCE ? 'hover' : 'dash');
			}
		} else if (this.state === 'hover') {
			// A breather: sink to a crawl, bob, blow the occasional bubble.
			this.speed = lerp(this.speed, this.cruise * FISH_MOVE.HOVER_SPEED, Math.min(1, 3 * dt));
			this.bubbleT -= dt;
			if (this.bubbleT <= 0) {
				this.bubbleT = 0.5 + Math.random() * 0.6;
				const nose = this.facingCur >= 0 ? this.width * 0.9 : this.width * 0.1;
				this._bubble(this.x + nose, this.y + this.height * 0.35,
					(5 + Math.random() * 6) * this.sizeMultiplier * this.uiScale);
			}
			if (this.stateT >= this.hoverFor) this.transitionTo('idle');
		} else if (this.state === 'dash') {
			if (this.dashPhase === 'windup') {
				// Coil up: shed speed, compress, quiver.
				this.speed = lerp(this.speed, this.cruise * 0.3, Math.min(1, 6 * dt));
				this.shakeX = Math.sin(this.age * 55) * 2.5 * this.uiScale;
				if (this.stateT >= f.DASH_ANTICIPATION_TIME) {
					this.dashPhase = 'burst';
					this.stateT = 0;
					this.speed = f.DASH_PEAK_SPEED * (0.85 + Math.random() * 0.3);
					this.targetStretchX = f.STRETCH_X;
					this.targetStretchY = f.STRETCH_Y;
				}
			} else {
				// Burst: full stretch, bubbles off the tail, then coast out.
				this.trailT -= dt;
				if (this.trailT <= 0) {
					this.trailT = FISH_MOVE.TRAIL_EVERY;
					const tail = this.facingCur >= 0 ? this.width * 0.05 : this.width * 0.95;
					this._bubble(
						this.x + tail + (Math.random() - 0.5) * 12 * this.uiScale,
						this.y + this.height * (0.3 + Math.random() * 0.4),
						(6 + Math.random() * 8) * this.sizeMultiplier * this.uiScale);
				}
				if (this.stateT >= f.DASH_ACCEL_DURATION) this.transitionTo('idle');
			}
		}

		// ── Steering ──
		const wanderScale = (this.state === 'dash' && this.dashPhase === 'burst') ? 0.15
			: (this.state === 'hover' ? 1.6 : 1);
		this.heading += (Math.sin(this.age * this.wanderF1 * Math.PI * 2 + this.wanderP1)
			+ 0.5 * Math.sin(this.age * this.wanderF2 * Math.PI * 2 + this.wanderP2))
			* this.wanderAmp * wanderScale * dt;
		this._avoidWalls(bounds, dt);
		this._avoidNeighbors(others, dt);
		this._shapePitch(dt);

		// ── Integrate ──
		const step = this.speed * dt * this.uiScale;
		this.x += Math.cos(this.heading) * step;
		this.y += Math.sin(this.heading) * step;

		// Backstop clamp — with dt capped this is a gentle graze, and the
		// heading reflects so the fish swims off the wall, never sticks to it.
		const maxX = Math.max(0, bounds.width - this.width);
		const maxY = Math.max(0, bounds.height - this.height);
		if (this.x < 0) { this.x = 0; if (Math.cos(this.heading) < 0) this.heading = Math.PI - this.heading; }
		else if (this.x > maxX) { this.x = maxX; if (Math.cos(this.heading) > 0) this.heading = Math.PI - this.heading; }
		if (this.y < 0) { this.y = 0; if (Math.sin(this.heading) < 0) this.heading = -this.heading; }
		else if (this.y > maxY) { this.y = maxY; if (Math.sin(this.heading) > 0) this.heading = -this.heading; }

		// ── Visuals driven by motion ──
		// Mirror flip: ease through the vertical instead of snapping.
		// NO banking/nose-tilt: the sprite stays level however it travels —
		// tilting the head up and down read as cartoonish and was hated.
		const facingTarget = Math.cos(this.heading) >= 0 ? 1 : -1;
		this.facingCur = lerp(this.facingCur, facingTarget, Math.min(1, FISH_MOVE.FLIP_RATE * dt));

		// Swim stroke: body pulse whose cadence follows speed.
		this.swimPhase += dt * (3 + this.speed / 22);

		// Squash & stretch relaxes back to neutral outside dash phases.
		if (this.state !== 'dash' || this.dashPhase !== 'burst') {
			this.targetStretchX = this.state === 'dash' ? CONFIG.FISH.SQUASH_X : 1;
			this.targetStretchY = this.state === 'dash' ? CONFIG.FISH.SQUASH_Y : 1;
		}
		const sLerp = Math.min(1, CONFIG.FISH.SCALE_LERP_SPEED * dt);
		this.stretchX = lerp(this.stretchX, this.targetStretchX, sLerp);
		this.stretchY = lerp(this.stretchY, this.targetStretchY, sLerp);
	}

	_updateDeath(dt) {
		// Belly-up with an overshoot spring, then float away in bubbles.
		const target = 180;
		this.rotationV += (target - this.rotation) * 60 * dt;
		this.rotationV *= Math.exp(-5 * dt);
		this.rotation += this.rotationV * dt;

		this.y -= CONFIG.FISH.FLOAT_UP_SPEED * dt * this.uiScale;
		this.x += Math.sin(this.age * 1.8) * 25 * dt * this.uiScale;

		this.bubbleT -= dt;
		if (this.bubbleT <= 0) {
			this.bubbleT = 0.25 + Math.random() * 0.2;
			this._bubble(this.x + this.width * (0.3 + Math.random() * 0.4),
				this.y + this.height * 0.5,
				(6 + Math.random() * 10) * this.sizeMultiplier * this.uiScale);
		}

		const sLerp = Math.min(1, 4 * dt);
		this.stretchX = lerp(this.stretchX, 1, sLerp);
		this.stretchY = lerp(this.stretchY, 1, sLerp);
		this.swimPhase += dt * 0.8;
		this.opacity = Math.max(0, Math.min(1, (this.y + this.height + 100) / 200));

		if (this.y < -this.height - 100 || this.stateT > FISH_MOVE.DEATH_TIMEOUT) {
			this.destroy();
		}
	}

	_render() {
		const pulse = Math.sin(this.swimPhase);
		const dead = this.state === 'death';
		const pulseAmp = dead ? 0.2 : 1;
		const sx = this.facingCur * this.stretchX * (1 - pulse * 0.05 * pulseAmp);
		const sy = this.stretchY * (1 + pulse * 0.07 * pulseAmp);

		// Barely-there buoyancy sway — anything bigger reads as bouncing.
		const bob = dead ? 0
			: Math.sin(this.age * this.bobFreq * Math.PI * 2 + this.bobPhase)
				* (this.state === 'hover' ? 3 : 1.5) * this.uiScale;

		// Fish stay level while alive; rotation exists only for the death roll.
		const rot = dead ? this.rotation : 0;

		this.element.style.left = `${this.x + this.shakeX}px`;
		this.element.style.top = `${this.y + bob}px`;
		this.element.style.opacity = this.opacity;
		this.body.style.transform = `rotate(${rot}deg) scale(${sx}, ${sy})`;
	}

	transitionTo(newState) {
		if (this.state === 'destroyed' || this.state === newState) return;
		this.state = newState;
		this.stateT = 0;

		if (newState === 'idle') {
			this.nextDashIn = this._dashInterval();
			this.targetStretchX = 1;
			this.targetStretchY = 1;
		} else if (newState === 'dash') {
			this.dashPhase = 'windup';
			this.targetStretchX = CONFIG.FISH.SQUASH_X;
			this.targetStretchY = CONFIG.FISH.SQUASH_Y;
		} else if (newState === 'hover') {
			this.hoverFor = 1 + Math.random() * 1.6;
			this.bubbleT = 0.3;
		} else if (newState === 'death') {
			this.nameLabel.style.display = 'none';
			this.timerLabel.style.display = 'none';
			this.rotation = 0;
			this.rotationV = (Math.random() < 0.5 ? -1 : 1) * 120; // a little jolt
			this.bubbleT = 0;
			this.shakeX = 0;
		}
	}

	destroy() {
		if (this.state === 'destroyed') return;
		this.state = 'destroyed';
		this.element.remove();
	}
}

class FishManager {
	constructor(aquariumElement) {
		this.aquarium = aquariumElement;
		this.activeFish = [];
		this._animFrameId = null;
		this.startAnimationLoop();
	}

	startAnimationLoop() {
		const loop = (timestamp) => {
			try {
				// One layout read per frame for the whole tank.
				const bounds = this.activeFish.length
					? this.aquarium.getBoundingClientRect() : null;
				for (const fish of this.activeFish) {
					try {
						fish.update(timestamp, bounds, this.activeFish);
					} catch (err) {
						// One broken fish must not freeze the whole aquarium.
						if (++fish.updateErrors >= 3) {
							console.error('[Fish] Removing fish after repeated update errors:', err);
							fish.destroy();
						}
					}
				}
				this.activeFish = this.activeFish.filter(f => f.state !== 'destroyed');
			} finally {
				// The loop survives ANYTHING above — a dead loop is a dead tank.
				this._animFrameId = requestAnimationFrame(loop);
			}
		};
		this._animFrameId = requestAnimationFrame(loop);
	}

	spawnFish(commands) {
		commands.forEach(cmd => {
			const newFish = new Fish(cmd.name, cmd.id, cmd.lifespan, cmd.size, this.aquarium);
			this.activeFish.push(newFish);
		});
	}
}
