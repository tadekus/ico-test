import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
// Assuming you have a base CSS file for global styles if needed, otherwise this line can be removed
// import './index.css'; 

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);