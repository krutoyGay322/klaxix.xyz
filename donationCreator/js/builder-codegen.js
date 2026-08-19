// js/builder-codegen.js
// Export code generation for the donation builder

class CodeGenerator {
	constructor(state) {
		this.state = state;
	}

	updateCode() {
		const state = this.state;
		let code = "";

		code += `{v${state.voice}}`;

		// Green screen or meme (mutually exclusive)
		if (state.greenScreen) {
			let params = `:${state.greenScreen.timing}`;
			code += `{g${state.greenScreen.id}${params}}`;
		} else {
			state.memes.forEach(m => {
				let params = `:${m.timing}`;
				code += `{m${m.id}${params}}`;
			});
		}

		state.fish.forEach(f => {
			code += `{f${f.id}}`;
		});

		if (state.message.trim()) code += " " + state.message.trim();
		document.getElementById('final-code').value = code;
	}
}
