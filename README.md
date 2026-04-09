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
# 1. Install dependencies
npm install

# 2. Configure credentials
cp .env.example .env
# Edit .env and fill in your Azure keys

# 3. Start the dev server
npm run dev
```

Open `http://localhost:5173` in your browser (or on your phone via your local IP).

### Environment Variables

| Variable | Description |
|---|---|
| `VITE_AZURE_VISION_ENDPOINT` | Azure Computer Vision endpoint URL |
| `VITE_AZURE_VISION_KEY` | Azure Computer Vision API key |
| `VITE_AZURE_SPEECH_KEY` | Azure Speech Service API key |
| `VITE_AZURE_SPEECH_REGION` | Azure region (e.g. `eastus`) |

### Build for Production

```bash
npm run build
# Output is in ./dist
```

## Usage

1. **Capture** — tap "Open Camera", point at printed text, tap "Capture" (or upload a photo)
2. **Review** — OCR text is extracted automatically; edit if needed, then tap "Start Reading"
3. **Read** — tap "🎤 Start Reading", read the text aloud; words turn green (correct) or red (needs practice)
4. **Pronounce** — tap any word at any time to hear its correct pronunciation
