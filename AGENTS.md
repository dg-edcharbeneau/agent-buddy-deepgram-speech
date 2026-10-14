# Working on this plugin

This is an Agent Buddy plugin. It follows the Agent Buddy plugin rules in the template's [AGENTS.md](https://github.com/DanWahlin/agent-buddy/blob/main/plugins/template/AGENTS.md), summarized here:

- `rpc.mjs` is the shared protocol helper. Keep it identical to the template's copy.
- stdout carries JSON-RPC only. Log with `host.log()` or stderr, and never log the API key or other settings.
- Throw `PluginError(-32003, …)` when setup is needed (no key, rejected key) and `PluginError(-32004, …)` when Deepgram fails. Messages are shown to the user.
- Audio is mono 24 kHz signed 16-bit little-endian, at most 15 seconds, returned as base64.
- No runtime dependencies and no build step. The plugin runs straight from this folder.
- `deepgram.mjs` talks to Deepgram; `index.mjs` maps the protocol to it. Tests use a fake `fetch`, never the network.

Before you finish: `npm test` passes, and `node <agent-buddy>/tools/plugin-check.mjs .` prints `All checks passed.`
