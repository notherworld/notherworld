import { createRoot } from 'react-dom/client';
import './index.css';
import './console.css';
import App from './App.tsx';

// No StrictMode: it double-invokes effects in dev, which would build the world
// twice. The sim is the source of truth, so we keep a single clean instance.
createRoot(document.getElementById('root')!).render(<App />);
