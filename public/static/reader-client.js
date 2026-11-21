// src/lib/reader-client.ts
import {
  createReader,
  createRuntimeHost,
  parseEnvelope,
  readReaderConfig
} from "./novel-reader/index.js";
var config = readReaderConfig(document);
var requestId = 0;
var command = (method, payload) => {
  transport.onmessage?.({
    data: JSON.stringify({
      protocolVersion: 1,
      documentId: config.documentId,
      kind: "command",
      requestId: "dev-" + ++requestId,
      method,
      payload
    })
  });
};
var transport = {
  onmessage: null,
  postMessage(raw) {
    const message = parseEnvelope(raw, config.documentId);
    if (message.kind === "command") {
      transport.onmessage?.({
        data: JSON.stringify({
          protocolVersion: 1,
          documentId: config.documentId,
          kind: "result",
          requestId: message.requestId,
          ...message.method === "media.requestProtectedPlayback" ? { payload: true } : {
            error: {
              code: "unsupported_request",
              message: "Unsupported Electron reader request: " + message.method
            }
          }
        })
      });
    } else if (message.kind === "event") {
      if (message.method === "reader.error") {
        const payload = message.payload;
        console.error("[Reader]", payload.message);
        command("feedback.show", {
          severity: "error",
          presentation: "boundary",
          title: "Reader error",
          message: payload.message,
          dismissible: true
        });
      } else if (message.method === "reader.refetch" || message.method === "feedback.retry") {
        void window.readerDev.refetch().catch((error) => window.nekori?.error(String(error)));
      } else if (message.method === "clipboard.copy") {
        void window.readerDev.copy(message.payload.text);
      } else {
        console.debug("[Reader event]", message.method, message.payload);
      }
    } else if (message.kind === "result" && message.error) {
      console.error("[Reader command]", message.error);
    }
  }
};
var host = createRuntimeHost({
  root: document.documentElement,
  config,
  transport
});
var reader = createReader({ root: document.documentElement, host, config });
void reader.ready.then(async () => {
  command("anchors.install");
  const scriptUrl = document.querySelector(
    "#nekori-source-script"
  )?.dataset.src;
  if (scriptUrl) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = scriptUrl;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Unable to load customJS: " + scriptUrl));
      document.head.append(script);
    });
  }
}).catch((error) => reader.error(String(error)));
window.addEventListener(
  "unhandledrejection",
  (event) => reader.error(String(event.reason))
);
window.addEventListener("pagehide", () => reader.dispose(), { once: true });
