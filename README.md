# Wizbit 🧙

Wizbit is a mobile-first reading companion that turns printed text into an
interactive, AI-assisted reading experience. Learners can scan a page, read it
aloud, get word-level feedback, practise difficult words, and create branching
stories matched to their reading level.

## Highlights

- **Scan or upload reading material** — capture a page with the camera, upload
  an image, or import PDF and EPUB files.
- **Read with live feedback** — Azure pronunciation assessment highlights words
  that were read correctly and words that need more practice.
- **Hear and translate words** — tap a word for text-to-speech pronunciation or
  a contextual translation.
- **Experience immersive moments** — AI-generated activities bring passages to
  life while learners read.
- **Create adventures** — generate level-appropriate, branching stories and
  resume saved adventures later.
- **Track progress** — review reading history, practice words, statistics,
  stickers, and trophies.
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

1. Capture a printed page or upload an image, PDF, or EPUB.
2. Review the extracted text and choose the appropriate reading level.
3. Start reading aloud and follow the word-level feedback.
4. Tap a word to hear it or view a translation.
5. Finish the session to save progress and evaluate new trophies.
6. Open the dashboard to review history and practice opportunities, or start an
   AI-generated adventure from the home screen.

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
src/components/         Reading, adventure, dashboard, and account interfaces
src/contexts/           Authentication state
src/data/               Demo passages and generated moment data
src/hooks/              Reading, recording, navigation, and assessment hooks
src/services/           Client API, progress, story, and trophy logic
src/test/               Vitest unit tests
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
