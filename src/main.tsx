import React from 'react';
import ReactDOM from 'react-dom/client';
import AuthShell from './AuthShell';
import { NetworkStatusBanner } from './components/NetworkStatusBanner';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <NetworkStatusBanner />
    <AuthShell />
  </React.StrictMode>
);

