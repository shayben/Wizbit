# Wizbit 🧙

A mobile-friendly web app that uses Azure AI to make learning magical. It:

- 📷 **Captures** a printed reading assignment with your camera (or image upload)
- 🔍 **Reads** the text using Azure Computer Vision OCR
- 🎤 **Listens** as you read aloud and scores each word in real time with Azure Pronunciation Assessment
- 🟢🔴 **Highlights** words as correct (green) or needing practice (red)
- 🔊 **Pronounces** any word correctly when you tap it (Azure TTS)

## Quick Start

### Prerequisites

- **Node.js** 18+
- An **Azure Computer Vision** resource ([create one](https://portal.azure.com))
- An **Azure Speech Service** resource ([create one](https://portal.azure.com))

### Setup

```bash
# 1. Install client + api dependencies
npm install
(cd api && npm install)

# 2. Configure credentials
cp .env.example .env
# Edit .env: set the public client IDs (Entra/Google).
# Then create api/local.settings.json from the example and fill in
# your server-side Azure keys (Vision, Speech, Translator, OpenAI, Cosmos).

# 3. Start the dev server
npm run dev
# In another terminal, run the API locally with the Azure Functions Core Tools:
#   cd api && npm run start
```

Open `http://localhost:5173` in your browser (or on your phone via your local IP).

### Architecture

Wizbit ships as **two artifacts** deployed together on Azure Static Web Apps:

- **Client** (`src/`) — React SPA. Holds only public identifiers (SSO client IDs).
- **API** (`api/`) — Azure Functions v4 proxy. Holds every Azure key, verifies the
  caller's MSAL/Google JWT, enforces per-user daily quotas (free vs. premium plan)
  in Cosmos DB, and forwards calls to Azure Vision / OpenAI / Translator / Speech.
  All client services route through `/api/*` — no Azure key ever reaches the browser.

See `api/README` setup notes inside `api/local.settings.json.example` for the full
list of server-side environment variables.

### Build for Production

```bash
npm run build         # client → ./dist
(cd api && npm run build)   # api → ./api/dist (deployed by SWA)
```

## Usage

1. **Capture** — tap "Open Camera", point at printed text, tap "Capture" (or upload a photo)
2. **Review** — OCR text is extracted automatically; edit if needed, then tap "Start Reading"
3. **Read** — tap "🎤 Start Reading", read the text aloud; words turn green (correct) or red (needs practice)
4. **Pronounce** — tap any word at any time to hear its correct pronunciation
