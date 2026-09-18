# Generic neural narrator voices

Default TTS is **edge-tts** (Microsoft neural catalog, $0, no API key). Spanish default: `es-MX-DaliaNeural`.

See operator notes in the project store, or:

- Env: `TTS_ENGINE` (default `edge`), `TTS_VOICE_EN` / `TTS_VOICE_ES` / …
- Code: `lib/providers/tts/`
- Preview: `node --experimental-default-type=module scripts/tts-preview.mjs --lang es --out /tmp/narrator-es.mp3`

ElevenLabs is optional: `TTS_ENGINE=elevenlabs` plus `ELEVENLABS_API_KEY`. Do not enable until later tests pass.
