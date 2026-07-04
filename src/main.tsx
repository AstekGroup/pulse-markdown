import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/app.css';
import './styles/document.css';
import './styles/print.css';
import App from './App';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Élément #root introuvable.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
