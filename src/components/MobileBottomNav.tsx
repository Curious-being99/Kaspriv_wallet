import React from 'react';
import { useWallet } from '../context/WalletContext';
import { Wallet, History, Code2, Settings } from 'lucide-react';

export const MobileBottomNav: React.FC = () => {
  const { activeBottomTab, setActiveBottomTab } = useWallet();

  const navItems = [
    { id: 'home', label: 'Wallet', icon: Wallet },
    { id: 'history', label: 'History', icon: History },
    { id: 'covenant', label: 'Covenant', icon: Code2 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;

  return (
    <nav className="fixed bottom-0 left-0 w-full bg-[#090D12] border-t border-[#1E293B] px-3 py-2 flex justify-center z-50">
      <div className="w-full max-w-3xl flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeBottomTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveBottomTab(item.id)}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition-all relative ${
                isActive ? 'text-[#70C7BA]' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isActive && (
                <span className="absolute -top-2 w-8 h-1 rounded-full bg-[#70C7BA]" />
              )}
              <Icon className={`w-5 h-5 mb-1 transition-transform ${isActive ? 'scale-110 stroke-[2.5]' : 'stroke-[1.75]'}`} />
              <span className={`text-[10px] font-semibold tracking-tight ${isActive ? 'text-[#70C7BA]' : 'text-slate-400'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
