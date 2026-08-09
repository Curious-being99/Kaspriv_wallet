import React, { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { createKaspaUri } from '../utils/kaspa';
import { QRCodeSVG } from 'qrcode.react';
import { X, Copy, Check, ArrowDownLeft } from 'lucide-react';
import { motion } from 'motion/react';

export const ReceiveModal: React.FC = () => {
  const { activeWallet, isReceiveOpen, setIsReceiveOpen, showToast } = useWallet();

  const [requestedAmount, setRequestedAmount] = useState('0.00');
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isReceiveOpen) return null;

  const currentAddress = activeWallet.receiveAddress;
  const numAmount = parseFloat(requestedAmount) || 0;
  const kaspaUri = createKaspaUri(currentAddress, numAmount, note);

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(kaspaUri);
    setCopied(true);
    showToast('Kaspa address copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full    bg-[#090D12]   p-6 text-slate-100 relative overflow-y-auto no-scrollbar"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#212B38]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#70C7BA]/20 border border-[#70C7BA]/40 flex items-center justify-center text-[#70C7BA]">
              <ArrowDownLeft className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-extrabold text-slate-100">Receive Kaspa</h3>
                {activeWallet.addressType && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#70C7BA]/10 text-[#70C7BA] border border-[#70C7BA]/20 font-black uppercase">
                    {activeWallet.addressType}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-medium">Share your address via QR code</p>
            </div>
          </div>
          <button
            onClick={() => setIsReceiveOpen(false)}
            className="p-2 rounded-xl hover:bg-[#1A2330] text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* QR Code Canvas Frame - No text display inside or on QR code */}
        <div className="flex flex-col items-center justify-center p-5 bg-white rounded-2xl shadow-inner my-2">
          <QRCodeSVG
            value={kaspaUri}
            size={160}
            bgColor="#FFFFFF"
            fgColor="#090D12"
            level="M"
            includeMargin={false}
          />
        </div>

        {/* Custom Amount Request Field */}
        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Requested Amount
              </label>
              <input
                type="text"
                value={requestedAmount}
                onFocus={() => openKeyboard({ value: requestedAmount, onChange: setRequestedAmount, layoutName: 'numeric', type: 'number' })}
                onClick={() => openKeyboard({ value: requestedAmount, onChange: setRequestedAmount, layoutName: 'numeric', type: 'number' })}
                readOnly
                inputMode="none"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D12]  focus:border-[#70C7BA] font-mono text-xs text-slate-100 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Note / Memo
              </label>
              <input
                type="text"
                value={note}
                onFocus={() => openKeyboard({ value: note, onChange: setNote })}
                onClick={() => openKeyboard({ value: note, onChange: setNote })}
                readOnly
                inputMode="none"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D12]  focus:border-[#70C7BA] text-xs text-slate-100 outline-none"
              />
            </div>
          </div>

          {/* Full Address Display Box */}
          <div className="p-3.5 rounded-2xl bg-[#090D12]  text-xs font-mono text-slate-300 break-all select-all leading-normal">
            {currentAddress}
          </div>

          {/* Copy Button */}
          <button
            onClick={handleCopyAddress}
            className="w-full py-3.5 rounded-2xl bg-[#70C7BA] hover:bg-[#5eead4] text-[#090D12] font-extrabold text-sm transition-all shadow-lg shadow-[#70C7BA]/20 flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            {copied ? <Check className="w-4 h-4 stroke-[3]" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied to Clipboard!' : 'Copy Kaspa Address'}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
