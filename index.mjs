// Deepgram Speech for Agent Buddy: the Flux speech provider and its settings.
import {defaultVoice, sampleRate, synthesize} from './deepgram.mjs';
import {errors, PluginError, startPlugin} from './rpc.mjs';


// Exported so the tests can run the plugin in-process with fake streams and a fake fetch.
export function run({fetch = globalThis.fetch, ...options} = {}) {
  let settings = {};
  // Missing a key is the only setup Deepgram needs; no network call is made to check it.
  const report = host => {
    if (settings.apiKey) host.status('ready');
    else host.status('needsSetup', 'Add your Deepgram API key in Settings > Plugins.');
  };
  return startPlugin({
    ...options,
    methods: {
      initialize(params, host) {
        settings = params.settings ?? {};
        report(host);
        return {api: '1.0'};
      },
      async 'speech/synthesize'(params, host) {
        if (params.provider !== 'flux') throw new PluginError(errors.invalidParams, 'Unknown speech provider.');
        try {
          const pcm = await synthesize({apiKey: settings.apiKey, voice: settings.voice ?? defaultVoice,
                                        text: params.text, fetch});
          return {audio: {encoding: 's16le', sampleRate, channels: 1, data: pcm.toString('base64')}};
        } catch (error) {
          // A rejected key needs the user's attention in Plugins, not just in the log.
          if (error instanceof PluginError && error.code === errors.needsSetup && settings.apiKey)
            host.status('needsSetup', error.message);
          throw error;
        }
      },
    },
    notifications: {
      'settings/changed'(params, host) {
        settings = params.settings ?? {};
        report(host);
      },
    },
  });
}
