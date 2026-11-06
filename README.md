# Accent Lab — General American pronunciation

A mobile-first Progressive Web App for training American English pronunciation.

* **Sounds** — a learning journey of 51 modules: all General American vowels, diphthongs, r-colored vowels and consonants, plus aspiration, dark L, flap T, final voicing, syllabic consonants, weak forms and linking. Each module has six stages: Learn (articulation, animated mouth diagram, vowel chart), Words, Listen (minimal pairs in three voices), Say, Sentences and a Final test (90/100 required to unlock the next module).
* **Reading** — 100 original passages with natural recorded audio, word-synchronized highlighting, sentence-by-sentence playback, a Study mode (stress, weak forms, linking, flap T, American R, intonation, IPA for every word) and recording with word-level feedback and attempt history.
* **My progress** — learning time, streak, mastered sounds, score history, recurring problems and recommendations, all computed from your own data.

## Assessment engines

| Engine | What it measures | Needs |
|---|---|---|
| Basic word recognition (default) | Whether each word was understood as the intended word; speaking rate | Safari (iPhone) or Chrome; internet |
| Azure AI Speech pronunciation assessment | Phoneme accuracy, the phoneme actually produced, word accuracy, vowel and consonant accuracy, fluency, completeness, prosody | An Azure Speech key behind the token server in `server/token-worker.js` |

Results are labeled **Measured**, **Estimated** or **Not measured**. Basic recognition never claims to score sounds.

Engines implement one interface (`src/assess/types.ts`) and are registered in `src/assess/index.ts`, so another provider can be added without touching the screens.

## Project layout

```
src/
  assess/      engines (browser, azure), feedback rules, types
  components/  UI building blocks, recorder, mouth diagram, results
  data/        content types and loaders
  lib/         text alignment, audio playback, microphone, storage (IndexedDB)
  screens/     Sounds map and stages, Reading library and reader, Progress, Settings
public/
  data/        sounds.json, stories/*.json, words.json (generated)
  audio/       recorded audio sprites (generated)
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

Model audio: Microsoft neural voices (Ava; Andrew and Emma in listening drills). Transcriptions: CMU Pronouncing Dictionary converted to General American IPA with flapping, syllabic consonants and weak forms, plus hand-checked entries. All texts are original.
