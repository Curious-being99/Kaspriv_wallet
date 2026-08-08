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
  "{lock}": "Caps",
  "{space}": " ",
  "{tab}": "Tab",
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

  const inputValueRef = useRef(inputValue);
  inputValueRef.current = inputValue;

  const openKeyboard = useCallback(({ value, onChange, layoutName = 'default', type = 'text' }: {
    value: string;
    onChange: (val: string) => void;
    layoutName?: string;
    type?: string;
  }) => {
    const val = value || '';
    setInputValue(val);
    onChangeRef.current = onChange;
    setLayoutName(layoutName);
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

  const [showPasteFallback, setShowPasteFallback] = useState(false);
  const [fallbackText, setFallbackText] = useState('');
  const fallbackInputRef = useRef<HTMLInputElement>(null);

  const applyPastedText = (text: string) => {
    if (!text) return;
    const newValue = inputValue ? inputValue + text : text;
    setInputValue(newValue);
    if (keyboardRef.current) {
      keyboardRef.current.setInput(newValue);
    }
    if (onChangeRef.current) {
      const currentHandler = onChangeRef.current;
      setTimeout(() => {
        currentHandler(newValue);
      }, 0);
    }
    setPastedNotice(true);
    setTimeout(() => setPastedNotice(false), 1500);
  };

  const handlePaste = async () => {
    if (!document.hasFocus()) {
      setShowPasteFallback(prev => !prev);
      return;
    }
    try {
      if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        const text = await navigator.clipboard.readText();
        if (text) {
          applyPastedText(text);
          setShowPasteFallback(false);
          return;
        }
      }
      // If clipboard read returned empty or permission wasn't granted, toggle fallback input zone
      setShowPasteFallback(prev => !prev);
    } catch (err) {
      console.warn('Clipboard direct read blocked or unpermitted. Toggling paste fallback zone:', err);
      setShowPasteFallback(prev => !prev);
    }
  };

  const handleFallbackPasteEvent = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted) {
      e.preventDefault();
      applyPastedText(pasted);
      setFallbackText('');
      setShowPasteFallback(false);
    }
  };

  const handleFallbackInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) {
      applyPastedText(val);
      setFallbackText('');
      setShowPasteFallback(false);
    } else {
      setFallbackText('');
    }
  };

  const handleFallbackApply = () => {
    if (fallbackText) {
      applyPastedText(fallbackText);
      setFallbackText('');
      setShowPasteFallback(false);
    }
  };

  const handleClear = () => {
    setInputValue('');
    if (keyboardRef.current) {
      keyboardRef.current.setInput('');
    }
    if (onChangeRef.current) {
      onChangeRef.current('');
    }
  };

  const onKeyPress = useCallback((button: string) => {
    if (button === "{shift}" || button === "{lock}") {
      setLayoutName(prev => (prev === "default" ? "shift" : "default"));
    } else if (button === "{123}") {
      setLayoutName("numbers");
    } else if (button === "{abc}") {
      setLayoutName("default");
    } else if (button === "{enter}") {
      closeKeyboard();
    }
  }, [closeKeyboard]);

  const handleKeyboardRef = useCallback((r: any) => {
    if (r) {
      keyboardRef.current = r;
      if (inputValueRef.current) {
        r.setInput(inputValueRef.current);
      }
    }
  }, []);

  return (
    <KeyboardContext.Provider value={{ openKeyboard, closeKeyboard, isKeyboardOpen: isOpen }}>
      {children}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            onMouseDown={(e) => e.preventDefault()}
            onTouchStart={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.preventDefault()}
            className="fixed bottom-0 left-0 right-0 z-[9999] bg-[#131924] border-t border-[#212B38] p-2 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] pt-safe pb-safe"
          >
            <div className="flex items-center justify-between mb-2 px-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePaste}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-[#090D12] text-[#70C7BA] border border-[#212B38] active:bg-[#1A2330] transition-colors"
                >
                  {pastedNotice ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Clipboard className="w-3.5 h-3.5" />}
                  <span>{pastedNotice ? 'Pasted!' : 'Paste'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-[#090D12] text-slate-400 border border-[#212B38] hover:text-slate-200 active:bg-[#1A2330] transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              </div>

              <button 
                type="button"
                onClick={closeKeyboard}
                className="text-[#70C7BA] font-bold text-sm px-4 py-1.5 bg-[#090D12] border border-[#212B38] rounded-xl active:bg-[#1A2330]"
              >
                Done
              </button>
            </div>

            {showPasteFallback && (
              <div className="mb-2 px-2 flex items-center gap-2">
                <input
                  ref={fallbackInputRef}
                  type="text"
                  inputMode="none"
                  value={fallbackText}
                  onChange={handleFallbackInputChange}
                  onPaste={handleFallbackPasteEvent}
                  placeholder="Paste text here (Ctrl+V or long-press)..."
                  className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-[#090D12] border border-[#70C7BA] text-slate-100 outline-none placeholder:text-slate-500 font-mono"
                />
                <button
                  type="button"
                  onClick={handleFallbackApply}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#70C7BA] text-[#090D12] active:bg-[#5bb3a6]"
                >
                  Insert
                </button>
              </div>
            )}
            <div className="text-black">
              <Keyboard
                keyboardRef={handleKeyboardRef}
                layoutName={layoutName}
                onChange={onChange}
                onKeyPress={onKeyPress}
                layout={KEYBOARD_LAYOUTS}
                display={KEYBOARD_DISPLAY}
                preventMouseDownDefault={true}
                preventMouseUpDefault={true}
                theme={"hg-theme-default hg-layout-default myTheme"}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </KeyboardContext.Provider>
  );
};

