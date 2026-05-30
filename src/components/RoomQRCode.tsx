/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, Share2 } from 'lucide-react';

interface RoomQRCodeProps {
  roomId: string;
}

export function RoomQRCode({ roomId }: RoomQRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);

  const joinUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        joinUrl,
        {
          width: 180,
          margin: 1.5,
          color: {
            dark: '#1e1b4b', // Deep indigo
            light: '#ffffff', // White
          },
        },
        (error) => {
          if (error) console.error('QR code generation error:', error);
        }
      );
    }
  }, [joinUrl]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-zinc-900/80 border border-zinc-800 rounded-3xl backdrop-blur-xl shadow-[0_0_24px_rgba(30,27,75,0.4)] max-w-sm w-full mx-auto relative overflow-hidden group">
      {/* Laser light line effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-red-500/0 via-red-500/10 to-red-500/0 transform -translate-y-full group-hover:translate-y-full transition-transform duration-1000 ease-in-out pointer-events-none" />

      <h4 className="text-zinc-500 uppercase text-[10px] font-bold tracking-[0.2em] mb-4">房主大廳與掃碼</h4>
      
      {/* Room ID Badge */}
      <div className="mb-5 px-5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-full flex flex-col items-center shadow-inner">
        <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono mb-0.5">專屬房間代碼</span>
        <span className="text-2xl font-bold tracking-widest text-red-500 font-mono drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]">
          {roomId}
        </span>
      </div>

      {/* QR Canvas Wrapper */}
      <div className="p-3 bg-white rounded-2xl shadow-2xl relative mb-5 flex items-center justify-center border border-zinc-700/50">
        <canvas ref={canvasRef} className="w-[180px] h-[180px] rounded-xl" />
        <div className="absolute inset-0 border border-zinc-200/10 rounded-2xl pointer-events-none" />
      </div>

      <p className="text-[10px] text-zinc-500 text-center mb-6 max-w-[200px] leading-relaxed">
        讓對手掃描上方條碼，或直接複製專屬棋局連結進行遠端連線。
      </p>

      {/* Copy Action Button */}
      <button
        onClick={copyToClipboard}
        className="w-full flex items-center justify-center gap-2.5 py-3 px-5 bg-gradient-to-r from-zinc-800 to-zinc-900 border border-zinc-700 hover:border-zinc-500 text-zinc-200 text-xs rounded-xl font-bold transition-all shadow-md group active:scale-95"
      >
        {copied ? (
          <>
            <Check size={14} className="text-emerald-500" />
            <span className="text-emerald-500 font-bold font-mono">已複製連結</span>
          </>
        ) : (
          <>
            <Copy size={14} className="text-zinc-400 group-hover:text-zinc-200 transition-colors" />
            <span className="font-mono">一鍵複製對局連結</span>
          </>
        )}
      </button>
    </div>
  );
}
