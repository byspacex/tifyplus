// Spotify's SDK calls this global as soon as its remote script is ready.
// Define it before loading the SDK so fast mobile/network loads cannot race
// the main application module.
window.__tifySpotifySdkReady = false;
window.__tifySpotifySdkReadyPromise = new Promise((resolve) => {
  window.onSpotifyWebPlaybackSDKReady = () => {
    window.__tifySpotifySdkReady = true;
    resolve();
  };
});

window.__tifySpotifyIframeApiPromise = new Promise((resolve) => {
  window.onSpotifyIframeApiReady = (IFrameAPI) => {
    window.__tifySpotifyIframeApi = IFrameAPI;
    resolve(IFrameAPI);
  };
});
