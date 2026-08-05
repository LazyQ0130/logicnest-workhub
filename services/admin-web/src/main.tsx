import 'antd/dist/reset.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { APP_TITLE } from './brand';

document.title = APP_TITLE;

const root = document.getElementById('root');
if (!root) throw new Error('Admin web root element was not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
