# Agent Buddy Deepgram Speech

An [Agent Buddy](https://github.com/DanWahlin/agent-buddy) plugin that speaks the companion's lines with [Deepgram Flux](https://deepgram.com/product/text-to-speech/flux) text-to-speech. Voice notifications, `npm run speak` and agent narration all use it once you choose it as the voice. It works on macOS, Windows and Linux.

## Install

From your Agent Buddy folder:

```bash
npm run plugin add https://github.com/<owner>/agent-buddy-deepgram-speech
npm run plugin enable deepgram-speech
```

Then open **Settings > Plugins**:

1. Paste your Deepgram API key. **Get a free Deepgram API key** opens the Deepgram Console.
2. Pick a voice: Haley, Cole, Heather, Priya, Jack, Bruce, Rufus or Drew.
3. In **Agents > Voice notifications**, choose **Deepgram Flux (Deepgram Speech)** as the voice and press **Play test**.

You can also do this from a terminal: `npm run plugin set deepgram-speech apiKey` (hidden prompt), then `npm run speech deepgram-speech/flux`.

## Privacy

Each spoken line is sent to `api.deepgram.com` over HTTPS. Agent Buddy only speaks its own short status phrases and lines an agent writes for narration, never your prompts or code. The API key is stored by Agent Buddy on this computer, readable only by your user account, and given only to this plugin.

## How it works

The plugin calls Deepgram's batch `POST /v2/speak` with `encoding=linear16&sample_rate=24000&container=none`. That's mono 24 kHz signed 16-bit audio, which is exactly what the companion plays, so nothing is converted. Lines are capped at 15 seconds. It has no dependencies and no build step.

## Develop

```bash
npm test
node <agent-buddy>/tools/plugin-check.mjs .                          # without a key
node <agent-buddy>/tools/plugin-check.mjs . --settings settings.json # {"apiKey": "...", "voice": "flux-cole-en"}
```

See [AGENTS.md](AGENTS.md) for the plugin rules, and Agent Buddy's [docs/plugins.md](https://github.com/DanWahlin/agent-buddy/blob/main/docs/plugins.md) for the protocol.
