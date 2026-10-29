import React from 'react';
import ReactDOM from 'react-dom/client';
import { GuestApp } from './GuestApp';
import { setPdfWatermark } from '../utils/pdfWatermark';
import '../index.css';

// Demostracion /invitado: todos los PDF salen con la marca de agua.
setPdfWatermark('EJEMPLO');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <GuestApp />
  </React.StrictMode>
);
