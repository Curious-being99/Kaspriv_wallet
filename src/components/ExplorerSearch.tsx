import React, { useState } from 'react';
import { useVirtualKeyboard } from '../context/KeyboardContext';
import { Search } from 'lucide-react';

export const ExplorerSearch: React.FC = () => {
    const [query, setQuery] = useState('');
    const { openKeyboard } = useVirtualKeyboard();

    const handleSearch = () => {
        if (query) {
            window.open(`https://explorer.kaspa.org/tx/${query}`, '_blank');
        }
    };

    return (
        <div className="w-full px-4 mt-4">
             <div className="relative">
                <input
                    type="text"
                    placeholder="Search transaction ID..."
                    value={query}
                    onFocus={() => openKeyboard({ value: query, onChange: setQuery })}
                    onClick={() => openKeyboard({ value: query, onChange: setQuery })}
                    inputMode="none" onChange={() => {}}
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#090D12] border border-[#212B38] focus:border-[#70C7BA] text-sm text-slate-100 outline-none"
                />
                <Search className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
                <button 
                  onClick={handleSearch}
                  className="absolute right-2 top-2 bg-[#70C7BA] text-[#090D12] text-xs font-bold px-3 py-1.5 rounded-lg active:scale-95"
                >
                    Go
                </button>
            </div>
        </div>
    );
};
