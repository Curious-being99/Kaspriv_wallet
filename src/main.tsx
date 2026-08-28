import './components/DevConsoleDrawer';
import { Buffer } from 'buffer';
import React, { Component, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initGlobalHaptics } from './utils/haptics';

if (typeof window !== 'undefined') {
  initGlobalHaptics();

  (window as any).Buffer = (window as any).Buffer || Buffer;
  (window as any).global = (window as any).global || window;
  (window as any).process = (window as any).process || { env: {} };
  (window as any).__dirname = (window as any).__dirname || '/';

  if (typeof TextEncoder !== 'undefined') {
    (globalThis as any).TextEncoder = TextEncoder;
    (window as any).TextEncoder = TextEncoder;
  }
  if (typeof TextDecoder !== 'undefined') {
    (globalThis as any).TextDecoder = TextDecoder;
    (window as any).TextDecoder = TextDecoder;
  }

  // Ensure require('util') polyfill has TextDecoder and TextEncoder
  try {
    const util = (window as any).require ? (window as any).require('util') : null;
    if (util) {
      if (!util.TextDecoder) util.TextDecoder = window.TextDecoder;
      if (!util.TextEncoder) util.TextEncoder = window.TextEncoder;
    }
  } catch (e) {}

  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason && (
      String(event.reason).includes('CompileError') ||
      String(event.reason).includes('WebAssembly') ||
      String(event.reason).includes('abort') ||
      String(event.reason).includes('length overflow')
    )) {
      console.warn('Prevented WASM/CompileError from interrupting app render:', event.reason);
      event.preventDefault();
    }
  });
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Unhandled App Error:', error, errorInfo);
  }

  handleReset = async () => {
    try {
      const { clearAllWalletsFromDB } = await import('./utils/storage');
      await clearAllWalletsFromDB();
    } catch (e) {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-[#090D12] text-slate-100 flex flex-col items-center justify-center p-6 text-center font-sans">
          <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4 font-bold text-2xl">
            !
          </div>
          <h1 className="text-xl font-bold mb-2 text-slate-100">Application Error Recovered</h1>
          <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
            An unexpected error occurred while processing runtime data. Click below to refresh session state safely.
          </p>
          <button
            onClick={this.handleReset}
            className="px-6 py-3 rounded-2xl bg-[#70C7BA] text-[#090D12] font-extrabold text-xs shadow-lg hover:bg-[#5eead4] transition-all"
          >
            Reset App State & Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// if ('serviceWorker' in navigator) {
//   window.addEventListener('load', () => {
//     navigator.serviceWorker.register('/sw.js').catch(err => {
//       console.log('ServiceWorker registration failed: ', err);
//     });
//   });
// }

