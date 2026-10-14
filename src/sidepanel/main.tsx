import { createRoot } from 'react-dom/client';
import '../lib/base.css';
import './panel.css';
import 'highlight.js/styles/github-dark.css';
import { watchTheme } from '../lib/theme';
import { App } from './App';
watchTheme();
createRoot(document.getElementById('root')!).render(<App />);
