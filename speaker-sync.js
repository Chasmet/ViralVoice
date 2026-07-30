(() => {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input, init = {}) => {
    const url = String(input || '');
    const body = init && init.body;

    if (url.includes('/api/dub-video') && body instanceof FormData) {
      const firstSpeakerRole = document.getElementById('firstSpeakerRole');
      const maleVoice = document.getElementById('maleVoice');
      const femaleVoice = document.getElementById('femaleVoice');

      body.set('firstSpeakerRole', firstSpeakerRole ? firstSpeakerRole.value : 'male');
      body.set('maleVoice', maleVoice ? maleVoice.value : 'cedar');
      body.set('femaleVoice', femaleVoice ? femaleVoice.value : 'coral');
    }

    return nativeFetch(input, init);
  };
})();
