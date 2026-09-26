import React from 'react';
import { createRoot } from 'react-dom/client';
import StoryboardStudio from './Workbench.jsx';

// Studio owns authentication. The editor never receives a write token.
document.documentElement.style.height = '100%';
document.body.style.cssText = 'margin:0;height:100%;background:#10171d';
document.getElementById('root').style.height = '100%';
createRoot(document.getElementById('root')).render(<React.StrictMode><StoryboardStudio /></React.StrictMode>);
