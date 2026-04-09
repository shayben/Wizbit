# Copilot Instructions — ReadingAssistant

## Build, Test & Lint

```bash
npm run build        # tsc -b && vite build → outputs to dist/
npm run dev          # local dev server at http://localhost:5173
npm run lint         # eslint (TS + React Hooks + React Refresh)
npm test             # vitest run (all tests)
npx vitest run src/test/trophyService.test.ts   # run a single test file
npx vitest -t "awards first_read"               # run a single test by name
```

## Architecture

**React 19 + Vite + TypeScript + Tailwind CSS v4** single-page app. No router — navigation is a state machine in `App.tsx` (`AppStep` type: `home | camera | processing | reading | demo-pick | adventure | dashboard | my-stories`), rendered via early-return branches driven by `useAppStep()`.

### Data Flow

```
App.tsx (state machine)
  ├─ ReadingSession (core reading experience)
  │    ├─ useAssessment (speech assessment hook)
  │    ├─ useRecording (audio recording hook)
  │    ├─ useMoments (immersive moments hook)
  │    ├─ gamificationService (scoring)
  │    ├─ progressService → Cosmos DB / localStorage
  │    └─ trophyService (award evaluation)
  ├─ AdventureMode (story generation loop)
  │    ├─ storyService → Azure OpenAI
  │    ├─ storyLibraryService → localStorage
  │    └─ ReadingSession (embedded for each chapter)
  ├─ ProgressDashboard (history, trophies, analytics)
  └─ StoryLibrary (browse/resume saved stories)
```

### Auth

Dual SSO via `AuthContext`: Microsoft (MSAL popup) and Google (`@react-oauth/google`). Auth is optional — the app works without SSO when env vars are absent. Provider preference and Google credentials persist in `localStorage`. MSAL uses `localStorage` for cross-session token caching.

### Persistence

- **Progress/trophies**: `progressService` writes to localStorage first, then syncs to Azure Cosmos DB if configured (partition key `/uid`).
- **Story library**: `storyLibraryService` uses localStorage only. Stories save incrementally after each chapter and support resume.
- **Moment cache**: Pre-generated static JSON at `/momentCache.json`, preloaded at startup. Regenerate with `node scripts/generateMomentCache.mjs`.

### Azure Services (called directly from the browser)

| Service | SDK / Protocol | Used For |
|---|---|---|
| Azure OpenAI (GPT-4o-mini) | REST `chat/completions` | OCR post-processing, immersive moments, story generation, batch translation |
| Azure Computer Vision | REST Read API | Camera OCR |
| Azure Speech | `microsoft-cognitiveservices-speech-sdk` | Pronunciation assessment, TTS, STT |
| Azure Translator | REST v3.0 | Per-word contextual translation |
| Azure Cosmos DB | REST with HMAC-SHA256 | Progress, session history, trophies |
| Microsoft Entra ID | MSAL.js | SSO (Microsoft accounts) |

All credentials come from `VITE_` env vars (see `.env.example`). These are baked into the client bundle at build time — this is by design.

## Conventions

### Service Pattern

Every Azure-calling service follows a consistent structure:
1. Read `import.meta.env.VITE_*` vars at module top
2. Guard with early throw/return if credentials missing
3. Use `fetchWithRetry` (exponential backoff on 429s) for Azure OpenAI calls
4. Strip markdown fences from LLM JSON responses before parsing
5. Return empty arrays or raw text on failure (best-effort, never crash)

### Component Pattern

- Props typed with `interface FooProps`, components as `React.FC<FooProps>`
- Local state via hooks (`useState`/`useEffect`/`useRef`/`useCallback`/`useMemo`)
- Async effects use `let cancelled = false` + cleanup return for race condition safety
- Mobile-first: large tap targets, fixed overlays, `overscroll-behavior: contain`

### Styling

- Tailwind utility classes inline (no CSS modules, no styled-components)
- Responsive via `md:` breakpoints for iPad/tablet
- Custom animations in `src/index.css`: `animate-slide-up`, `animate-fade-in`, `animate-next-word`

### ESLint Strictness

The `react-hooks` plugin enforces strict rules including `react-hooks/set-state-in-effect` (disallows `setState` inside effects, even indirectly). When an effect must trigger async state changes (e.g., resume-on-mount), use a ref flag guard with an inline `eslint-disable-line react-hooks/set-state-in-effect` comment. Similarly, `react-hooks/exhaustive-deps` sometimes needs suppression for intentional one-time effects. Always use inline disable comments, not block disables.

### Trophy System

Trophies are pure functions in `trophyService.ts`. `computeNewTrophies(progress, earnedIds, storyStats?)` evaluates all 33 trophy conditions and returns newly earned IDs. Trophy evaluation runs in `ReadingSession` after each session completes. Each trophy has an `id`, `emoji`, `name`, `description`, and `category` for grouped display. To add a trophy: define it in `ALL_TROPHIES`, add evaluation logic in `computeNewTrophies`, add a test in `src/test/trophyService.test.ts`.

### Testing

- Framework: **Vitest** with `jsdom` environment
- Tests live in `src/test/*.test.ts`
- Setup file: `src/test/setup.ts` (imports `@testing-library/jest-dom/vitest`)
- Tests are unit tests for pure service logic (gamification, syllables, trophies, consecutive weeks)
- No component/integration tests currently

### Static Data

- `src/data/demoParagraphs.ts` — 7 reading levels (K–6) × 3 paragraphs each
- `src/data/momentCache.ts` — Pre-generated immersive moments keyed by `"{grade}-{paragraphIndex}"`

## Deployment

Azure Static Web Apps via GitHub Actions (`.github/workflows/azure-static-web-apps.yml`). Pipeline: `npm ci` → lint → test → build (with `VITE_` secrets injected) → deploy `dist/`. Triggers on push to `main` and PRs. SPA routing and CSP headers are in `public/staticwebapp.config.json`.

### CSP Notes

The Speech SDK requires comprehensive CSP entries: `wss://` + `https://` for speech domains, `worker-src blob:`, `script-src 'wasm-unsafe-eval'`, and `media-src mediastream:`. Google sign-in needs `accounts.google.com` in `script-src`, `connect-src`, and `frame-src`. When adding new external APIs, update the CSP in `staticwebapp.config.json`.
