import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

console.log(`
%c
 _   _  ____   _____  ____
| | | ||  _ \\ | ____|/ ___|
| | | || | | ||  _|  \\___ \\
| |_| || |_| || |___  ___) |
 \\___/ |____/ |_____||____/

%cEvalPro. v1.0
%cDesarrollado por la Oficina de Talento Humano campus Valledupar, con apoyo de JGC.
`,
  'color: #2563eb; font-weight: bold; font-family: monospace;',
  'color: #0f172a; font-weight: bold; font-size: 14px; margin-top: 10px;',
  'color: #64748b; font-size: 12px; margin-top: 5px;'
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
