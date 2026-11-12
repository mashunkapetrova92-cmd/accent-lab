# Исходный код Accent Lab

Эта ветка (`source`) хранит исходники. Готовый сайт, который открывается по ссылке, лежит в ветке `main`.

## Что где

| Папка | Что внутри |
| --- | --- |
| `src/`, `index.html`, `public/`, `scripts/` | само приложение (Vite, React, TypeScript) и сборка service worker |
| `server/token-worker.js` | сервер-посредник для Azure (Cloudflare Worker) |
| `content/` | тексты, описания звуков, транскрипции и скрипты генерации: `gen_audio2.py` (озвучка через edge-tts), `build_data2.py` (данные уроков), `apply_checks.py` (какие слова проверяются автоматически) |
| `qa/` | калибровка распознавания слов (`calib2.mjs`, `calib2m.mjs`) и её результаты |
| `tests/` | автоматические проверки в Chromium, WebKit, Firefox и эмуляции iPhone (Playwright) |
| `tools/` | локальный сервер для тестов и скрипт публикации в ветку `main` |

## Чего здесь нет

* `public/audio/` (около 380 МБ записей). Они лежат в ветке `main` в папке `audio/`; их можно скопировать оттуда или создать заново скриптом `content/gen_audio2.py`.
* `public/models/whisper-base.en/` (78 МБ): модель `onnx-community/whisper-base.en` с Hugging Face, файлы q8.
* `public/ort/` (21 МБ): файлы `ort-wasm-simd-threaded.jsep.*` из `node_modules/onnxruntime-web/dist/` после `npm install`.
* Ключей и паролей в коде нет. Ключ Azure хранится только в настройках Cloudflare Worker.

## Сборка

```
npm install
npm run build      # результат в dist/
```

В скриптах из `content/`, `qa/`, `tests/` и `tools/` пути записаны как `/home/claude/...`. На другом компьютере их нужно заменить на свои.
