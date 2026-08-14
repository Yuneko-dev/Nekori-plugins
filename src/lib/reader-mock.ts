export const readerMockScript = String.raw`
<script>
  console.log('[Electron Mock] Initializing WebView Reader JS Context APIs...');

  const ORIGINAL_FETCH = Symbol('lnreader');
  window[ORIGINAL_FETCH] = window.fetch;
  
  window.ReactNativeWebView = {
    postMessage: (msg) => {
      console.log('[ReactNativeWebView] postMessage:', msg);
    }
  };

  const createMockState = (initialValue, name) => {
    let value = initialValue;
    return {
      get val() {
        console.log('[State: ' + name + '] GET:', value);
        return value;
      },
      set val(newValue) {
        console.log('[State: ' + name + '] SET:', newValue);
        value = newValue;
      }
    };
  };

  window.van = new Proxy({
    state: (init) => createMockState(init, 'van.state')
  }, {
    get: (target, prop) => {
      if (prop in target) return target[prop];
      return new Proxy(() => {}, {
        apply: (fn, thisArg, args) => {
          console.log('[VanJS] Called ' + String(prop), args);
          return document.createElement('div');
        },
        get: (fn, innerProp) => {
           console.log('[VanJS] Accessed ' + String(prop) + '.' + String(innerProp));
           return (...args) => {
              console.log('[VanJS] Called ' + String(prop) + '.' + String(innerProp), args);
              return document.createElement('div');
           };
        }
      });
    }
  });

  window.tts = {
    get started() { console.log('[TTS] GET started'); return false; },
    get reading() { console.log('[TTS] GET reading'); return false; },
    start: (el) => console.log('[TTS] start()', el),
    resume: () => console.log('[TTS] resume()'),
    pause: () => console.log('[TTS] pause()'),
    stop: () => console.log('[TTS] stop()'),
    rewind: () => console.log('[TTS] rewind()'),
    next: () => console.log('[TTS] next()'),
    seekTo: (pos) => console.log('[TTS] seekTo()', pos),
    readable: (el) => console.log('[TTS] readable()', el),
    setLoading: (l) => console.log('[TTS] setLoading()', l),
    scrollToElement: (el) => console.log('[TTS] scrollToElement()', el)
  };

  window.pageReader = {
    page: createMockState(1, 'pageReader.page'),
    totalPages: createMockState(1, 'pageReader.totalPages'),
    movePage: (page) => console.log('[PageReader] movePage()', page)
  };

  window.reader = {
    get novel() { console.log('[Reader] GET novel'); return { name: 'Simulated Novel' }; },
    get chapter() { console.log('[Reader] GET chapter'); return { name: 'Simulated Chapter' }; },
    get nextChapter() { console.log('[Reader] GET nextChapter'); return null; },
    get autoSaveInterval() { console.log('[Reader] GET autoSaveInterval'); return 5000; },
    get rawHTML() { console.log('[Reader] GET rawHTML'); return document.body.innerHTML; },
    get strings() { console.log('[Reader] GET strings'); return {}; },
    get chapterElement() { console.log('[Reader] GET chapterElement'); return document.body; },
    get viewport() { console.log('[Reader] GET viewport'); return document.querySelector('meta[name="viewport"]'); },
    get selection() { console.log('[Reader] GET selection'); return window.getSelection(); },
    
    get paddingTop() { console.log('[Reader] GET paddingTop'); return 0; },
    get layoutHeight() { console.log('[Reader] GET layoutHeight'); return window.innerHeight; },
    get layoutWidth() { console.log('[Reader] GET layoutWidth'); return window.innerWidth; },
    get chapterHeight() { console.log('[Reader] GET chapterHeight'); return document.body.scrollHeight; },
    get chapterWidth() { console.log('[Reader] GET chapterWidth'); return document.body.scrollWidth; },

    generalSettings: createMockState({}, 'reader.generalSettings'),
    readerSettings: createMockState({}, 'reader.readerSettings'),
    batteryLevel: createMockState(100, 'reader.batteryLevel'),
    hidden: createMockState(false, 'reader.hidden'),

    post: function(obj) {
      console.log('[Reader] post():', obj);
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(obj));
      }
    },
    refetch: function() {
      console.log('[Reader] refetch()');
    },
    error: function(msg) {
      console.error('[Reader] error():', msg);
    },
    fetch: async function(url, init = {}) {
      const targetUrl = encodeURIComponent(url);
      const proxyUrl = 'lnproxy://proxy?url=' + targetUrl;

      let modifiedHeaders = {};
      if (init.headers) {
        const h = new Headers(init.headers);
        h.forEach((value, key) => {
          modifiedHeaders['x-ln-forward-header-' + key] = value;
        });
      }

      const modifiedInit = { ...init };
      modifiedInit.headers = modifiedHeaders;

      console.log('[LNReader] fetch proxying to:', url);
      return window[ORIGINAL_FETCH](proxyUrl, modifiedInit);
    }
  };
</script>
`;
