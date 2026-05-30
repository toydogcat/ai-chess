/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Camera, X, Play } from 'lucide-react';

interface CameraQRScannerProps {
  onScanSuccess: (roomId: string) => void;
  onClose: () => void;
}

export function CameraQRScanner({ onScanSuccess, onClose }: CameraQRScannerProps) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    // Initialize html5-qrcode scanner
    const config = {
      fps: 10,
      qrbox: { width: 220, height: 220 },
      aspectRatio: 1.0,
    };

    const handleSuccess = (decodedText: string) => {
      console.log('QR Code Scanned successfully:', decodedText);
      
      // Parse QR code text (can be full URL or simple room code)
      let roomCode = decodedText.trim();
      try {
        const url = new URL(decodedText);
        const params = new URLSearchParams(url.search);
        const rId = params.get('room');
        if (rId) {
          roomCode = rId;
        }
      } catch (e) {
        // Not a URL, use raw string
      }

      // Cleanup and execute callback
      if (scannerRef.current) {
        scannerRef.current.clear().catch(err => console.error('Failed to clear scanner:', err));
      }
      onScanSuccess(roomCode.toUpperCase());
    };

    const handleFailure = (error: any) => {
      // Quiet fail to avoid polluting console with search failures
    };

    try {
      const scanner = new Html5QrcodeScanner('qr-reader-element', config, false);
      scannerRef.current = scanner;
      scanner.render(handleSuccess, handleFailure);
    } catch (err: any) {
      console.error('Failed to start camera scanner:', err);
      setErrorMsg('無法開啟相機，請檢查權限或使用下方手動輸入。');
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(err => console.error('Unmount scanner clear failed:', err));
      }
    };
  }, [onScanSuccess]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim().length > 0) {
      onScanSuccess(manualCode.trim().toUpperCase());
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 relative shadow-2xl flex flex-col items-center">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-full transition-colors active:scale-95"
        >
          <X size={16} />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <Camera size={20} className="text-red-500 animate-pulse" />
          <h3 className="text-lg font-bold text-zinc-100 tracking-wider">相機對局掃碼</h3>
        </div>

        {/* Camera Element Div */}
        <div className="w-full overflow-hidden rounded-2xl bg-zinc-950 border border-zinc-800/80 relative min-h-[260px] flex flex-col items-center justify-center">
          <div id="qr-reader-element" className="w-full text-zinc-400" />
          
          {errorMsg && (
            <div className="absolute inset-0 p-6 flex flex-col items-center justify-center text-center bg-zinc-950/90 z-10">
              <span className="text-amber-500 font-bold mb-2">相機啟動異常</span>
              <p className="text-zinc-500 text-[10px] max-w-[240px] leading-relaxed">{errorMsg}</p>
            </div>
          )}
        </div>

        {/* Separator / Or Manual Input */}
        <div className="w-full my-6 flex items-center justify-center text-zinc-700 text-[9px] uppercase tracking-widest font-bold">
          <div className="flex-1 h-px bg-zinc-800 mr-3" />
          或者手動輸入代碼
          <div className="flex-1 h-px bg-zinc-800 ml-3" />
        </div>

        {/* Manual input form */}
        <form onSubmit={handleManualSubmit} className="w-full flex gap-2">
          <input
            type="text"
            maxLength={6}
            placeholder="輸入房間代碼 (例如: 5S8A2)"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value.toUpperCase())}
            className="flex-1 px-4 py-3 bg-zinc-950 border border-zinc-850 hover:border-zinc-800 focus:border-red-500/50 rounded-xl text-sm font-mono tracking-widest text-zinc-100 focus:outline-none transition-colors placeholder:text-zinc-700 placeholder:text-xs"
          />
          <button
            type="submit"
            disabled={!manualCode.trim()}
            className="px-4 py-3 bg-zinc-100 disabled:bg-zinc-800 text-zinc-950 disabled:text-zinc-600 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer disabled:cursor-not-allowed"
          >
            <Play size={12} fill="currentColor" />
            <span>直連</span>
          </button>
        </form>
      </div>
    </div>
  );
}
