import React from 'react';
import { WalletProvider, useWallet } from './context/WalletContext';
import { KeyboardProvider } from './context/KeyboardContext';
import { Header } from './components/Header';
import { MainCard } from './components/MainCard';
import { TransactionList } from './components/TransactionList';
import { MobileCovenantView } from './components/MobileCovenantView';
import { MobileSettingsView } from './components/MobileSettingsView';
import { MobileBottomNav } from './components/MobileBottomNav';
import { SendModal } from './components/SendModal';
import { ReceiveModal } from './components/ReceiveModal';
import { LockScreen } from './components/LockScreen';
import { WalletSetupModal } from './components/WalletSetupModal';
import { SignMessageModal } from './components/SignMessageModal';
import { CompoundUtxoModal } from './components/CompoundUtxoModal';
import { CovenantModal } from './components/CovenantModal';
import { AssetDetailModal } from './components/AssetDetailModal';
import { MainLandingPage } from './components/MainLandingPage';
import { LogoutModal } from './components/LogoutModal';
import { DevConsoleDrawer } from './components/DevConsoleDrawer';
import { IndexingOverlay } from './components/IndexingOverlay';
import { Toast } from './components/Toast';
import { PrivacyShield } from './components/PrivacyShield';
import { SplashScreen } from './components/SplashScreen';
import { ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { AnimatePresence } from 'motion/react';

const WalletAppContent: React.FC = () => {
  const {
    isInitializing,
    toast,
    dismissToast,
    activeBottomTab,
    setIsSendOpen,
    setIsReceiveOpen,
    setIsCompoundOpen,
    setIsCovenantOpen,
    activeWallet,
  } = useWallet();

  return (
    <div className="fixed inset-0 bg-[#090D12] text-slate-100 font-sans flex flex-col overflow-hidden selection:bg-[#70C7BA]/30 selection:text-[#70C7BA]">
      <AnimatePresence mode="wait">
        {isInitializing && <SplashScreen key="app-splash-screen" />}
      </AnimatePresence>

      {/* Mobile Header / App Bar */}
      {activeBottomTab === 'home' && <Header />}

      {/* Main Viewport Content Area */}
      <main className={`flex-1 min-h-0 overflow-y-auto no-scrollbar px-2.5 sm:px-4 ${activeBottomTab === 'home' ? 'pt-20' : 'pt-3'} pb-20 space-y-3.5 w-full max-w-3xl mx-auto`}>
        {activeBottomTab === 'home' && (
          <>
            {/* Main Balance Card */}
            <MainCard />

            {/* Quick Mobile Action Shortcuts */}
            <div className="w-full px-4 flex items-center justify-center gap-8 py-2">
              <button
                onClick={() => setIsSendOpen(true)}
                className="flex items-center gap-2 py-2 px-3 text-[#70C7BA] hover:text-[#5eead4] font-extrabold text-sm transition-all active:scale-95 cursor-pointer"
              >
                <ArrowUpRight className="w-5 h-5 stroke-[3]" />
                <span>{activeWallet?.isWatchOnly || activeWallet?.isImportedKpub ? 'Send (Watch-Only)' : 'Send'}</span>
              </button>

              <button
                onClick={() => setIsReceiveOpen(true)}
                className="flex items-center gap-2 py-2 px-3 text-slate-100 hover:text-[#70C7BA] font-extrabold text-sm transition-all active:scale-95 cursor-pointer"
              >
                <ArrowDownLeft className="w-5 h-5 stroke-[2.5]" />
                <span>Receive</span>
              </button>
            </div>

            {/* Transactions List */}
            <TransactionList hideHeader={true} />
          </>
        )}

        {activeBottomTab === 'history' && <TransactionList hideAssetCard={true} />}
        {activeBottomTab === 'covenant' && <MobileCovenantView />}
        {activeBottomTab === 'settings' && <MobileSettingsView />}
      </main>

      {/* Native Mobile Bottom Navigation Bar */}
      <MobileBottomNav />

      {/* Modals & Overlays */}
      <MainLandingPage />
      <SendModal />
      <ReceiveModal />
      <LockScreen />
      <WalletSetupModal />
      <SignMessageModal />
      <CompoundUtxoModal />
      <CovenantModal />
      <AssetDetailModal />
      <LogoutModal />
      <DevConsoleDrawer />
      <IndexingOverlay />
      <Toast toast={toast} onDismiss={dismissToast} />
      <PrivacyShield />
    </div>
  );
};

export function App() {
  return (
    <KeyboardProvider>
      <WalletProvider>
        <WalletAppContent />
      </WalletProvider>
    </KeyboardProvider>
  );
}

export default App;
