import React from 'react';
import { useWallet } from '../context/WalletContext';
import { Wallet, History, Users, Settings } from 'lucide-react';

export const MobileBottomNav: React.FC = () => {
  const { activeBottomTab, setActiveBottomTab } = useWallet();

  const navItems = [
    { id: 'home', label: 'Wallet', icon: Wallet },
    { id: 'history', label: 'History', icon: History },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;

  return (
    <nav className="fixed bottom-0 left-0 w-full bg-[#090D12] px-3 pt-2 pb-[max(0.75rem,calc(0.5rem+env(safe-area-inset-bottom,0px)))] flex justify-center z-50 border-t border-[#1a2330]/40">
      <div className="w-full max-w-3xl flex items-center justify-around h-16">
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
                <></>
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
