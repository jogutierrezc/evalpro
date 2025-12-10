import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global error handler
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  // Prevent default error handling to avoid breaking the app
  event.preventDefault();
});

// Unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  event.preventDefault();
});

// Suppress specific console warnings in production
if (import.meta.env.PROD) {
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    const msgStr = args.join(' ');
    // Suppress known harmless warnings
    if (msgStr.includes('Warning:') && msgStr.includes('ReactDOM.render')) return;
    if (msgStr.includes('findDOMNode')) return;
    originalWarn.apply(console, args);
  };
}

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

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
