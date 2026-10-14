import assert from 'node:assert/strict';
import test from 'node:test';
import {pcmFromAudio, speakRequestUrl, synthesize} from '../deepgram.mjs';

const key = '0123456789abcdef0123456789abcdef01234567';

function fakeFetch(respond) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({url, init});
    return respond(url, init);
  };
  return {fetch, calls};
}

test('asks Flux for raw 24 kHz linear16 audio with a token header', async () => {
  const pcm = Buffer.from([1, 0, 2, 0, 3, 0]);
  const {fetch, calls} = fakeFetch(() => new Response(pcm));
  assert.deepEqual(await synthesize({apiKey: key, voice: 'flux-cole-en', text: 'Hello there', fetch}), pcm);
  const {url, init} = calls[0];
  assert.equal(url.origin + url.pathname, 'https://api.deepgram.com/v2/speak');
  assert.equal(url.searchParams.get('model'), 'flux-cole-en');
  assert.equal(url.searchParams.get('encoding'), 'linear16');
  assert.equal(url.searchParams.get('sample_rate'), '24000');
  assert.equal(url.searchParams.get('container'), 'none');
  assert.deepEqual(init.headers, {Authorization: `Token ${key}`, 'Content-Type': 'application/json'});
  assert.equal(init.body, JSON.stringify({text: 'Hello there'}));
  assert.equal(speakRequestUrl('flux-drew-en').searchParams.get('model'), 'flux-drew-en');
});

test('falls back to the default voice for an unknown one', async () => {
  const {fetch, calls} = fakeFetch(() => new Response(Buffer.alloc(2)));
  await synthesize({apiKey: key, voice: 'aura-2-thalia-en', text: 'Hi', fetch});
  assert.equal(calls[0].url.searchParams.get('model'), 'flux-haley-en');
});

test('maps Deepgram failures to setup or service errors without the key', async () => {
  for (const [status, code, pattern] of [[401, -32003, /rejected the API key/], [403, -32003, /rejected the API key/],
                                         [429, -32004, /rate limit/], [400, -32004, /HTTP 400\): bad model/]]) {
    const {fetch} = fakeFetch(() => new Response(JSON.stringify({err_msg: 'bad model'}), {status}));
    await assert.rejects(synthesize({apiKey: key, voice: 'flux-haley-en', text: 'hi', fetch}), error => {
      assert.equal(error.code, code);
      assert.match(error.message, pattern);
      assert.doesNotMatch(error.message, new RegExp(key));
      return true;
    });
  }
  await assert.rejects(synthesize({apiKey: key, text: 'hi', fetch: async () => { throw new TypeError('fetch failed'); }}),
                       /Could not reach Deepgram/);
  await assert.rejects(synthesize({apiKey: '', text: 'hi', fetch: async () => assert.fail('no call without a key')}),
                       error => error.code === -32003);
});

test('rejects more than 15 seconds and empty replies', async () => {
  const long = fakeFetch(() => new Response(Buffer.alloc(24000 * 2 * 15 + 2)));
  await assert.rejects(synthesize({apiKey: key, text: 'hi', fetch: long.fetch}), /longer than 15 seconds/);
  const empty = fakeFetch(() => new Response(Buffer.alloc(0)));
  await assert.rejects(synthesize({apiKey: key, text: 'hi', fetch: empty.fetch}), /no audio/);
});

test('takes the samples out of a WAV wrapper, even with a placeholder size, and trims odd bytes', () => {
  const wav = Buffer.alloc(44);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(0xffffffff, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.write('data', 36);
  wav.writeUInt32LE(0xffffffff, 40);
  assert.deepEqual(pcmFromAudio(Buffer.concat([wav, Buffer.from([5, 0, 6, 0, 7])])), Buffer.from([5, 0, 6, 0]));
  assert.deepEqual(pcmFromAudio(Buffer.from([1, 2, 3])), Buffer.from([1, 2]));
});
