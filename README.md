# Accent Lab — General American pronunciation

A mobile-first Progressive Web App for training American English pronunciation.

* **Sounds** — a learning journey of 51 modules: all General American vowels, diphthongs, r-colored vowels and consonants, plus aspiration, dark L, flap T, final voicing, syllabic consonants, weak forms and linking. Each module has six stages: Learn (articulation, animated mouth diagram, vowel chart), Words, Listen (minimal pairs in three voices), Say, Sentences and a Final test (90/100 required to unlock the next module).
* **Reading** — 100 original passages with natural recorded audio, word-synchronized highlighting, sentence-by-sentence playback, a Study mode (stress, weak forms, linking, flap T, American R, intonation, IPA for every word) and recording with word-level feedback and attempt history.
* **My progress** — learning time, streak, mastered sounds, score history, recurring problems and recommendations, all computed from your own data.

## Assessment engines

| Engine | What it measures | Needs |
|---|---|---|
| On-device recognition (default without Azure) | Single words: a forced choice between the word and the words it is confused with ("sheep" or "ship"), normalized by how the model recording scores. Sentences and texts: which words were understood; speaking rate | Any current browser (Safari, Chrome, Edge, Firefox, Home Screen apps). One-time download of Whisper base.en (about 100 MB with the runtime); then works offline |
| Browser speech recognition | Which words were understood; shows words live while reading | Chrome, Edge or Safari with internet. If it fails, the same recording is checked on the device |
| Azure AI Speech pronunciation assessment | Phoneme accuracy, the phoneme actually produced, word accuracy, vowel and consonant accuracy, fluency, completeness, prosody | An Azure Speech key behind the token server in `server/token-worker.js` |

Results are labeled **Measured**, **Estimated** or **Not measured**. Word recognition never claims to score sounds. Words that the on-device recognizer cannot confirm even in the model recording are not scored; the learner compares by ear.

Engines implement one interface (`src/assess/types.ts`) and are chosen in `src/assess/index.ts`. All three share one recorder (`src/assess/pcm.ts`), which keeps the learner's voice for playback in every browser.

## Audio

Model clips are decoded once with the Web Audio API, cut sample-accurately from the sprites and played as short WAV files through a single `<audio>` element. Nothing is seeked inside MP3 files (unreliable for short segments in Safari), and the output is ordinary media playback, which the iPhone's silent switch does not mute (it mutes Web Audio output, which made sounds disappear in the app opened from the Home Screen). Every word, key word and sentence has a natural slow recording; texts have a slow version as well. Single words use the English-only Microsoft voices (the multilingual voices sometimes switch phonology on an isolated word). File names carry a content hash.

## Project layout

```
src/
  assess/      engines (local Whisper, browser, Azure), recorder, feedback rules, types
  components/  UI building blocks, recorder, mouth diagram, results
  data/        content types and loaders
  lib/         text alignment, audio playback, microphone, storage (IndexedDB)
  screens/     Sounds map and stages, Reading library and reader, Progress, Settings
public/
  data/        sounds.json, stories/*.json, words.json, checks.json, audio.json (generated)
  audio/       recorded audio sprites (generated)
  models/      Whisper base.en (ONNX, quantized), served with the app
  ort/         ONNX Runtime WebAssembly
server/        Azure token server (Cloudflare Worker)
scripts/       service worker template and post-build step
```

## Build

```
npm install
npm run build      # output in dist/
npm run preview    # local test at http://localhost:4173
```

`dist/` is a static site. Host it on any HTTPS static host (GitHub Pages, Cloudflare Pages, Netlify). The microphone requires HTTPS.

## Credits

Model audio: Microsoft neural voices (Ava; Andrew and Aria in listening drills). Speech recognition: Whisper base.en (OpenAI, MIT license) via Transformers.js and ONNX Runtime Web. Transcriptions: CMU Pronouncing Dictionary converted to General American IPA with flapping, syllabic consonants and weak forms, plus hand-checked entries. All texts are original.
