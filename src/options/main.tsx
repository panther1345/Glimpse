import { createRoot } from 'react-dom/client';
import '../lib/base.css';
import './options.css';
import { watchTheme } from '../lib/theme';
import { Options } from './Options';
watchTheme();
createRoot(document.getElementById('root')!).render(<Options />);
