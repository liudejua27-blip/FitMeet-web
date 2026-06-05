import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './global.css';
import './index.css';
import './styles/platformTheme.css';
import './styles/agent-workspace.css';
import './styles/website-platform.css';
import './styles/motion-enhancements.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
