// config.js - Centralized Settings (donation builder)

// This file is served to every browser that loads the builder — it must
// never contain secrets. TTS synthesis is not available on the static site
// (there is no proxy here); the builder previews use local voiceSamples/
// instead, and TTSManager fails soft if /tts is ever reached.

const CONFIG = {
	LIFESPAN: {
		BASE_SECONDS: 50.0,
	},

	CONTENT: {
		// The builder deliberately loads no TextFilter — previewing your own
		// text needs no filter (js/parser.js skips filtering when it's absent).
		ENABLE_FILTER: true
	},

	TTS: {
		ENABLED: true,
		PROXY_URL: "/tts", // No proxy on the static site; unused by the builder preview
		MODEL_ID: "eleven_v3",
		VOICES: {
			1: "voice", // Kрасу
			2: "voice", // Генри Крил
			3: "voice", // Тиффани Валентайн
			4: "voice", // Непослушный Медведь
			5: "voice", // Аниматроник
			6: "voice", // Сенобит
			7: "voice", // Чаки
			8: "voice", // Вескер
			9: "voice", // Сейбл Уорд
			10: "voice", // Бубба
			11: "voice", // Рин
			12: "voice", // Ада Вонг
			13: "voice", // Квон Тхэён
			14: "voice", // Сущность
		},
		VTUBER_MAP: {
			1: "krasue",
			2: "Henry",
			3: "Tiffany",
			4: "NaughtyBear",
			5: "Springtrap",
			6: "Senobite",
			7: "Chucky",
			8: "Wesker",
			9: "Sable",
			10: "Bubba",
			11: "Spirit",
			12: "AdaWong",
			13: "Kwon",
			14: "Entity"
		}
	},

	// Donation voice level for in-browser playback (matches the stream setup).
	HOST_AUDIO: {
		TTS_VOLUME: 0.38
	},

	UI: {
		MESSAGE_DISPLAY_TIME: 8000,
		DEFAULT_STYLE_ID: 1,
		DEFAULT_POS: 5 // Top Center
	},

	FISH: {
		TEXTURE_COUNT: 168,
		IDLE_SPEED: 40,
		DASH_PEAK_SPEED: 400,
		DASH_ANTICIPATION_TIME: 0.3,
		DASH_ACCEL_DURATION: 0.6,
		DASH_DECEL_RATE: 1.5,
		SQUASH_X: 0.8,
		SQUASH_Y: 1.2,
		STRETCH_X: 1.5,
		STRETCH_Y: 0.6,
		SCALE_LERP_SPEED: 12,
		DEATH_ROTATE_DURATION: 0.5,
		FLOAT_UP_SPEED: 80,
		MIN_DASH_INTERVAL: 3,
		MAX_DASH_INTERVAL: 8,
		WIDTH: 160,
		HEIGHT: 100,
		DEFAULT_SIZE: 0.9,
		MIN_SIZE: 0.4,
		MAX_SIZE: 1.2,

		// Regex for Fish
		COMMAND_REGEX: /\{f(\d+)([^}]*)\}/gi,
		// Regex for Styles: Captures ID and then any parameters inside the tag
		STYLE_COMMAND_REGEX: /\{s(\d+)([^}]*)\}/gi,
		// Regex for Voice: {v1}, {v2}, etc.
		VOICE_COMMAND_REGEX: /\{v(\d+)\}/gi,
		// Regex for Memes: {m1}, {m2:f}, etc.
		MEME_COMMAND_REGEX: /\{m(\d+)([^}]*)\}/gi,
		// Regex for Green Screen: {g1}, {g2:b}, etc.
		GREEN_COMMAND_REGEX: /\{g(\d+)([^}]*)\}/gi,

		// Parameter Regex
		PARAM_REGEX_SIZE: /:s(\d+(?:\.\d+)?)/,
		PARAM_REGEX_NAME: /:n-([a-zA-Z0-9_\-\s]+)/,
		PARAM_REGEX_EXT: /:e(\d+)/,
		PARAM_REGEX_TIMING: /:([ba])/
	},

	GREEN_SCREEN: {
		COUNT: 13,
		DEFAULT_VOLUME: 0.85
	},

	MEMES: {
		// A donation worth this much in roubles plays its meme fullscreen
		// instead of as a small framed window.
		FULLSCREEN_MIN_RUB: 500,

		// On the static site there is no proxy to count the folder live
		// (js/asset-counts.js fails soft) — bump this after adding memes,
		// and run `node generate-thumbs.js` from the source project for
		// thumbnails.
		COUNT: 357,

		// Memes downloaded from the meme sites are routinely padded to a fixed
		// length: the AUDIO TRACK stops after a couple of seconds but the
		// picture runs on to the padded end. The player ends such a clip when
		// its sound is over (js/media-clip.js _cutAtMs).
		END_WITH_SOUND: {
			ENABLED: true,
			// Only cut when there is REALLY dead air. Raise it if a meme loses
			// its punchline.
			MIN_DEAD_TAIL_MS: 1000,
			// Let the last frame breathe after the sound stops.
			TAIL_MS: 600
		}
	}
};
