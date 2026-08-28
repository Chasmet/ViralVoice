const media = require('./media');
const fastMux = require('./fast-mux');

media.muxVideoWithDub = async function patchedMuxVideoWithDub(options) {
  return fastMux.muxVideoFast({
    ...options,
    durationSeconds: options.durationSeconds || 300,
    jobId: options.jobId || 'viralvoice'
  });
};
