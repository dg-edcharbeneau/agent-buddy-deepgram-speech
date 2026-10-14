// Deepgram Flux text-to-speech: the batch REST call, and what its replies and errors mean.
import {errors, PluginError} from './rpc.mjs';

export const speakUrl = 'https://api.deepgram.com/v2/speak';
export const sampleRate = 24_000;
export const maxSeconds = 15;
// Under the companion's 20-second limit, so the plugin's own message reaches the user.
export const requestTimeoutMs = 18_000;
export const fluxVoices = ['flux-haley-en', 'flux-cole-en', 'flux-heather-en', 'flux-priya-en',
                           'flux-jack-en', 'flux-bruce-en', 'flux-rufus-en', 'flux-drew-en'];
export const defaultVoice = 'flux-haley-en';

// Raw mono 24 kHz signed 16-bit PCM: exactly what Agent Buddy plays, so nothing is converted.
export function speakRequestUrl(voice) {
  const url = new URL(speakUrl);
  url.searchParams.set('model', voice);
  url.searchParams.set('encoding', 'linear16');
  url.searchParams.set('sample_rate', String(sampleRate));
  url.searchParams.set('container', 'none');
  return url;
}

// Deepgram may still wrap linear16 in a WAV header; keep the samples after its data chunk id.
// A streamed WAV header can carry a placeholder size, so the bytes that arrived win.
export function pcmFromAudio(audio) {
  let pcm = audio;
  if (audio.length >= 12 && audio.toString('ascii', 0, 4) === 'RIFF' && audio.toString('ascii', 8, 12) === 'WAVE') {
    pcm = null;
    for (let offset = 12; offset + 8 <= audio.length;) {
      const size = audio.readUInt32LE(offset + 4);
      if (audio.toString('ascii', offset, offset + 4) === 'data') {
        pcm = audio.subarray(offset + 8, Math.min(audio.length, offset + 8 + size));
        break;
      }
      offset += 8 + size + (size & 1);
    }
    if (!pcm) throw new PluginError(errors.upstream, 'Deepgram returned no audio.');
  }
  return pcm.subarray(0, pcm.length & ~1);
}

// Turns a failed reply into a short message for the user. Never includes the key.
export async function deepgramError(response) {
  if (response.status === 401 || response.status === 403)
    return new PluginError(errors.needsSetup, 'Deepgram rejected the API key. Check it in Settings > Plugins.');
  if (response.status === 429) return new PluginError(errors.upstream, 'Deepgram rate limit reached. Try again shortly.');
  let detail = '';
  try {
    const body = await response.json();
    const message = body.err_msg ?? body.message;
    if (typeof message === 'string') detail = `: ${message.slice(0, 200)}`;
  } catch {
    // Not JSON; the status says enough.
  }
  return new PluginError(errors.upstream, `Deepgram speech failed (HTTP ${response.status})${detail}`);
}

// Speaks one line. Returns PCM, at most 15 seconds.
export async function synthesize({apiKey, voice, text, fetch = globalThis.fetch}) {
  if (!apiKey) throw new PluginError(errors.needsSetup, 'Add your Deepgram API key in Settings > Plugins.');
  const model = fluxVoices.includes(voice) ? voice : defaultVoice;
  let response;
  try {
    response = await fetch(speakRequestUrl(model), {
      method: 'POST',
      headers: {Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({text}),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch (error) {
    throw new PluginError(errors.upstream, error?.name === 'TimeoutError'
      ? 'Deepgram did not answer in time.' : 'Could not reach Deepgram. Check the internet connection.');
  }
  if (!response.ok) throw await deepgramError(response);
  const pcm = pcmFromAudio(Buffer.from(await response.arrayBuffer()));
  if (pcm.length === 0) throw new PluginError(errors.upstream, 'Deepgram returned no audio.');
  if (pcm.length > sampleRate * maxSeconds * 2)
    throw new PluginError(errors.upstream, 'That line is longer than 15 seconds of speech.');
  return pcm;
}
