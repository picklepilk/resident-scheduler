import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import './index.css';
import ResidentScheduler from './ResidentScheduler';
import ResidentRequestsApp from './residentRequests/ResidentRequestsApp';

const isRequestsRoute = window.location.pathname.replace(/\/+$/, '') === '/requests';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isRequestsRoute ? <ResidentRequestsApp /> : <ResidentScheduler />}
  </React.StrictMode>
);
