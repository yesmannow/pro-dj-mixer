<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/071ae1ee-be59-463e-8f26-8b25b8478351

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

# Pro DJ Mixer

A professional DJ mixing application built with Next.js, designed for seamless music playback, mixing, and waveform visualization.

## Features

- **Deck Management**: Control multiple audio decks for mixing tracks.
- **Library**: Browse and select music from your collection.
- **Mixer**: Adjust volume, EQ, and effects in real-time.
- **Waveform Overview**: Visualize audio waveforms for precise cueing.
- **Add Music Modal**: Easily import new tracks into your library.

## Tech Stack

- **Framework**: Next.js (React-based)
- **Language**: TypeScript
- **Styling**: CSS (with PostCSS for processing)
- **Linting**: ESLint
- **Build Tool**: Next.js build system
- **State Management**: Custom store (likely Zustand or similar, based on store/ directory)

## Getting Started

1. Clone the repository:
   ```sh
   git clone https://github.com/yesmannow/pro-dj-mixer.git
   cd pro-dj-mixer
   ```
