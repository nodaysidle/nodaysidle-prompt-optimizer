# Prompt Optimizer

A high-performance prompt engineering workbench powered by **DeepSeek Platform API** and **TypeSafe Jev System One Diagnostics**.

Paste any user prompt, system instructions, or image-generation prompt to get instant diagnostic linting, production-grade rewrites, side-by-side and word-level diff comparisons, and live test runs.

## Features

- **DeepSeek Platform Engine**: Blazing fast rewrites using official DeepSeek Platform API (`deepseek-chat` / DeepSeek-V3 and `deepseek-reasoner` / DeepSeek-R1).
- **TypeSafe Jev System One Diagnostics**: Sub-100ms probabilistic rubric analysis evaluating:
  - Clarity Score (0 to 3 scale)
  - Ambiguity & scope vagueness
  - Missing boundary & output formatting constraints
  - Persona & operational context gaps
  - Jailbreak / prompt injection risk flags
- **Diagnostic-Conditioned Rewriting**: Feeds detected flaws directly into the rewriter to produce targeted, high-fidelity prompts.
- **Jev Quality & Regression Gate**: Verifies intent preservation and guards against over-engineered cognitive bloat.
- **Interactive Word Diff**: Highlights exact word additions and deletions.
- **Prompt Playground**: Test prompts live against DeepSeek with sample inputs without leaving the app.
- **1-Click Examples**: Pre-built templates for database tasks, code review personas, support concierges, and visual prompts.
- **Zero CORS / Privacy First**: Direct browser-to-server edge route handlers. API keys can be saved locally in browser `localStorage` or configured server-side on Vercel without exposing them to the client bundle.

## Configuration & Keys

### 1. In the App (Client-side localStorage)
Click **Settings** in the top navigation:
- Enter your **DeepSeek API Key** ([platform.deepseek.com](https://platform.deepseek.com)).
- *(Optional)* Enter your **TypeSafe Jev API Key** ([typesafe.ai](https://typesafe.ai)) for live System One probabilistic scoring. If omitted, built-in deterministic heuristics are used.

### 2. On Vercel / Server Environment
To provide keys globally for your deployment without requiring visitors to enter their own:
Set `DEEPSEEK_API_KEY` and `TYPESAFE_API_KEY` in **Vercel Project Settings → Environment Variables**.

## Develop Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build
```
