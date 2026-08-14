import 'cheerio';
import 'htmlparser2';
import 'dayjs';
import 'protobufjs';
import './index.css';

import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { registerPreviewStorageBridge } from './lib/preview-bridge';

registerPreviewStorageBridge();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <App />,
);
