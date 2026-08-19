// js/utils.js

function lerp(start, end, amount) {
	return start + (end - start) * amount;
}

function playSpawnEffect(x, y, scale = 1) {
	const aquarium = document.getElementById('aquarium');
	if (!aquarium) return;
	
	const bubbleCount = 10;
	for (let i = 0; i < bubbleCount; i++) {
		const bubble = document.createElement('div');
		bubble.className = 'spawn-bubble';
		bubble.style.left = `${x}px`;
		bubble.style.top = `${y}px`;
		const size = (Math.random() * 25 + 10) * scale;
		bubble.style.width = `${size}px`;
		bubble.style.height = `${size}px`;
		
		const randomXEnd = (Math.random() - 0.5) * 200 * scale;
		const randomYEnd = (Math.random() - 0.5) * 200 * scale;
		const randomScaleEnd = Math.random() * 0.4 + 0.1;
		
		bubble.style.setProperty('--random-x-end', `${randomXEnd}px`);
		bubble.style.setProperty('--random-y-end', `${randomYEnd}px`);
		bubble.style.setProperty('--random-scale-end', randomScaleEnd);
		
		aquarium.appendChild(bubble);
		setTimeout(() => bubble.remove(), 1000);
	}
}