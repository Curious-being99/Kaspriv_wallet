import React, { useEffect, useState } from 'react';
import { ShieldAlert, AlertTriangle } from 'lucide-react';

export const SecurityEnvironmentAlert: React.FC = () => {
  const [compromisedReason, setCompromisedReason] = useState<string | null>(null);

  useEffect(() => {
    // Check if the Android security interface is available
    if (typeof window !== 'undefined' && window.AndroidSecurityEnvironment) {
      try {
        const isRooted = window.AndroidSecurityEnvironment.isDeviceRooted();
        const isHooked = window.AndroidSecurityEnvironment.isFridaOrHooked();
        
        if (isRooted || isHooked) {
          const details = window.AndroidSecurityEnvironment.getCompromisedDetails();
          setCompromisedReason(details || 'Device Rooted or Memory Hooking Detected');
        }
      } catch (e) {
        console.warn('Failed to query native security bridge:', e);
      }
    }
  }, []);

  if (!compromisedReason) return null;

  return (
    <div id="security-compromised-alert" className="w-full bg-rose-950/40 border border-rose-500/40 rounded-xl p-4 flex items-start gap-3.5 shadow-lg shadow-rose-950/20 my-2.5 backdrop-blur-md">
      <div className="p-2 bg-rose-500/10 rounded-lg text-rose-400 shrink-0">
        <ShieldAlert className="w-6 h-6 animate-pulse" />
      </div>
      <div className="flex-1 space-y-1">
        <h4 className="text-rose-200 font-extrabold text-sm flex items-center gap-1.5 uppercase tracking-wide">
          <AlertTriangle className="w-4 h-4 text-rose-400 stroke-[2.5]" />
          Compromised Environment Detected
        </h4>
        <p className="text-rose-300 text-xs leading-relaxed font-medium">
          The native Android execution runtime has detected security anomalies: <span className="font-extrabold text-rose-200">{compromisedReason}</span>.
        </p>
        <p className="text-rose-400/80 text-[10px] leading-tight font-medium">
          Do not type sensitive mnemonics or credentials if you suspect memory inspect hookers or keyloggers are active.
        </p>
      </div>
    </div>
  );
};
