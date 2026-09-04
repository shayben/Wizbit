# Wizbit 🧙

Wizbit is a mobile-first reading companion that turns printed text into an
interactive, AI-assisted reading experience. Learners can scan a page, read it
aloud, get word-level feedback, practise difficult words, and create branching
stories matched to their reading level.

## Highlights

### Learners

- **Up to four child profiles per account** — each learner has their own
  progress, practice list, stickers and adaptive state, so siblings sharing a
  device never mix their data.

### Reading

- **Scan or upload reading material** — capture a page with the camera, upload
  an image, or import PDF and EPUB files.
- **Read with live feedback** — Azure pronunciation assessment highlights words
  that were read correctly and words that need more practice.
- **Reading fluency (WCPM)** — words correct per minute against per-grade
  benchmarks, measured from each session.
- **Comprehension checks** — literal, inferential and vocabulary questions
  after a passage, plus a spoken retell scored on the key ideas the child
  covered in their own words.
- **Sight words** — the Fry first 300 in graded tiers, scheduled by spaced
  repetition.
- **Spelling dictation** — hear the word, spell it, and get feedback that names
  the pattern being practised.
- **Tricky-word drills** — words missed while reading come back for spoken
  practice until they are cleared.
- **Hear and translate words** — tap a word for text-to-speech pronunciation or
  a contextual translation.
- **Experience immersive moments** — AI-generated activities bring passages to
  life while learners read.
- **Create adventures** — generate level-appropriate, branching stories and
  resume saved adventures later.

### Math

- **Adaptive skill practice** — K–5 skills with a recommended next step.
- **Per-fact fluency** — every addition, subtraction, multiplication and
  division fact is tracked on both accuracy and speed, drilled by spaced
  repetition, and shown as a fill-in mastery grid.
- **Word problems** — level-appropriate problems with a read-aloud button, so a
  child can attempt a problem above their reading level.
- **Mistake diagnosis** — a wrong answer is explained (off-by-one, wrong
  operation, missed regrouping) rather than met with a generic tip.
- **Visual models** — ten frames and number lines for the earliest grades.
- **Child-friendly entry** — a large number pad instead of the phone keyboard.

### Engagement

- **Daily plan and streaks** — today's goal and the current streak are shown on
  the home screen, before the child starts.
- **Buddy progression** — companions earn XP from every activity, level up and
  unlock accessories.
- **Head-to-head** — two learners take turns on one device, each answering
  questions at their own grade.
- **Weekly parent report** — what was practised, how fluency is trending, which
  words and facts are still shaky, and what to try next.
- **Track progress** — reading history, practice words, fact mastery, sight
  words, spelling patterns, statistics, stickers and trophies.
- **Use optional sign-in** — Microsoft and Google SSO sync account progress;
  anonymous use can be enabled for local-only sessions.

## Architecture

Wizbit is deployed as two artifacts on Azure Static Web Apps:

```text
Browser
  └── React + TypeScript SPA (src/)
        └── /api/*
              └── Azure Functions API (api/)
                    ├── Azure AI Vision
                    ├── Azure Speech
                    ├── Azure Translator
                    ├── Azure OpenAI
                    └── Azure Cosmos DB
```

The client contains only public SSO identifiers. Azure credentials remain in
the Functions environment; the API verifies Microsoft or Google identity
tokens, applies per-user quotas, and proxies requests to Azure services.
Progress is saved locally first and can be synchronized through Cosmos DB.

## Getting Started

### Prerequisites

- [Node.js 20](https://nodejs.org/)
- [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local)
- Azure resources for the features you intend to use:
  - Azure AI Vision
  - Azure AI Speech
  - Azure AI Translator
  - Azure OpenAI
  - Azure Cosmos DB (recommended for persistent progress and quotas)
- Optional Microsoft Entra ID and/or Google OAuth applications for sign-in

### Install

```bash
git clone https://github.com/shayben/Wizbit.git
cd Wizbit
npm install
npm --prefix api install
```

### Configure

Create the client environment file:

```bash
cp .env.example .env
```

Set the public Microsoft and Google client IDs in `.env` as needed. Do not put
API keys in this file: every `VITE_` value is included in the browser bundle.

Create the local Functions configuration:

```bash
cp api/local.settings.json.example api/local.settings.json
```

Add the server-side credentials for the Azure services you want to use. The
example file documents all supported values. It is gitignored and must never be
committed.

### Run Locally

Start the API:

```bash
npm --prefix api start
```

In another terminal, start the client:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). To test on a phone, start
Vite with `npm run dev -- --host` and open the displayed network URL.

## How to Use

1. Choose the learner. Add a profile for each child, with their grade — this
   is what keeps their progress and adaptive practice separate.
2. Check today's plan on the home screen and tap any item to start it.
3. For reading: capture a printed page or upload an image, PDF, or EPUB, then
   read aloud and follow the word-level feedback. Tap a word to hear it or view
   a translation.
4. After reading, run the comprehension check and, if you like, the spoken
   retell.
5. For math: practise a skill, drill facts against the mastery grid, or work
   through word problems.
6. Open the dashboard to review history, fact mastery, sight-word and spelling
   progress, trophies and stickers.
7. Open the weekly report for a plain-language summary and suggested next
   steps.

Browser microphone and camera access require permission. Camera access from a
mobile device normally requires HTTPS unless the app is running on localhost.

## Development

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run lint` | Lint the client |
| `npm test` | Run client tests once |
| `npm run build` | Type-check and build the client to `dist/` |
| `npm run preview` | Preview the production client build |
| `npm --prefix api run lint` | Lint the Functions API |
| `npm --prefix api test` | Run API tests once |
| `npm --prefix api run build` | Compile the Functions API |
| `npm --prefix api start` | Build and run the Functions API locally |

## Project Structure

```text
api/                    Azure Functions proxy, authentication, and quotas
public/                 Static assets and Azure Static Web Apps configuration
scripts/                Static data generation utilities
src/components/         Reading, math, adventure, dashboard, and account screens
src/components/common/  Reusable building blocks (quiz runner, number pad,
                        answer tiles, visual math models, progress displays)
src/contexts/           Authentication and active-learner state
src/data/               Demo passages and generated moment data
src/hooks/              Reading, recording, navigation, and assessment hooks
src/services/           Client API, progress, learning, and gamification logic
src/types/              Shared vocabulary (grade codes, word types)
src/test/               Vitest unit and integration tests
```

## Deployment

The workflow in `.github/workflows/azure-static-web-apps.yml` installs, lints,
tests, builds, and deploys both artifacts on pushes and pull requests targeting
`main`.

Before deploying:

1. Add the public `VITE_` SSO identifiers as GitHub Actions secrets.
2. Add Azure service credentials as Azure Static Web Apps application settings.
3. Add `AZURE_STATIC_WEB_APPS_API_TOKEN` to the repository secrets.
4. Keep `public/staticwebapp.config.json` updated when a new external service
   requires a Content Security Policy entry.

## Security

- Never place secrets in `.env` or any variable prefixed with `VITE_`.
- Keep `api/local.settings.json` local and store production credentials in
  Azure Static Web Apps configuration.
- Restrict OAuth redirect URIs and Azure resource access to the environments
  that need them.
- Use the API quota settings to control anonymous and authenticated usage.
