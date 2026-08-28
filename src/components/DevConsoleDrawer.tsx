import React, { useState, useEffect, useRef } from 'react';
import { Terminal, X, Trash2, Copy, Search, AlertCircle, AlertTriangle, Info, CheckCircle2, Bug, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useVirtualKeyboard } from '../context/KeyboardContext';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'log';
  message: string;
  details?: string;
  stack?: string;
}

// Global log buffer accessible outside React
const logBuffer: LogEntry[] = [];
const logSubscribers = new Set<() => void>();

let notifyScheduled = false;

function notifySubscribers() {
  if (!notifyScheduled) {
    notifyScheduled = true;
    queueMicrotask(() => {
      notifyScheduled = false;
      logSubscribers.forEach((cb) => cb());
    });
  }
}

function safeFormatArg(a: any): string {
  if (a === null || a === undefined) return String(a);
  if (typeof a === 'bigint') return a.toString();
  if (typeof a === 'object') {
    if (a instanceof Error) return a.stack || a.message || String(a);
    if (typeof a.message === 'string' && Object.keys(a).length === 1) return a.message;
    try {
      return JSON.stringify(a, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
    } catch (e) {
      return String(a);
    }
  }
  return String(a);
}

function sanitizeText(str: string): string {
  if (!str || typeof str !== 'string') return str;
  
  let sanitized = str;

  // 1. Redact 64-character hex strings (private keys, seed hexes, etc.)
  sanitized = sanitized.replace(/\b[0-9a-fA-F]{64}\b/g, '[REDACTED_HEX]');

  // 2. Redact kprv / xprv / priv key sequences
  sanitized = sanitized.replace(/\b(kprv|xprv|priv|kpub|xpub)[a-zA-Z0-9]{30,}\b/gi, '[REDACTED_KEY]');

  // 3. Redact potential BIP39 mnemonics (12 or 24 lowercase words)
  const mnemonicRegex12 = /\b[a-z]{3,12}(?:\s+[a-z]{3,12}){11}\b/gi;
  const mnemonicRegex24 = /\b[a-z]{3,12}(?:\s+[a-z]{3,12}){23}\b/gi;
  sanitized = sanitized.replace(mnemonicRegex24, '[REDACTED_MNEMONIC_24]');
  sanitized = sanitized.replace(mnemonicRegex12, '[REDACTED_MNEMONIC_12]');

  // 4. Redact email addresses just in case (as privacy best practice)
  sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]');

  // 5. Redact standard password/secret patterns in text like passphrase=xyz or pass=xyz
  sanitized = sanitized.replace(/(password|passphrase|passwd|pwd|pass|secret|seed|mnemonic)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]');

  return sanitized;
}

function sanitizeValue(val: any, keyName?: string, visited = new WeakSet<any>()): any {
  if (val === null || val === undefined) return val;

  const sensitiveKeys = [
    'privatekey', 'private_key', 'privkey', 'mnemonic', 'seed', 'password', 
    'secret', 'key', 'auth', 'credential', 'kprv', 'xprv', 'passphrase', 
    'pin', 'canary', 'ciphertext', 'salt', 'iv', 'entropy'
  ];

  // If keyName is sensitive, redact immediately
  if (keyName && sensitiveKeys.some(sk => keyName.toLowerCase().includes(sk))) {
    return '[REDACTED_SECRET]';
  }

  // Handle strings
  if (typeof val === 'string') {
    return sanitizeText(val);
  }

  // Handle circular references and objects
  if (typeof val === 'object') {
    if (visited.has(val)) {
      return '[CIRCULAR_REFERENCE]';
    }
    visited.add(val);

    // Handle Errors
    if (val instanceof Error) {
      return {
        name: val.name,
        message: sanitizeText(val.message),
        stack: sanitizeText(val.stack || ''),
      };
    }

    // Handle ArrayBuffer and TypedArrays (e.g. Uint8Array)
    if (ArrayBuffer.isView(val) || val instanceof ArrayBuffer) {
      const length = (val as any).length !== undefined ? (val as any).length : (val as any).byteLength;
      
      // If it looks like a private key (32 bytes) or a seed (32 or 64 bytes), redact it completely
      if (length === 32 || length === 64) {
        return `[REDACTED_BUFFER_${length}_BYTES]`;
      }
      
      // Otherwise, convert small buffers to a clean representation but sanitize elements
      if (length > 128) {
        return `[TypedArray: length ${length}]`;
      }
      
      try {
        const arr = Array.from(val as any);
        if (arr.length === 32 || arr.length === 64) {
          return `[REDACTED_BUFFER_${arr.length}_BYTES]`;
        }
        return arr.map(item => sanitizeValue(item, undefined, visited));
      } catch (e) {
        return `[TypedArray: length ${length}]`;
      }
    }

    // Handle standard Arrays
    if (Array.isArray(val)) {
      // If it's an array of 12 or 24 strings that look like lowercase words (mnemonic)
      if (val.length === 12 || val.length === 24) {
        const isMnemonicArray = val.every(item => typeof item === 'string' && /^[a-z]{3,12}$/.test(item));
        if (isMnemonicArray) {
          return `[REDACTED_MNEMONIC_${val.length}_ARRAY]`;
        }
      }
      return val.map(item => sanitizeValue(item, undefined, visited));
    }

    // Handle generic objects
    const sanitizedObj: Record<string, any> = {};
    const keys = Object.keys(val);
    for (const k of keys) {
      if (sensitiveKeys.some(sk => k.toLowerCase().includes(sk))) {
        sanitizedObj[k] = '[REDACTED_SECRET]';
      } else {
        try {
          sanitizedObj[k] = sanitizeValue(val[k], k, visited);
        } catch (e) {
          sanitizedObj[k] = '[UNSUPPORTED_OR_CORRUPT_PROPERTY]';
        }
      }
    }
    return sanitizedObj;
  }

  // Handle functions
  if (typeof val === 'function') {
    return `[Function: ${val.name || 'anonymous'}]`;
  }

  return val;
}

export function addDevLog(level: 'error' | 'warn' | 'info' | 'log', message: string, details?: any) {
  const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + String(new Date().getMilliseconds()).padStart(3, '0');
  
  const sanitizedMessage = sanitizeText(String(message));
  const sanitizedDetails = details !== undefined && details !== null ? sanitizeValue(details) : undefined;

  let formattedDetails: string | undefined;
  if (sanitizedDetails !== undefined && sanitizedDetails !== null) {
    if (typeof sanitizedDetails === 'object') {
      try {
        formattedDetails = JSON.stringify(sanitizedDetails, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
      } catch (e) {
        formattedDetails = String(sanitizedDetails);
      }
    } else if (typeof sanitizedDetails === 'bigint') {
      formattedDetails = sanitizedDetails.toString();
    } else {
      formattedDetails = String(sanitizedDetails);
    }
  }

  const entry: LogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: timeStr,
    level,
    message: sanitizedMessage,
    details: formattedDetails,
  };

  logBuffer.push(entry);
  if (logBuffer.length > 300) {
    logBuffer.shift(); // keep last 300 logs
  }
  notifySubscribers();
}

// Monkey-patch console to catch all application errors & logs automatically
const globalObj = typeof window !== 'undefined' ? (window as any) : {};
if (typeof window !== 'undefined' && !globalObj.__KASPRIV_CONSOLE_PATCHED__) {
  globalObj.__KASPRIV_CONSOLE_PATCHED__ = true;

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalInfo = console.info;

  globalObj.__KASPRIV_ORIGINALS__ = {
    log: originalLog,
    warn: originalWarn,
    error: originalError,
    info: originalInfo
  };

  console.log = (...args: any[]) => {
    try {
      const sanitizedArgs = args.map(arg => sanitizeValue(arg));
      globalObj.__KASPRIV_ORIGINALS__.log.apply(console, sanitizedArgs);
    } catch (e) {
      try {
        originalLog.call(console, '[LOG_SANITIZED]');
      } catch (_) {}
    }
  };

  console.warn = (...args: any[]) => {
    try {
      const sanitizedArgs = args.map(arg => sanitizeValue(arg));
      globalObj.__KASPRIV_ORIGINALS__.warn.apply(console, sanitizedArgs);
      const msg = sanitizedArgs.map(safeFormatArg).join(' ');
      addDevLog('warn', msg);
    } catch (e) {
      try {
        originalWarn.call(console, '[WARN_SANITIZED]');
      } catch (_) {}
    }
  };

  console.error = (...args: any[]) => {
    try {
      const sanitizedArgs = args.map(arg => sanitizeValue(arg));
      globalObj.__KASPRIV_ORIGINALS__.error.apply(console, sanitizedArgs);
      const msg = sanitizedArgs.map(safeFormatArg).join(' ');
      addDevLog('error', msg, sanitizedArgs.length > 1 ? sanitizedArgs.slice(1) : undefined);
    } catch (e) {
      try {
        originalError.call(console, '[ERROR_SANITIZED]');
      } catch (_) {}
    }
  };

  console.info = (...args: any[]) => {
    try {
      const sanitizedArgs = args.map(arg => sanitizeValue(arg));
      globalObj.__KASPRIV_ORIGINALS__.info.apply(console, sanitizedArgs);
    } catch (e) {
      try {
        originalInfo.call(console, '[INFO_SANITIZED]');
      } catch (_) {}
    }
  };

  window.addEventListener('error', (event) => {
    addDevLog('error', `Uncaught Error: ${event.message}`, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    addDevLog('error', `Unhandled Promise Rejection: ${reason?.message || String(reason)}`, {
      reason,
      stack: reason?.stack,
    });
  });

  addDevLog('info', 'Developer Console initialized - Monitoring Kaspa Wallet runtime logs & node activity');
}

export const DevConsoleDrawer: React.FC = () => {
  const { openKeyboard } = useVirtualKeyboard();
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([...logBuffer]);
  const [filterLevel, setFilterLevel] = useState<'all' | 'error' | 'warn' | 'info' | 'log'>('error');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleUpdate = () => {
      setLogs([...logBuffer]);
    };
    logSubscribers.add(handleUpdate);
    return () => {
      logSubscribers.delete(handleUpdate);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length, isOpen]);

  const filteredLogs = logs.filter((log) => {
    if (filterLevel !== 'all' && log.level !== filterLevel) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchMsg = log.message.toLowerCase().includes(q);
      const matchDetails = log.details?.toLowerCase().includes(q) || false;
      return matchMsg || matchDetails;
    }
    return true;
  });

  const errorCount = logs.filter(l => l.level === 'error').length;
  const warnCount = logs.filter(l => l.level === 'warn').length;

  const handleClear = () => {
    logBuffer.length = 0;
    setLogs([]);
    addDevLog('info', 'Console logs cleared');
  };

  const handleCopy = () => {
    const text = logs
      .map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message} ${l.details ? '\n' + l.details : ''}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))] right-3 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#090D12]/90 backdrop-blur-sm border border-[#212B38] hover:border-[#70C7BA] text-slate-300 hover:text-[#70C7BA] font-mono text-[11px] transition-all active:scale-95 shadow-md cursor-pointer"
        title="Open Developer Console"
      >
        <Terminal className="w-3.5 h-3.5 text-[#70C7BA]" />
        <span className="font-bold">Console</span>
        {errorCount > 0 && (
          <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-bold border border-rose-500/30">
            {errorCount}
          </span>
        )}
      </button>

      {/* Slide-Up Console Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-50 h-[80vh] max-w-2xl mx-auto bg-[#0B0F17] border-t border-[#212B38] rounded-t-3xl  flex flex-col font-mono text-xs overflow-hidden"
          >
            {/* Console Header Bar */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#090D12] border-b border-[#212B38]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#70C7BA]/10 text-[#70C7BA]">
                  <Bug className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-100 text-sm tracking-wide flex items-center gap-2">
                    Developer Console
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#212B38] text-slate-400 font-normal">
                      {logs.length} events
                    </span>
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded-lg bg-[#1A2330] hover:bg-[#212B38] text-slate-300 transition-colors flex items-center gap-1"
                  title="Copy logs to clipboard"
                >
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={handleClear}
                  className="p-1.5 rounded-lg bg-[#1A2330] hover:bg-rose-500/20 hover:text-rose-400 text-slate-300 transition-colors"
                  title="Clear console"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg bg-[#1A2330] hover:bg-[#212B38] text-slate-400 hover:text-slate-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="p-2.5 bg-[#0D121B] border-b border-[#212B38] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {(['all', 'error', 'warn', 'info', 'log'] as const).map((lvl) => {
                  const active = filterLevel === lvl;
                  let badgeColor = 'text-slate-400 bg-[#090D12]';
                  if (active) badgeColor = 'text-[#090D12] bg-[#70C7BA] font-extrabold';
                  if (lvl === 'error' && errorCount > 0 && !active) badgeColor = 'text-rose-400 bg-rose-500/10 border border-rose-500/30';
                  if (lvl === 'warn' && warnCount > 0 && !active) badgeColor = 'text-amber-400 bg-amber-500/10 border border-amber-500/30';

                  return (
                    <button
                      key={lvl}
                      onClick={() => setFilterLevel(lvl)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] uppercase font-bold transition-all ${badgeColor}`}
                    >
                      {lvl} {lvl === 'error' && errorCount > 0 ? `(${errorCount})` : ''}
                    </button>
                  );
                })}
              </div>

              <div className="relative flex-1 min-w-[140px] max-w-xs">
                <Search className="w-3 h-3 absolute left-2.5 top-2.5 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onFocus={() => openKeyboard({ value: searchQuery, onChange: setSearchQuery })}
                  onClick={() => openKeyboard({ value: searchQuery, onChange: setSearchQuery })}
                  inputMode="none" onChange={() => {}}
                  placeholder="Filter logs..."
                  className="w-full pl-7 pr-3 py-1 bg-[#090D12] border border-[#212B38] focus:border-[#70C7BA] rounded-lg text-[11px] text-slate-200 outline-none cursor-pointer"
                />
              </div>
            </div>

            {/* Console Log Terminal Stream */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 selection:bg-[#70C7BA]/30">
              {filteredLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center py-12">
                  <Terminal className="w-8 h-8 mb-2 opacity-40 text-[#70C7BA]" />
                  <p className="font-bold">No console events captured</p>
                  <p className="text-[10px] mt-1 text-slate-600">Runtime console logs, broadcast responses, and RPC errors will appear here</p>
                </div>
              ) : (
                filteredLogs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  let levelIcon = <Info className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />;
                  let bgClass = 'bg-[#090D12]/60 border-[#212B38]';
                  let textClass = 'text-slate-200';

                  if (log.level === 'error') {
                    levelIcon = <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />;
                    bgClass = 'bg-rose-950/20 border-rose-800/40';
                    textClass = 'text-rose-300 font-semibold';
                  } else if (log.level === 'warn') {
                    levelIcon = <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />;
                    bgClass = 'bg-amber-950/20 border-amber-800/40';
                    textClass = 'text-amber-200';
                  } else if (log.level === 'info') {
                    levelIcon = <Info className="w-3.5 h-3.5 text-[#70C7BA] flex-shrink-0" />;
                    bgClass = 'bg-[#70C7BA]/5 border-[#70C7BA]/20';
                    textClass = 'text-emerald-300';
                  }

                  return (
                    <div
                      key={log.id}
                      onClick={() => log.details && setExpandedLogId(isExpanded ? null : log.id)}
                      className={`p-2.5 rounded-xl border ${bgClass} transition-all ${log.details ? 'cursor-pointer hover:border-slate-500/50' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        {levelIcon}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[9px] text-slate-500 font-mono">{log.timestamp}</span>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-extrabold uppercase ${
                              log.level === 'error' ? 'bg-rose-500/20 text-rose-400' :
                              log.level === 'warn' ? 'bg-amber-500/20 text-amber-300' :
                              log.level === 'info' ? 'bg-emerald-500/20 text-emerald-300' :
                              'bg-slate-700/50 text-slate-400'
                            }`}>
                              {log.level}
                            </span>
                          </div>
                          <p className={`text-xs break-all whitespace-pre-wrap ${textClass}`}>
                            {log.message}
                          </p>
                        </div>
                        {log.details && (
                          <div className="text-slate-500 pt-0.5">
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </div>
                        )}
                      </div>

                      {/* Expanded Object/JSON Details */}
                      {log.details && isExpanded && (
                        <div className="mt-2 pt-2 border-t border-[#212B38] overflow-x-auto">
                          <pre className="text-[10px] leading-relaxed text-slate-300 font-mono bg-[#090D12] p-2 rounded-lg  whitespace-pre-wrap break-all">
                            {log.details}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={logsEndRef} />
            </div>

            {/* Bottom Info Bar */}
            <div className="px-3 py-1.5 bg-[#0D121B] border-t border-[#212B38] text-[10px] text-slate-500 flex justify-between items-center">
              <span>Capturing critical errors, warnings & network failures</span>
              <button
                onClick={() => setLogs([...logBuffer])}
                className="flex items-center gap-1 text-[#70C7BA] hover:underline font-bold"
              >
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
