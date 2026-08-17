import React, { useState, useMemo, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { createKaspaUri, formatKas, shortenAddress } from '../utils/kaspa';
import { QRCodeSVG } from 'qrcode.react';
import { X, Copy, Check, ArrowDownLeft, Plus, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useVirtualKeyboard } from '../context/KeyboardContext';

export const ReceiveModal: React.FC = () => {
  const {
    activeWallet,
    isReceiveOpen,
    setIsReceiveOpen,
    showToast,
    generateNewReceiveAddress,
    switchReceiveAddress,
  } = useWallet();

  const { openKeyboard } = useVirtualKeyboard();

  const [requestedAmount, setRequestedAmount] = useState('0.00');
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Derive all receive addresses for this wallet (excluding change addresses)
  const receiveAddresses = useMemo(() => {
    const all = new Set<string>();
    if (!activeWallet) return [];
    
    // Always include the current primary receive address
    if (activeWallet.receiveAddress) {
      all.add(activeWallet.receiveAddress);
    }
    
    // Include other discovered addresses that are NOT change addresses
    if (activeWallet.discoveredAddresses) {
      activeWallet.discoveredAddresses.forEach((addr) => {
        const path = activeWallet.addressPaths?.[addr] || '';
        const isChange = path.includes('/1/'); // standard bip44 change path includes /1/
        if (!isChange) {
          all.add(addr);
        }
      });
    }
    
    return Array.from(all).map((addr) => {
      const path = activeWallet.addressPaths?.[addr] || "m/44'/111111'/0'/0/0";
      const parts = path.split('/');
      const index = parseInt(parts[parts.length - 1] || '0', 10);
      const balanceSompi = BigInt(activeWallet.addressBalances?.[addr] || '0');
      
      return {
        address: addr,
        path,
        index,
        balanceSompi,
      };
    }).sort((a, b) => a.index - b.index);
  }, [activeWallet]);

  if (!isReceiveOpen || !activeWallet) return null;

  const currentAddress = activeWallet.receiveAddress;
  const numAmount = parseFloat(requestedAmount) || 0;
  const kaspaUri = createKaspaUri(currentAddress, numAmount, note);

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(kaspaUri);
    setCopied(true);
    showToast('Kaspa address copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateNew = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      await generateNewReceiveAddress();
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-lg bg-[#0F151C] rounded-2xl border border-[#212B38] p-6 text-slate-100 relative max-h-[90vh] overflow-y-auto no-scrollbar flex flex-col gap-5"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#212B38]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#70C7BA]/20 border border-[#70C7BA]/40 flex items-center justify-center text-[#70C7BA]">
              <ArrowDownLeft className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-100">Receive Funds</h3>
                {activeWallet.addressType && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#70C7BA]/10 text-[#70C7BA] border border-[#70C7BA]/20 font-black uppercase">
                    {activeWallet.addressType}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">Share address or request a specific amount</p>
            </div>
          </div>
          <button
            onClick={() => setIsReceiveOpen(false)}
            className="p-2 rounded-xl hover:bg-[#1A2330] text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* QR Code Canvas Frame */}
        <div className="flex flex-col items-center justify-center p-5 bg-white rounded-2xl shadow-inner self-center w-48 h-48">
          <QRCodeSVG
            value={kaspaUri}
            size={160}
            bgColor="#FFFFFF"
            fgColor="#090D12"
            level="M"
            includeMargin={false}
          />
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Request Amount
            </label>
            <input
              type="text"
              value={requestedAmount}
              onFocus={() => openKeyboard({ value: requestedAmount, onChange: setRequestedAmount, layoutName: 'numeric', type: 'number' })}
              onClick={() => openKeyboard({ value: requestedAmount, onChange: setRequestedAmount, layoutName: 'numeric', type: 'number' })}
              inputMode="none"
              onChange={() => {}}
              className="w-full px-3 py-2 rounded-xl bg-[#080B0F] border border-[#212B38] text-xs font-mono text-slate-100 outline-none focus:border-[#70C7BA]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Note / Memo
            </label>
            <input
              type="text"
              value={note}
              onFocus={() => openKeyboard({ value: note, onChange: setNote })}
              onClick={() => openKeyboard({ value: note, onChange: setNote })}
              inputMode="none"
              onChange={() => {}}
              className="w-full px-3 py-2 rounded-xl bg-[#080B0F] border border-[#212B38] text-xs text-slate-100 outline-none focus:border-[#70C7BA]"
            />
          </div>
        </div>

        {/* Full Address Display Box */}
        <div className="p-3 rounded-xl bg-[#080B0F] border border-[#161F28] text-xs font-mono text-[#70C7BA] break-all select-all leading-normal text-center">
          {currentAddress}
        </div>

        {/* Copy Button */}
        <button
          onClick={handleCopyAddress}
          className="w-full py-3 rounded-xl bg-[#70C7BA] hover:bg-[#5eead4] text-[#090D12] font-black text-sm transition-all shadow-lg shadow-[#70C7BA]/10 flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          {copied ? <Check className="w-4 h-4 stroke-[3]" /> : <Copy className="w-4 h-4" />}
          <span className="whitespace-nowrap">{copied ? 'Copied URI to Clipboard!' : 'Copy Address / URI'}</span>
        </button>

        {/* Derived Receive Addresses Section */}
        <div className="border-t border-[#212B38] pt-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-extrabold text-slate-300">Your Derived Receive Addresses</h4>
              <p className="text-[10px] text-slate-400 mt-0.5">Funds to all these addresses belong to your wallet.</p>
            </div>
            <button
              onClick={handleGenerateNew}
              disabled={isGenerating}
              className="px-2.5 py-1.5 rounded-lg bg-[#70C7BA]/10 hover:bg-[#70C7BA]/20 border border-[#70C7BA]/30 text-[#70C7BA] text-[10px] font-extrabold flex items-center gap-1 transition-all disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="whitespace-nowrap">{isGenerating ? 'Generating...' : 'New Address'}</span>
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-2 pr-1 no-scrollbar">
            {receiveAddresses.map((item) => {
              const isSelected = item.address === currentAddress;
              return (
                <div
                  key={item.address}
                  onClick={() => switchReceiveAddress(item.address)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-[#70C7BA]/5 border-[#70C7BA] shadow-md shadow-[#70C7BA]/5'
                      : 'bg-[#080B0F] border-[#161F28] hover:border-[#212B38]'
                  }`}
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-extrabold text-slate-200">
                        Address #{item.index}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                        {item.path}
                      </span>
                      {isSelected && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#70C7BA]/25 text-[#70C7BA] font-extrabold">
                          Active
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 truncate">
                      {shortenAddress(item.address)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-black text-slate-200">
                      {formatKas(item.balanceSompi, 2)} KAS
                    </span>
                    {isSelected ? (
                      <CheckCircle2 className="w-4 h-4 text-[#70C7BA]" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-700" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
