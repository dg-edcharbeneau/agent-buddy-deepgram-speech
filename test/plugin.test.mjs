import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import test from 'node:test';
import {run} from '../index.mjs';

// Runs the plugin in-process, the way Agent Buddy talks to it, with a fake Deepgram.
function harness(fetch = async () => new Response(Buffer.from([1, 0, 2, 0]))) {
  const input = new PassThrough();
  const output = new PassThrough();
  const messages = [];
  let exited = null;
  output.on('data', chunk => {
    for (const line of chunk.toString().split('\n').filter(Boolean)) messages.push(JSON.parse(line));
  });
  run({input, output, fetch, exit: code => { exited = code; }});
  const send = message => input.write(`${JSON.stringify(message)}\n`);
  const reply = async id => {
    for (let i = 0; i < 200; i++) {
      const found = messages.find(message => message.id === id && message.method === undefined);
      if (found) return found;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error(`No reply to ${id}`);
  };
  const statuses = () => messages.filter(message => message.method === 'host/status').map(message => message.params);
  return {send, reply, statuses, input, exited: () => exited, messages};
}

const speak = (id, text = 'All done.') =>
  ({jsonrpc: '2.0', id, method: 'speech/synthesize', params: {provider: 'flux', text, purpose: 'notification'}});

test('needs setup until a key is saved, without calling Deepgram', async () => {
  let calls = 0;
  const plugin = harness(async () => { calls++; return new Response(Buffer.alloc(2)); });
  plugin.send({jsonrpc: '2.0', id: 1, method: 'initialize', params: {api: '1.0', settings: {voice: 'flux-haley-en'}}});
  assert.deepEqual((await plugin.reply(1)).result, {api: '1.0'});
  assert.equal(plugin.statuses().at(-1).state, 'needsSetup');
  plugin.send(speak(2));
  assert.equal((await plugin.reply(2)).error.code, -32003);
  assert.equal(calls, 0);
  plugin.send({jsonrpc: '2.0', method: 'settings/changed', params: {settings: {apiKey: 'k'.repeat(40), voice: 'flux-cole-en'}}});
  plugin.send(speak(3));
  const {audio} = (await plugin.reply(3)).result;
  assert.deepEqual(audio, {encoding: 's16le', sampleRate: 24000, channels: 1, data: Buffer.alloc(2).toString('base64')});
  assert.equal(plugin.statuses().at(-1).state, 'ready');
  assert.equal(calls, 1);
});

test('a rejected key sends the user back to Plugins', async () => {
  const plugin = harness(async () => new Response('{}', {status: 401}));
  plugin.send({jsonrpc: '2.0', id: 1, method: 'initialize', params: {settings: {apiKey: 'k'.repeat(40)}}});
  await plugin.reply(1);
  plugin.send(speak(2));
  const {error} = await plugin.reply(2);
  assert.equal(error.code, -32003);
  assert.equal(plugin.statuses().at(-1).state, 'needsSetup');
  assert.doesNotMatch(JSON.stringify(plugin.messages), /kkkkkkkk/);
});

test('answers pings and unknown methods, and exits when Agent Buddy closes stdin', async () => {
  const plugin = harness();
  plugin.send({jsonrpc: '2.0', id: 1, method: '$/ping', params: {}});
  assert.deepEqual((await plugin.reply(1)).result, {});
  plugin.send({jsonrpc: '2.0', id: 2, method: 'no/such', params: {}});
  assert.equal((await plugin.reply(2)).error.code, -32601);
  plugin.input.end();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(plugin.exited(), 0);
});
