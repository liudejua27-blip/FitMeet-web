import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './global.css';
import './index.css';
import './styles/platformTheme.css';
import './styles/fitmeet-design-system.css';
import './styles/website-platform.css';
import './styles/motion-enhancements.css';
import './styles/app-social-system.css';
import './styles/visual-upgrades.css';
import './styles/website-enterprise.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
