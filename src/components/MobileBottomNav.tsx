import React from 'react';
import { useWallet } from '../context/WalletContext';
import { Wallet, History, Users, Settings } from 'lucide-react';
import { hapticSelection } from '../utils/haptics';

export const MobileBottomNav: React.FC = () => {
  const { activeBottomTab, setActiveBottomTab } = useWallet();

  const navItems = [
    { id: 'home', label: 'Wallet', icon: Wallet },
    { id: 'history', label: 'History', icon: History },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;

  return (
    <nav className="fixed bottom-0 left-0 right-0 w-full bg-[#090D12] z-50 px-4 py-1.5 flex justify-center">
      <div className="w-full max-w-3xl flex items-center justify-around h-13 sm:h-14">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeBottomTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                hapticSelection();
                setActiveBottomTab(item.id);
              }}
              className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-all relative select-none active:scale-95 cursor-pointer ${
                isActive ? 'text-[#70C7BA]' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className={`w-5 h-5 transition-transform duration-150 ${isActive ? 'scale-105 stroke-[2.5]' : 'stroke-[1.75]'}`} />
              <span className={`text-[10px] font-semibold tracking-tight mt-0.5 ${isActive ? 'text-[#70C7BA] font-bold' : 'text-slate-400'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
