import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useWallet } from '../context/WalletContext';
import { validateKaspaAddress } from '../utils/kaspa';
import { X, Camera, AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const ScanModal: React.FC = () => {
  const {
    isScanOpen,
    setIsScanOpen,
    setIsSendOpen,
    network,
    showToast,
  } = useWallet();

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(true);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const containerId = 'kaspriv-qr-reader';
  const isStoppingRef = useRef(false);
  const isStartingRef = useRef(false);

  const stopScanner = React.useCallback(async () => {
    if (html5QrCodeRef.current && !isStoppingRef.current) {
      isStoppingRef.current = true;
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
      } catch (err) {
        console.error('Failed to stop scanner gracefully:', err);
      } finally {
        html5QrCodeRef.current = null;
        isStoppingRef.current = false;
      }
    }
  }, []);

  const handleScannedText = React.useCallback((text: string) => {
    // Process text
    let cleanAddress = text.trim();
    
    // Support URI format like: kaspa:qp79j3...?amount=10
    if (cleanAddress.toLowerCase().startsWith('kaspa:') || cleanAddress.toLowerCase().startsWith('kaspadev:')) {
      const urlParts = cleanAddress.split('?');
      cleanAddress = urlParts[0];
    }

    // Validate Kaspa Address
    const validationResult = validateKaspaAddress(cleanAddress, network);
    if (validationResult.isValid) {
      // Prefill and open Send modal
      localStorage.setItem('kaspriv_prefill_address', cleanAddress);
      setIsScanOpen(false);
      setIsSendOpen(true);
      showToast('Address scanned successfully!', 'success');
    } else {
      showToast(`Invalid Kaspa Address scanned: ${validationResult.error || 'Check network type'}`, 'error');
    }
  }, [network, setIsScanOpen, setIsSendOpen, showToast]);

  const startScanner = React.useCallback(async (cameraId: string) => {
    if (isStartingRef.current) return;
    try {
      isStartingRef.current = true;
      setIsInitializing(true);
      
      // Stop existing instance if running
      if (html5QrCodeRef.current) {
        try {
          if (html5QrCodeRef.current.isScanning) {
            await html5QrCodeRef.current.stop();
          }
        } catch (e) {}
      }

      const html5QrCode = new Html5Qrcode(containerId);
      html5QrCodeRef.current = html5QrCode;

      await html5QrCode.start(
        cameraId,
        {
          fps: 10,
          qrbox: (width, height) => {
            const min = Math.min(width, height);
            const boxSize = Math.floor(min * 0.7);
            return { width: boxSize, height: boxSize };
          },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleScannedText(decodedText);
        },
        () => {
          // Silent failure on frame reading
        }
      );

      setIsInitializing(false);
    } catch (err: any) {
      console.error('Failed to start QR scanner:', err);
      setScannerError(err?.message || 'Failed to open video stream.');
      setIsInitializing(false);
    } finally {
      isStartingRef.current = false;
    }
  }, [handleScannedText]);

  // Request permissions and list cameras
  useEffect(() => {
    if (!isScanOpen) {
      return;
    }

    setIsInitializing(true);
    setScannerError(null);

    // Short delay to ensure the container DOM element is fully rendered
    const timer = setTimeout(() => {
      Html5Qrcode.getCameras()
        .then((devices) => {
          if (devices && devices.length > 0) {
            setCameras(devices);
            setHasPermission(true);
            // Default to back camera if available, otherwise first camera
            const backCam = devices.find(d => 
              d.label.toLowerCase().includes('back') || 
              d.label.toLowerCase().includes('environment') ||
              d.label.toLowerCase().includes('rear')
            );
            const defaultCamId = backCam ? backCam.id : devices[0].id;
            setSelectedCameraId(defaultCamId);
            startScanner(defaultCamId);
          } else {
            setHasPermission(false);
            setScannerError('No camera devices found.');
            setIsInitializing(false);
          }
        })
        .catch((err) => {
          console.error('Camera permission/access error:', err);
          setHasPermission(false);
          setScannerError('Camera access denied or blocked by browser policies.');
          setIsInitializing(false);
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  }, [isScanOpen, startScanner, stopScanner]);

  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedCameraId(id);
    startScanner(id);
  };

  if (!isScanOpen) return null;

  return (
    <AnimatePresence>
      <div id="scan-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Dark elegant backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsScanOpen(false)}
          className="absolute inset-0 bg-[#070b0f]/90 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-md bg-[#0d141c] border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-800/60">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-[#70C7BA]/10 rounded-lg">
                <Camera className="w-5 h-5 text-[#70C7BA]" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-100">Scan Wallet QR Code</h3>
                <p className="text-xs text-slate-400 mt-0.5">Focus the address QR code in the viewfinder</p>
              </div>
            </div>
            <button
              onClick={() => setIsScanOpen(false)}
              className="p-1.5 rounded-lg bg-slate-800/40 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scanner view or fallback */}
          <div className="relative aspect-square w-full bg-slate-950 flex flex-col items-center justify-center overflow-hidden">
            
            {/* Viewfinder Overlay with pulse scanning line (only when camera is live) */}
            {hasPermission && !scannerError && !isInitializing && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                {/* Visual square viewport matching 70% of min dimension */}
                <div className="w-[70%] h-[70%] border-2 border-white/30 rounded-2xl relative shadow-[0_0_20px_rgba(112,199,186,0.15)] flex flex-col justify-between p-0">
                  {/* Four glowing corners */}
                  <div className="absolute -top-[3px] -left-[3px] w-5 h-5 border-t-4 border-l-4 border-[#70C7BA] rounded-tl-md" />
                  <div className="absolute -top-[3px] -right-[3px] w-5 h-5 border-t-4 border-r-4 border-[#70C7BA] rounded-tr-md" />
                  <div className="absolute -bottom-[3px] -left-[3px] w-5 h-5 border-b-4 border-l-4 border-[#70C7BA] rounded-bl-md" />
                  <div className="absolute -bottom-[3px] -right-[3px] w-5 h-5 border-b-4 border-r-4 border-[#70C7BA] rounded-br-md" />
                  
                  {/* Laser line scanner animation */}
                  <motion.div
                    animate={{ y: ['0%', '100%'] }}
                    transition={{
                      repeat: Infinity,
                      repeatType: 'reverse',
                      duration: 2.0,
                      ease: 'easeInOut'
                    }}
                    className="w-full h-[2px] bg-gradient-to-r from-transparent via-[#70C7BA] to-transparent shadow-[0_0_8px_rgba(112,199,186,0.8)]"
                  />
                </div>
              </div>
            )}

            {/* Loading placeholder */}
            {isInitializing && !scannerError && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/80 gap-3">
                <RefreshCw className="w-8 h-8 text-[#70C7BA] animate-spin" />
                <p className="text-xs text-slate-400">Initializing camera viewport...</p>
              </div>
            )}

            {/* The Html5Qrcode video canvas container */}
            <div 
              id={containerId} 
              className="w-full h-full object-cover [&_video]:w-full [&_video]:h-full [&_video]:object-cover" 
            />

            {/* Error fallback display */}
            {scannerError && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-[#090d12]/95 text-center gap-4">
                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-400">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-200">Camera Access Blocked</h4>
                  <p className="text-xs text-slate-400 max-w-xs mt-2 mx-auto leading-relaxed">
                    {scannerError}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Action Toolbar / Camera Selector */}
          <div className="p-4 bg-[#0a0f14] border-t border-slate-800/60 flex flex-col gap-3">
            {cameras.length > 1 && (
              <div className="flex items-center justify-between gap-3 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/40">
                <label className="text-xs font-bold text-slate-400">Switch Camera:</label>
                <select
                  value={selectedCameraId}
                  onChange={handleCameraChange}
                  className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#70C7BA] cursor-pointer max-w-[180px] truncate"
                >
                  {cameras.map((cam) => (
                    <option key={cam.id} value={cam.id}>
                      {cam.label || `Camera ${cameras.indexOf(cam) + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex">
              <button
                onClick={() => setIsScanOpen(false)}
                className="w-full py-3 px-4 bg-slate-900/40 hover:bg-slate-900 border border-slate-800/40 rounded-xl text-xs font-extrabold text-slate-400 hover:text-slate-300 transition-all active:scale-95 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
