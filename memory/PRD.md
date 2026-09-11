# LensTranslate — PRD

## Overview
Android app that translates text in *any* other app / game running on the phone. It captures the screen every ~3.5s, sends frames to Gemini 3 Flash for OCR + translation, and shows the translated text in a **draggable floating panel** on top of everything else.

## Core features
- **Start / Stop screen translation** — foreground service + MediaProjection
- **Draggable floating overlay** — panel can be moved up/down/left/right so the app below stays usable
- **AI OCR + translation** — Gemini 3 Flash via Emergent LLM Key (single API round-trip)
- **Source language auto-detected** on every capture
- **108 target languages** with searchable picker
- **Translation history** — saved server-side, browsable, clearable
- **Light / Dark theme toggle**, persisted across launches
- **Favorite languages** — star languages in the picker; pinned in a Favorites section on top (AsyncStorage `fav-langs`)
- **Capture cadence** — Settings sheet: Every 2s / Every 5s / Manual (AsyncStorage `capture-cadence`). Manual adds a ↻ button on the floating panel; last frame is reused if the screen hasn't changed
- **Pin overlay** — lock icon on the floating panel header disables dragging (Kotlin, `FloatingOverlayManager`)
- **Copy from history** — tap any history card to copy the translation (expo-clipboard) with toast + haptic
- **Overlay text size** — Small / Medium / Large (12/14/17 sp) in Settings with live preview; persisted in `overlay-prefs`
- **Overlay opacity** — 40–100% slider in Settings (`@react-native-community/slider`); panel + block background alpha scale with it
- **Quick language swap** — favorites appear as chips on the floating panel; tapping re-translates immediately; Home mirrors the active target via `getActiveTarget()`
- **History search** — client-side filter over original + translated text, match highlighting, result count, no-results state

## Native bridge
- `startCapture(options: CaptureOptions)` — `{ targetLang, targetLangName, backendUrl, intervalMs, textSizeSp, opacity, favorites[] }`
- `getActiveTarget()` — `{code,name} | null` while the service is running

## Non-goals
- iOS live screen translation (Apple blocks reading other apps)
- Continuous per-frame translation (~3.5s cadence keeps cost + battery reasonable)

## Architecture
- **Frontend**: Expo Router with `_layout.tsx`, `index.tsx`, `languages.tsx`, `history.tsx`, `settings.tsx`; prefs helpers in `src/prefs.ts`
- **Native**: local Expo module `modules/screen-translator` (Kotlin) with
  - `ScreenTranslatorModule` — JS bridge
  - `ScreenCaptureService` — foreground service using `MediaProjection`
  - `FloatingOverlayManager` — `TYPE_APPLICATION_OVERLAY` draggable panel
- **Backend**: FastAPI `/api/translate`, `/api/languages`, `/api/history`
- **AI**: Gemini 3 Flash via `emergentintegrations`, JSON schema response
- **DB**: MongoDB `translations` collection (history)

## Environment
- `EMERGENT_LLM_KEY` in `backend/.env`
- Frontend uses `EXPO_PUBLIC_BACKEND_URL` for API calls

## Preview vs deployment
- Native screen-capture + floating window **only activates in a custom Android APK**. Use the Publish button in Emergent to build one.
- The rest of the app (language picker, history, theme toggle, translate API) works in the Expo Go / web preview.
