import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import Keyboard from 'react-simple-keyboard';
import 'react-simple-keyboard/build/css/index.css';
import { motion, AnimatePresence } from 'motion/react';
import { Clipboard, Trash2, Check } from 'lucide-react';

interface KeyboardContextType {
  openKeyboard: (props: {
    value: string;
    onChange: (val: string) => void;
    layoutName?: string;
    type?: string;
  }) => void;
  closeKeyboard: () => void;
  isKeyboardOpen: boolean;
}

const KEYBOARD_LAYOUTS = {
  default: [
    "q w e r t y u i o p",
    "a s d f g h j k l",
    "{shift} z x c v b n m {backspace}",
    "{123} {space} {enter}"
  ],
  shift: [
    "Q W E R T Y U I O P",
    "A S D F G H J K L",
    "{shift} Z X C V B N M {backspace}",
    "{123} {space} {enter}"
  ],
  numeric: [
    "1 2 3",
    "4 5 6",
    "7 8 9",
    ". 0 {backspace}",
    "{abc} {enter}"
  ],
  numbers: [
    "1 2 3 4 5 6 7 8 9 0",
    "- / : ; ( ) $ & @ \"",
    "{abc} . , ? ! ' {backspace}",
    "{abc} {space} {enter}"
  ]
};

const KEYBOARD_DISPLAY = {
  "{backspace}": "⌫",
  "{enter}": "Enter",
  "{shift}": "⇧",
  "{space}": " ",
  "{123}": "123",
  "{abc}": "ABC"
};

const KeyboardContext = createContext<KeyboardContextType | null>(null);

export const useVirtualKeyboard = () => {
  const ctx = useContext(KeyboardContext);
  if (!ctx) throw new Error('useVirtualKeyboard must be used within KeyboardProvider');
  return ctx;
};

export const KeyboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [layoutName, setLayoutName] = useState('default');
  const [inputType, setInputType] = useState('text');
  const [pastedNotice, setPastedNotice] = useState(false);
  const onChangeRef = useRef<(val: string) => void>();
  const keyboardRef = useRef<any>(null);

  const openKeyboard = useCallback(({ value, onChange, layoutName: initialLayout = 'default', type = 'text' }: {
    value: string;
    onChange: (val: string) => void;
    layoutName?: string;
    type?: string;
  }) => {
    const val = value || '';
    setInputValue(val);
    onChangeRef.current = onChange;
    setLayoutName(initialLayout);
    setInputType(type);
    setIsOpen(true);
    if (keyboardRef.current) {
        keyboardRef.current.setInput(val);
    }
  }, []);

  const closeKeyboard = useCallback(() => {
    setIsOpen(false);
  }, []);

  const onChange = useCallback((input: string) => {
    setInputValue(input);
    if (onChangeRef.current) {
      onChangeRef.current(input);
    }
  }, []);

  const onKeyPress = useCallback((button: string) => {
    if (button === "{shift}") {
      setLayoutName(prev => (prev === "default" ? "shift" : "default"));
    } else if (button === "{123}") {
      const newLayout = inputType === 'number' ? "numeric" : "numbers";
      setLayoutName(prev => (prev === newLayout ? "default" : newLayout));
    } else if (button === "{abc}") {
      setLayoutName("default");
    } else if (button === "{enter}") {
      closeKeyboard();
    } else if (button === "{backspace}") {
        const newValue = inputValue.slice(0, -1);
        setInputValue(newValue);
        if (onChangeRef.current) {
            onChangeRef.current(newValue);
        }
        if (keyboardRef.current) {
            keyboardRef.current.setInput(newValue);
        }
    } else if (button === "{space}") {
        const newValue = inputValue + " ";
        setInputValue(newValue);
        if (onChangeRef.current) {
            onChangeRef.current(newValue);
        }
        if (keyboardRef.current) {
            keyboardRef.current.setInput(newValue);
        }
    }
  }, [closeKeyboard, inputType, inputValue]);

  const [showPasteFallback, setShowPasteFallback] = useState(false);
  const [fallbackText, setFallbackText] = useState('');

  const applyPastedText = (text: string) => {
    if (!text) return;
    const newValue = inputValue ? inputValue + text : text;
    setInputValue(newValue);
    if (onChangeRef.current) {
      onChangeRef.current(newValue);
    }
    if (keyboardRef.current) {
        keyboardRef.current.setInput(newValue);
    }
    setPastedNotice(true);
    setTimeout(() => setPastedNotice(false), 1500);
  };

  const handlePaste = async () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        const text = await navigator.clipboard.readText();
        if (text) {
          applyPastedText(text);
          return;
        }
      }
      setShowPasteFallback(prev => !prev);
    } catch (err) {
      console.warn('Clipboard read error:', err);
      setShowPasteFallback(prev => !prev);
    }
  };

  const handleClear = () => {
    setInputValue('');
    if (onChangeRef.current) {
      onChangeRef.current('');
    }
    if (keyboardRef.current) {
        keyboardRef.current.setInput('');
    }
  };

  const contextValue = React.useMemo(() => ({
    openKeyboard,
    closeKeyboard,
    isKeyboardOpen: isOpen
  }), [openKeyboard, closeKeyboard, isOpen]);

  return (
    <KeyboardContext.Provider value={contextValue}>
      {children}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}
            className="fixed bottom-0 left-0 right-0 z-[9999] bg-[#0C1016] border-t border-[#1F2937] p-1.5 shadow-2xl pt-safe pb-safe"
          >
            <div className="flex items-center justify-between mb-1.5 px-2">
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={handlePaste} className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[#1F2937] text-[#70C7BA] transition-colors">
                  {pastedNotice ? <Check className="w-3 h-3 text-emerald-400" /> : <Clipboard className="w-3 h-3" />}
                  <span>{pastedNotice ? 'Pasted!' : 'Paste'}</span>
                </button>
              </div>
              <button type="button" onClick={closeKeyboard} className="text-[#70C7BA] font-bold text-xs px-3 py-1 bg-[#1F2937] rounded-lg">
                Done
              </button>
            </div>
            {showPasteFallback && (
              <div className="mb-1.5 px-2 flex items-center gap-1.5">
                <input
                  type="text"
                  inputMode="none"
                  value={fallbackText}
                  onChange={(e) => setFallbackText(e.target.value)}
                  placeholder="Paste here..."
                  className="flex-1 px-2.5 py-1 text-[11px] rounded-lg bg-[#090D12] border border-[#374151] text-slate-100 outline-none placeholder:text-slate-500"
                />
                <button
                  type="button"
                  onClick={() => { applyPastedText(fallbackText); setFallbackText(''); setShowPasteFallback(false); }}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[#70C7BA] text-[#090D12]"
                >
                  Insert
                </button>
              </div>
            )}
            <div className="text-black">
                <Keyboard
                    keyboardRef={(r: any) => (keyboardRef.current = r)}
                    layoutName={layoutName}
                    onChange={onChange}
                    onKeyPress={onKeyPress}
                    layout={KEYBOARD_LAYOUTS}
                    display={KEYBOARD_DISPLAY}
                    preventMouseDownDefault={false}
                    preventMouseUpDefault={false}
                    theme={"hg-theme-default gboard-dark-theme"}
                />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </KeyboardContext.Provider>
  );
};


