/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, RotateCcw, Cpu, User, Info, Settings, LayoutGrid, 
  Tablet as Table, Volume2, VolumeX, Share2, Camera, 
  Gamepad2, UserPlus, Power, Play, RefreshCw, AlertCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { GameMode, GameState, PieceColor, PieceType, Piece, Position } from './types';
import { GameEngine } from './logic/GameEngine';
import { AI } from './logic/AI';
import { PIECE_NAMES } from './constants';

import { useChessMultiplayer } from './hooks/useChessMultiplayer';
import { RoomQRCode } from './components/RoomQRCode';
import { CameraQRScanner } from './components/CameraQRScanner';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [mode, setMode] = useState<GameMode>(GameMode.DARK);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isAiEnabled, setIsAiEnabled] = useState(true);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [playerColor, setPlayerColor] = useState<PieceColor | null>(null); // For Banqi first-flip rule
  
  const [isMuted, setIsMuted] = useState(true);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  // QR Code & Join states
  const [showScanner, setShowScanner] = useState(false);
  const [inputRoomId, setInputRoomId] = useState('');
  const [tempName, setTempName] = useState('');
  const [detectedUrlRoomId, setDetectedUrlRoomId] = useState<string | null>(null);

  // Initialize background music
  useEffect(() => {
    const audio = new Audio(`${import.meta.env.BASE_URL || '/'}Before_the_Final_Charge.mp3`);
    audio.loop = true;
    audio.volume = 0.35;
    audioRef.current = audio;

    return () => {
      audio.pause();
    };
  }, []);

  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.play().catch(err => console.log("Playback failed:", err));
      setIsMuted(false);
    } else {
      audioRef.current.pause();
      setIsMuted(true);
    }
  };

  const initGame = useCallback((newMode: GameMode) => {
    const board = GameEngine.initBoard(newMode);
    setGameState({
      mode: newMode,
      board,
      turn: PieceColor.RED,
      capturedRed: [],
      capturedBlack: [],
      winner: null,
      history: [],
      selectedPos: null,
    });
    setMode(newMode);
    setPlayerColor(newMode === GameMode.CLASSIC ? PieceColor.RED : null);
  }, []);

  useEffect(() => {
    initGame(GameMode.DARK);
  }, [initGame]);

  // Multiplayer Hook
  const {
    mpState,
    setMpState,
    setPlayerName,
    createRoom,
    joinRoom,
    sendPlayerAction,
    broadcastGameState,
    disconnectAll
  } = useChessMultiplayer(
    gameState || {
      mode: GameMode.DARK,
      board: [],
      turn: PieceColor.RED,
      capturedRed: [],
      capturedBlack: [],
      winner: null,
      history: [],
      selectedPos: null
    },
    setGameState,
    initGame
  );

  // Sync temp name input with stored player name
  useEffect(() => {
    setTempName(mpState.playerName);
  }, [mpState.playerName]);

  // Detect Room ID in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rId = params.get('room');
    if (rId) {
      const code = rId.trim().toUpperCase();
      setDetectedUrlRoomId(code);
      setInputRoomId(code);
    }
  }, []);

  // Sync playerColor with multiplayer assigned color
  useEffect(() => {
    if (mpState.isMultiplayerActive) {
      setPlayerColor(mpState.myColor);
    }
  }, [mpState.isMultiplayerActive, mpState.myColor]);

  // Vercount SPA Count Update
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).vercount && typeof (window as any).vercount.fetch === 'function') {
      (window as any).vercount.fetch();
    }
  }, [mode, mpState.isMultiplayerActive]);

  // Luna AI Iframe Scroll Syncing
  useEffect(() => {
    let lastScrollY = 0;
    const scrollThreshold = 8; // Sensitivity threshold to prevent tiny jitters
    
    const handleScroll = () => {
      const currentScrollY = window.scrollY || document.documentElement.scrollTop;
      if (Math.abs(currentScrollY - lastScrollY) < scrollThreshold && currentScrollY > 10) return;
      
      // Determine direction
      const direction = currentScrollY > lastScrollY ? 'down' : 'up';
      
      // Broadcast to parent window
      window.parent.postMessage({
        type: 'iframe_scroll',
        scrollY: currentScrollY,
        direction: direction
      }, '*');
      
      lastScrollY = currentScrollY;
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const checkWinner = (state: GameState): PieceColor | null => {
    let redKing = false;
    let blackKing = false;
    let redPieces = 0;
    let blackPieces = 0;

    state.board.forEach(row => row.forEach(p => {
      if (p) {
        if (p.color === PieceColor.RED) {
          redPieces++;
          if (p.type === PieceType.KING) redKing = true;
        } else {
          blackPieces++;
          if (p.type === PieceType.KING) blackKing = true;
        }
      }
    }));

    if (!blackKing || blackPieces === 0) return PieceColor.RED;
    if (!redKing || redPieces === 0) return PieceColor.BLACK;
    return null;
  };

  const handleAiMove = useCallback(async () => {
    if (!gameState || gameState.winner || !isAiEnabled || mpState.isMultiplayerActive) return;
    if (gameState.turn === playerColor) return;
    if (gameState.mode === GameMode.DARK && playerColor === null) return;

    setIsAiThinking(true);
    await new Promise(r => setTimeout(r, 800));

    const move = AI.getBestMove(gameState);
    if (move.flip) {
      handleSquareClick(move.flip[0], move.flip[1], true);
    } else if (move.from && move.to) {
      setGameState(prev => prev ? ({ ...prev, selectedPos: move.from }) : null);
      await new Promise(r => setTimeout(r, 300));
      handleSquareClick(move.to[0], move.to[1], true);
    }
    setIsAiThinking(false);
  }, [gameState, isAiEnabled, playerColor, mpState.isMultiplayerActive]);

  useEffect(() => {
    if (!mpState.isMultiplayerActive && isAiEnabled && gameState && gameState.turn !== playerColor && !gameState.winner) {
      if (gameState.mode === GameMode.DARK && playerColor === null) return;
      handleAiMove();
    }
  }, [gameState?.turn, isAiEnabled, playerColor, handleAiMove, mpState.isMultiplayerActive]);

  // Host listener for Guest clicks
  useEffect(() => {
    const handleP2pClick = (e: Event) => {
      const customEvent = e as CustomEvent<{ r: number, c: number }>;
      const { r, c } = customEvent.detail;
      handleSquareClick(r, c, true);
    };

    window.addEventListener('p2p_player_click', handleP2pClick);
    return () => window.removeEventListener('p2p_player_click', handleP2pClick);
  }, [gameState, mpState, mode, playerColor]);

  // Host broadcasts board updates to Guest whenever gameState changes
  useEffect(() => {
    if (mpState.isMultiplayerActive && mpState.isHost && gameState) {
      broadcastGameState(gameState);
    }
  }, [gameState, mpState.isMultiplayerActive, mpState.isHost, broadcastGameState]);

  const handleSquareClick = (r: number, c: number, isAiCall = false) => {
    if (!gameState || gameState.winner) return;

    // Multiplayer checks
    if (mpState.isMultiplayerActive) {
      if (mpState.connectionStatus !== 'connected') return;

      // Guest click interception
      if (!mpState.isHost) {
        if (gameState.turn === mpState.myColor || mpState.myColor === null) {
          sendPlayerAction(r, c);
        }
        return;
      }

      // Host click turn-checks
      if (mpState.isHost && !isAiCall) {
        if (mpState.myColor !== null && gameState.turn !== mpState.myColor) return;
      }
    } else {
      // Local check
      if (!isAiCall && isAiEnabled && gameState.turn !== playerColor && playerColor !== null) return;
    }

    const { board, turn, selectedPos, history } = gameState;
    const piece = board[r][c];

    if (mode === GameMode.DARK && piece && !piece.isRevealed) {
      const newBoard = board.map(row => [...row]);
      newBoard[r][c] = { ...piece, isRevealed: true };
      
      let nextTurn = turn === PieceColor.RED ? PieceColor.BLACK : PieceColor.RED;
      let nextPlayerColor = playerColor;

      if (mode === GameMode.DARK && playerColor === null) {
        nextPlayerColor = piece.color;
        setPlayerColor(piece.color);
        
        // P2P dynamic color assign on first flip
        if (mpState.isMultiplayerActive && mpState.isHost) {
          // If Guest flipped it (isAiCall is true), Guest gets piece.color, Host gets opposite
          const hostColor = isAiCall ? (piece.color === PieceColor.RED ? PieceColor.BLACK : PieceColor.RED) : piece.color;
          setMpState(prev => ({ ...prev, myColor: hostColor }));
          // Explicitly broadcast to sync guest instantly
          setTimeout(() => broadcastGameState({
            ...gameState,
            board: newBoard,
            turn: nextTurn,
            selectedPos: null,
            history: [...history, { type: 'flip', pos: [r, c], piece: { ...piece } }]
          }, hostColor), 50);
        }
      }

      const nextState: GameState = {
        ...gameState,
        board: newBoard,
        turn: nextTurn,
        selectedPos: null,
        history: [...history, { type: 'flip', pos: [r, c], piece: { ...piece } }]
      };
      nextState.winner = checkWinner(nextState);
      if (nextState.winner) confetti();
      setGameState(nextState);
      return;
    }

    if (piece && piece.isRevealed && piece.color === turn) {
      setGameState({ ...gameState, selectedPos: [r, c] });
      return;
    }

    if (selectedPos) {
      const validMoves = GameEngine.getValidMoves(gameState, selectedPos);
      const isMoveValid = validMoves.some(([vr, vc]) => vr === r && vc === c);

      if (isMoveValid) {
        const [sr, sc] = selectedPos;
        const movingPiece = board[sr][sc]!;
        const targetPiece = board[r][c];

        const newBoard = board.map(row => [...row]);
        newBoard[r][c] = movingPiece;
        newBoard[sr][sc] = null;

        const capturedRed = [...gameState.capturedRed];
        const capturedBlack = [...gameState.capturedBlack];
        if (targetPiece) {
          if (targetPiece.color === PieceColor.RED) capturedRed.push(targetPiece);
          else capturedBlack.push(targetPiece);
        }

        const nextState: GameState = {
          ...gameState,
          board: newBoard,
          turn: turn === PieceColor.RED ? PieceColor.BLACK : PieceColor.RED,
          selectedPos: null,
          capturedRed,
          capturedBlack,
          history: [...history, { type: 'move', from: [sr, sc], to: [r, c], captured: targetPiece }]
        };
        
        nextState.winner = checkWinner(nextState);
        if (nextState.winner) confetti();
        setGameState(nextState);
      } else {
        setGameState({ ...gameState, selectedPos: null });
      }
    }
  };

  const handleStartLobby = () => {
    setMpState(prev => ({ ...prev, isMultiplayerActive: true }));
  };

  const handleCreateRoomAction = () => {
    // Save nickname
    if (tempName.trim()) {
      setPlayerName(tempName.trim());
    }
    const generatedId = Math.random().toString(36).substring(2, 7).toUpperCase();
    createRoom(generatedId);
  };

  const handleJoinRoomAction = (code?: string) => {
    if (tempName.trim()) {
      setPlayerName(tempName.trim());
    }
    const finalCode = code || inputRoomId;
    if (finalCode.trim()) {
      joinRoom(finalCode.trim().toUpperCase());
    }
  };

  if (!gameState) return null;

  // Connection status descriptions in Traditional Chinese
  const getConnectionLabel = () => {
    switch (mpState.connectionStatus) {
      case 'connecting_mqtt': return '正在連線信令伺服器...';
      case 'lobby': return mpState.isHost ? '大廳就緒，等待對手加入' : '已進入大廳，等待連線';
      case 'connecting_webrtc': return '正在建立 WebRTC P2P 直連...';
      case 'connected': return 'P2P 直連已建立';
      case 'disconnected': return '連線已中斷，正在自動重連';
      default: return '未連線';
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-serif flex flex-col overflow-hidden">
      {/* QR Scanner Overlay */}
      {showScanner && (
        <CameraQRScanner
          onScanSuccess={(scannedCode) => {
            setShowScanner(false);
            setInputRoomId(scannedCode);
            handleJoinRoomAction(scannedCode);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Header */}
      <header className="min-h-16 py-3 flex flex-col md:flex-row items-center justify-between px-4 md:px-8 bg-zinc-950 border-b border-zinc-800 gap-3 shrink-0">
        <div className="flex flex-wrap items-center justify-center gap-2 text-center md:text-left">
          <h1 className="text-xl md:text-2xl font-bold tracking-widest text-zinc-100 flex items-center gap-2">
            玄冥棋弈 
            <span className="text-zinc-500 font-light text-sm md:text-base">| {mode === GameMode.DARK ? '暗棋模式' : '正規模式'}</span>
          </h1>
          <span className="px-2.5 py-0.5 bg-zinc-800 text-[9px] text-zinc-400 rounded-full border border-zinc-700 uppercase tracking-widest font-mono">
            {mpState.isMultiplayerActive ? 'P2P Mode' : `v2.4.0 AI ${isAiEnabled ? 'Enabled' : 'Disabled'}`}
          </span>
        </div>
        
        <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6">
          <div className="flex items-center text-xs md:text-sm">
            <span className={cn("inline-block w-2 h-2 rounded-full mr-2", gameState.turn === PieceColor.RED ? "bg-red-500 shadow-[0_0_8px_#ef4444]" : "bg-zinc-500")} />
            <span className="text-zinc-400">當前回合：</span>
            <span className={cn("font-bold ml-1", gameState.turn === PieceColor.RED ? "text-red-500" : "text-zinc-300")}>
              {gameState.turn === PieceColor.RED ? '紅方' : '黑方'} 
              {mpState.isMultiplayerActive ? (
                gameState.turn === mpState.myColor ? ' (您的回合)' : ' (對手回合)'
              ) : (
                isAiEnabled && gameState.turn !== playerColor ? ' (AI)' : (gameState.turn === playerColor ? ' (玩家)' : '')
              )}
            </span>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={toggleMute}
              className={cn(
                "p-2 rounded border transition-all relative group cursor-pointer",
                !isMuted ? "bg-red-900/20 text-red-400 border-red-900/50 shadow-[0_0_8px_rgba(220,38,38,0.3)]" : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500"
              )}
              title={!isMuted ? "暫停音樂" : "播放背景音樂"}
            >
              {!isMuted ? (
                <Volume2 size={16} className="animate-pulse" />
              ) : (
                <VolumeX size={16} />
              )}
            </button>
            
            {/* AI Toggle only in single-player */}
            {!mpState.isMultiplayerActive && (
              <button 
                onClick={() => setIsAiEnabled(!isAiEnabled)}
                className={cn(
                  "p-2 rounded border transition-all cursor-pointer",
                  isAiEnabled ? "bg-red-900/20 text-red-400 border-red-900/50" : "bg-zinc-800 text-zinc-400 border-zinc-700"
                )}
                title="切換人機模式"
              >
                <Cpu size={16} />
              </button>
            )}

            <button 
              onClick={() => {
                if (mpState.isMultiplayerActive) {
                  if (mpState.isHost) {
                    initGame(mode);
                  }
                } else {
                  initGame(mode);
                }
              }}
              disabled={mpState.isMultiplayerActive && !mpState.isHost}
              className="p-2 bg-zinc-800 disabled:opacity-40 text-zinc-300 border border-zinc-700 rounded hover:bg-zinc-700 transition cursor-pointer disabled:cursor-not-allowed"
              title="重啟局"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden bg-zinc-900">
        {/* Left Sidebar - Capture & AI Status */}
        <aside className="w-full lg:w-72 p-6 flex flex-col gap-6 border-b lg:border-b-0 lg:border-r border-zinc-800 bg-zinc-950 shrink-0 order-2 lg:order-1">
          {/* Captures */}
          <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl">
            <h3 className="text-zinc-500 uppercase text-[10px] font-bold tracking-[0.2em] mb-4">俘虜清單</h3>
            <div className="space-y-4">
              <div className="p-3 bg-zinc-950/50 rounded border border-zinc-800">
                <p className="text-[10px] uppercase font-bold text-red-500/70 mb-2 tracking-widest">黑方戰利品 (紅方俘虜)</p>
                <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                  {gameState.capturedRed.map((p, i) => (
                    <span key={i} className="text-red-500 opacity-60 text-lg font-bold">{PIECE_NAMES[p.color][p.type]}</span>
                  ))}
                </div>
              </div>
              <div className="p-3 bg-zinc-950/50 rounded border border-zinc-800">
                <p className="text-[10px] uppercase font-bold text-zinc-500 mb-2 tracking-widest">紅方戰利品 (黑方俘虜)</p>
                <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                  {gameState.capturedBlack.map((p, i) => (
                    <span key={i} className="text-zinc-300 opacity-60 text-lg font-bold">{PIECE_NAMES[p.color][p.type]}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Multiplayer Side Panel OR AI Status */}
          {mpState.isMultiplayerActive ? (
            <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col gap-4">
              <h3 className="text-zinc-500 uppercase text-[10px] font-bold tracking-[0.2em]">連線狀態與席位</h3>
              
              {/* Status Badge */}
              <div className="px-3 py-2 bg-zinc-950 rounded border border-zinc-850 flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-500 font-mono">狀態</span>
                <span className="text-[10px] text-red-400 font-bold font-mono animate-pulse">
                  {getConnectionLabel()}
                </span>
              </div>

              {/* Opponent & Self Seat Info */}
              <div className="space-y-2 mt-1">
                <div className="p-3 bg-zinc-950/40 border border-zinc-850 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User size={14} className="text-red-500" />
                    <span className="text-xs font-bold truncate max-w-[100px]">{mpState.playerName} (您)</span>
                  </div>
                  <span className={cn(
                    "text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase",
                    mpState.myColor === PieceColor.RED ? "bg-red-500/20 text-red-400 border border-red-500/30" : 
                    mpState.myColor === PieceColor.BLACK ? "bg-zinc-800 text-zinc-300 border border-zinc-700" :
                    "bg-zinc-900 text-zinc-600 border border-zinc-800"
                  )}>
                    {mpState.myColor === PieceColor.RED ? '紅方' : mpState.myColor === PieceColor.BLACK ? '黑方' : '未定'}
                  </span>
                </div>

                <div className="p-3 bg-zinc-950/40 border border-zinc-850 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User size={14} className={mpState.opponentOnline ? "text-emerald-500" : "text-zinc-600"} />
                    <span className="text-xs font-bold truncate max-w-[100px]">
                      {mpState.opponentName || '等待加入...'}
                    </span>
                  </div>
                  
                  {mpState.opponentId ? (
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase",
                      mpState.myColor === PieceColor.RED ? "bg-zinc-800 text-zinc-300 border border-zinc-700" : 
                      mpState.myColor === PieceColor.BLACK ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                      "bg-zinc-900 text-zinc-600 border border-zinc-800"
                    )}>
                      {mpState.myColor === PieceColor.RED ? '黑方' : mpState.myColor === PieceColor.BLACK ? '紅方' : '未定'}
                    </span>
                  ) : (
                    <span className="text-[9px] text-zinc-600 italic">空位</span>
                  )}
                </div>
              </div>

              {/* Exit Room Action */}
              <button
                onClick={disconnectAll}
                className="w-full mt-2 py-2.5 px-4 bg-red-950/20 hover:bg-red-950/40 border border-red-900/40 text-red-400 rounded-xl font-bold text-[10px] tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Power size={12} />
                <span>中斷對局大廳</span>
              </button>
            </div>
          ) : (
            <>
              {/* Standard Single Player AI status */}
              <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl">
                 <h3 className="text-zinc-500 uppercase text-[10px] font-bold tracking-[0.2em] mb-4">AI 狀態分析</h3>
                 <div className="space-y-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-500">勝率評估</span>
                      <span className="text-red-400 font-mono">{(gameState.capturedBlack.length - gameState.capturedRed.length) > 0 ? '+' : ''}{gameState.capturedBlack.length - gameState.capturedRed.length}.00</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-500">模式優化</span>
                      <span className="text-zinc-300">{mode === GameMode.DARK ? '暗棋邏輯' : '正規博弈'}</span>
                    </div>
                    <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-4 overflow-hidden">
                       <motion.div 
                        initial={{ width: '50%' }}
                        animate={{ width: `${50 + (gameState.capturedBlack.length - gameState.capturedRed.length) * 5}%` }}
                        className="bg-red-600 h-full shadow-[0_0_8px_rgba(220,38,38,0.5)]" 
                       />
                    </div>
                 </div>
              </div>

              {/* Start Multiplayer button */}
              <button
                onClick={handleStartLobby}
                className="w-full py-3.5 px-5 bg-gradient-to-r from-red-800 to-red-950 border border-red-700/50 hover:border-red-500 text-red-100 rounded-xl font-bold text-xs tracking-wider flex items-center justify-center gap-2 transition-all shadow-[0_0_16px_rgba(239,68,68,0.2)] hover:shadow-[0_0_24px_rgba(239,68,68,0.3)] active:scale-95 cursor-pointer"
              >
                <Gamepad2 size={15} />
                <span>開啟多人連線對戰</span>
              </button>
            </>
          )}

          {/* Mode Switchers */}
          <div className="mt-auto">
            <h3 className="text-zinc-500 uppercase text-[10px] font-bold tracking-[0.2em] mb-3">棋局模式</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  if (mpState.isMultiplayerActive) {
                    if (mpState.isHost) {
                      initGame(GameMode.DARK);
                      broadcastGameState(GameEngine.initBoard(GameMode.DARK) as any); // Sync instantly
                    }
                  } else {
                    initGame(GameMode.DARK);
                  }
                }}
                disabled={mpState.isMultiplayerActive && !mpState.isHost}
                className={cn(
                  "p-2 text-[10px] font-bold rounded border transition-all uppercase tracking-widest cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
                  mode === GameMode.DARK ? "bg-zinc-100 text-zinc-950 border-zinc-100" : "bg-zinc-800 text-zinc-500 border-zinc-700 hover:border-zinc-500"
                )}
              >
                暗棋
              </button>
              <button
                onClick={() => {
                  if (mpState.isMultiplayerActive) {
                    if (mpState.isHost) {
                      initGame(GameMode.CLASSIC);
                      broadcastGameState(GameEngine.initBoard(GameMode.CLASSIC) as any); // Sync instantly
                    }
                  } else {
                    initGame(GameMode.CLASSIC);
                  }
                }}
                disabled={mpState.isMultiplayerActive && !mpState.isHost}
                className={cn(
                  "p-2 text-[10px] font-bold rounded border transition-all uppercase tracking-widest cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
                  mode === GameMode.CLASSIC ? "bg-zinc-100 text-zinc-950 border-zinc-100" : "bg-zinc-800 text-zinc-500 border-zinc-700 hover:border-zinc-500"
                )}
              >
                正規
              </button>
            </div>
          </div>
        </aside>

        {/* Center - Board OR Lobby */}
        <section className="flex-1 flex items-center justify-center p-4 md:p-8 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-800 to-zinc-950 relative min-h-[480px] lg:min-h-0 order-1 lg:order-2">
          
          {mpState.isMultiplayerActive && mpState.connectionStatus !== 'connected' ? (
            /* MULTIPLAYER MATCHMAKING LOBBY UI */
            <div className="w-full max-w-lg p-6 md:p-8 bg-zinc-900/60 border border-zinc-800 rounded-3xl backdrop-blur-md shadow-2xl flex flex-col items-center">
              
              <div className="bg-zinc-950 p-4 rounded-full border border-zinc-800 mb-4">
                <Gamepad2 size={24} className="text-red-500" />
              </div>

              <h2 className="text-2xl font-bold tracking-widest text-zinc-100 mb-2 font-serif text-center">
                玄冥星陣 • 跨空對決
              </h2>
              <p className="text-[10px] text-zinc-500 tracking-widest uppercase mb-6 font-mono text-center">
                P2P Serverless Chess matchmaking
              </p>

              {/* Dynamic URL Detected Banner */}
              {detectedUrlRoomId && mpState.connectionStatus === 'lobby' && !mpState.isHost && (
                <div className="w-full mb-5 px-4 py-3 bg-red-950/20 border border-red-900/40 rounded-2xl flex items-center justify-between gap-3 animate-pulse">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={14} className="text-red-400 shrink-0" />
                    <span className="text-[11px] font-bold text-red-200">偵測到 URL 對局代碼: <span className="font-mono text-red-400">{detectedUrlRoomId}</span></span>
                  </div>
                  <button
                    onClick={() => handleJoinRoomAction(detectedUrlRoomId)}
                    className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg font-bold text-[10px] transition-colors"
                  >
                    一鍵連線
                  </button>
                </div>
              )}

              {mpState.connectionStatus === 'lobby' ? (
                /* CREATE / JOIN CHOOSE FORM */
                <div className="w-full space-y-6">
                  {/* Name Input */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">設定棋手暱稱</label>
                    <input
                      type="text"
                      maxLength={10}
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      placeholder="輸入您的暱稱..."
                      className="w-full px-4 py-3 bg-zinc-950 border border-zinc-850 hover:border-zinc-800 focus:border-red-500/50 rounded-xl text-sm font-bold text-zinc-200 focus:outline-none transition-colors"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Create Room Card */}
                    <div className="p-5 bg-zinc-950/60 border border-zinc-850 rounded-2xl flex flex-col justify-between hover:border-zinc-700/60 transition-all">
                      <div>
                        <h4 className="text-sm font-bold text-zinc-200 mb-1 flex items-center gap-2">
                          <UserPlus size={14} className="text-red-500" />
                          <span>開創局</span>
                        </h4>
                        <p className="text-[10px] text-zinc-500 leading-relaxed mb-4">
                          身為房主，生成一個專屬的 5 碼房間代碼與動態 QR Code。
                        </p>
                      </div>
                      <button
                        onClick={handleCreateRoomAction}
                        className="w-full py-2.5 bg-zinc-100 hover:bg-white text-zinc-950 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                      >
                        開房建局
                      </button>
                    </div>

                    {/* Join Room Card */}
                    <div className="p-5 bg-zinc-950/60 border border-zinc-850 rounded-2xl flex flex-col justify-between hover:border-zinc-700/60 transition-all">
                      <div>
                        <h4 className="text-sm font-bold text-zinc-200 mb-1 flex items-center gap-2">
                          <Share2 size={14} className="text-zinc-400" />
                          <span>加入局</span>
                        </h4>
                        <p className="text-[10px] text-zinc-500 leading-relaxed mb-4">
                          手動輸入 5 碼代碼，或者直接開啟相機掃描條碼。
                        </p>
                      </div>

                      <div className="space-y-2">
                        <input
                          type="text"
                          maxLength={5}
                          value={inputRoomId}
                          onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                          placeholder="請輸入 5 碼代碼"
                          className="w-full px-3 py-2 bg-zinc-950 border border-zinc-850 hover:border-zinc-800 rounded-lg text-xs font-mono tracking-widest text-center text-zinc-200 focus:outline-none"
                        />
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleJoinRoomAction()}
                            disabled={!inputRoomId}
                            className="flex-1 py-2 bg-zinc-800 disabled:opacity-40 hover:bg-zinc-700 text-zinc-300 rounded-lg font-bold text-[10px] transition-colors cursor-pointer disabled:cursor-not-allowed"
                          >
                            連線加入
                          </button>
                          <button
                            onClick={() => setShowScanner(true)}
                            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors cursor-pointer"
                            title="打開相機掃碼"
                          >
                            <Camera size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* IN PROCESS STATUS (HOST OR GUEST) */
                <div className="w-full flex flex-col items-center py-4">
                  {mpState.isHost ? (
                    <RoomQRCode roomId={mpState.roomId} />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-6 bg-zinc-900/80 border border-zinc-800 rounded-3xl backdrop-blur-xl max-w-sm w-full relative">
                      <RefreshCw size={28} className="text-red-500 animate-spin mb-4" />
                      <h4 className="text-zinc-300 text-sm font-bold tracking-wider mb-2">正在與房主配對</h4>
                      <p className="text-[10px] text-zinc-500 text-center leading-relaxed">
                        已向房主 <span className="font-bold text-zinc-300">{mpState.roomId}</span> 發起 WebRTC 連線握手...
                      </p>
                    </div>
                  )}

                  <div className="mt-8 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    <span className="text-[10px] text-zinc-500 font-mono tracking-wider">{getConnectionLabel()}</span>
                  </div>
                </div>
              )}

              {/* Close / Return button */}
              <button
                onClick={disconnectAll}
                className="mt-6 text-[10px] text-zinc-600 hover:text-zinc-400 uppercase tracking-widest font-mono underline underline-offset-4 cursor-pointer"
              >
                返回單機對抗
              </button>
            </div>
          ) : (
            /* STANDARD ACTIVE GAME BOARD VIEW */
            <div className="relative">
              <Board 
                gameState={gameState} 
                mode={mode} 
                onSquareClick={handleSquareClick} 
              />

              <AnimatePresence>
                {gameState.winner && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-950/60 backdrop-blur-[4px] rounded-lg"
                  >
                    <motion.div 
                      initial={{ scale: 0.8, y: 20 }}
                      animate={{ scale: 1, y: 0 }}
                      className="bg-zinc-900 p-10 rounded-[32px] shadow-2xl border border-zinc-700 flex flex-col items-center max-w-xs text-center"
                    >
                      <div className="bg-zinc-800 p-5 rounded-full mb-6 border border-zinc-700">
                        <Trophy className="text-red-500 w-12 h-12" />
                      </div>
                      <h2 className="text-3xl font-bold mb-2 text-zinc-100 tracking-widest">
                        {gameState.winner === PieceColor.RED ? '紅方大捷' : '黑方大捷'}
                      </h2>
                      <p className="text-zinc-500 mb-8 text-sm leading-relaxed">此局已在玄冥棋壇留下紀錄。</p>
                      
                      <button 
                        onClick={() => initGame(mode)}
                        disabled={mpState.isMultiplayerActive && !mpState.isHost}
                        className="w-full py-4 bg-zinc-100 text-zinc-950 disabled:opacity-40 disabled:hover:bg-zinc-100 rounded-xl font-bold hover:bg-white transition-all shadow-xl cursor-pointer disabled:cursor-not-allowed"
                      >
                        再次開局
                      </button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </section>

        {/* Right Sidebar - History */}
        <aside className="w-full lg:w-72 p-6 bg-zinc-950 border-t lg:border-t-0 lg:border-l border-zinc-800 shrink-0 order-3 lg:order-3">
          <h3 className="text-zinc-500 uppercase text-[10px] font-bold tracking-[0.2em] mb-6">對局紀錄</h3>
          <div className="space-y-3">
            {gameState.history.length === 0 && (
              <p className="text-[10px] text-zinc-600 text-center italic mt-10">尚無紀錄...</p>
            )}
            {gameState.history.slice().reverse().map((entry, idx) => (
              <div key={idx} className="flex items-start text-[10px] group">
                <span className="w-8 text-zinc-700 font-mono">{(gameState.history.length - idx).toString().padStart(2, '0')}.</span>
                <div className="flex-1 px-2 py-1.5 bg-zinc-900/30 rounded border border-transparent group-hover:border-zinc-800 transition-colors">
                  {entry.type === 'flip' ? (
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-400">翻開 [{entry.pos[0]},{entry.pos[1]}]</span>
                      <span className={cn("italic font-bold", entry.piece.color === PieceColor.RED ? "text-red-500" : "text-zinc-300")}>
                        {PIECE_NAMES[entry.piece.color][entry.piece.type]}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <div className="flex justify-between">
                         <span className="text-zinc-400">移動 [{entry.from[0]},{entry.from[1]}] → [{entry.to[0]},{entry.to[1]}]</span>
                      </div>
                      {entry.captured && (
                        <div className={cn("mt-1 text-[9px] font-bold", entry.captured.color === PieceColor.RED ? "text-red-500/60" : "text-zinc-300/60")}>
                          吃了 {PIECE_NAMES[entry.captured.color][entry.captured.type]}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            <div className="mt-12 pt-6 border-t border-zinc-800 text-center">
              <p className="text-[9px] text-zinc-600 uppercase tracking-widest leading-loose">
                點擊棋子進行翻轉及移動<br/>
                系統自動切換玩家與對手
              </p>
            </div>
          </div>
        </aside>
      </main>

      {/* Footer */}
      <footer className="h-12 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between px-8 text-[9px] text-zinc-500 uppercase tracking-[0.2em] font-mono">
        <div>Engine: AlphaDark-V4 (AI Mode Beta)</div>
        <div className="flex gap-8">
          <span id="vercount_container_site_pv">
            VIEWS: <span id="vercount_value_site_pv">--</span>
          </span>
          <span id="vercount_container_site_uv">
            VISITORS: <span id="vercount_value_site_uv">--</span>
          </span>
          <span>Latency: {isAiThinking ? '...' : '24ms'}</span>
          <span>Seed: {(Math.random() * 0xFFFFF).toString(16).toUpperCase()}</span>
        </div>
      </footer>
    </div>
  );
}

interface BoardProps {
  gameState: GameState;
  mode: GameMode;
  onSquareClick: (r: number, c: number) => void;
}

function Board({ gameState, mode, onSquareClick }: BoardProps) {
  const { board, selectedPos } = gameState;
  const rows = board.length;
  const cols = board[0].length;
  
  const validMoves = selectedPos ? GameEngine.getValidMoves(gameState, selectedPos) : [];

  return (
    <div 
      className={cn(
        "grid shadow-2xl relative",
        mode === GameMode.CLASSIC ? "p-2 rounded-sm border-2 border-zinc-700 bg-zinc-800/50" : "p-3 rounded-xl border-4 border-zinc-700 bg-gradient-to-br from-zinc-800 to-zinc-900"
      )}
      style={{
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        width: mode === GameMode.CLASSIC ? 'min(85vw, 600px)' : 'min(85vw, 400px)',
        aspectRatio: mode === GameMode.CLASSIC ? '9/10' : '4/8',
        gap: mode === GameMode.DARK ? '8px' : '0px'
      }}
    >
      {/* Visual Lines for Classic Board */}
      {mode === GameMode.CLASSIC && (
        <div className="absolute inset-0 pointer-events-none p-[5%]">
            <svg viewBox="0 0 80 90" className="w-full h-full opacity-30 stroke-zinc-400 stroke-[0.2]">
                {Array.from({length: 10}).map((_, i) => <line key={i} x1="0" y1={i*10} x2="80" y2={i*10} />)}
                {Array.from({length: 9}).map((_, i) => (
                   <line key={i} x1={i*10} y1="0" x2={i*10} y2="40" />
                ))}
                {Array.from({length: 9}).map((_, i) => (
                   <line key={i} x1={i*10} y1="50" x2={i*10} y2="90" />
                ))}
                <line x1="0" y1="0" x2="0" y2="90" />
                <line x1="80" y1="0" x2="80" y2="90" />
                <line x1="30" y1="0" x2="50" y2="20" />
                <line x1="50" y1="0" x2="30" y2="20" />
                <line x1="30" y1="70" x2="50" y2="90" />
                <line x1="50" y1="70" x2="30" y2="90" />
                <text x="40" y="46" textAnchor="middle" fontSize="4" fill="currentColor" className="opacity-40 font-bold uppercase tracking-widest">楚河 漢界</text>
            </svg>
        </div>
      )}

      {/* Squares */}
      {board.map((row, r) => row.map((piece, c) => {
        const isSelected = selectedPos?.[0] === r && selectedPos?.[1] === c;
        const isValidMove = validMoves.some(([vr, vc]) => vr === r && vc === c);
        
        return (
          <div 
            key={`${r}-${c}`}
            onClick={() => onSquareClick(r, c)}
            className={cn(
              "relative flex items-center justify-center cursor-pointer",
              mode === GameMode.DARK ? "bg-white/5 rounded-md border border-white/5 hover:bg-white/10 transition-colors" : ""
            )}
          >
            {/* Move Hint */}
            {isValidMove && (
               <div className="absolute z-10 w-2.5 h-2.5 rounded-full bg-red-500 opacity-60 shadow-[0_0_8px_#ef4444] animate-pulse" />
            )}

            <AnimatePresence mode="popLayout">
              {piece && (
                <motion.div
                  key={piece.id}
                  initial={{ rotateY: piece.isRevealed ? 0 : 180, scale: 0.8 }}
                  animate={{ rotateY: piece.isRevealed ? 0 : 180, scale: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  whileHover={{ scale: 1.05, y: -2 }}
                  className={cn(
                    "w-5/6 h-5/6 rounded-full flex items-center justify-center font-bold text-xl md:text-3xl shadow-xl transition-all relative border-2",
                    piece.isRevealed 
                      ? (piece.color === PieceColor.RED 
                          ? "bg-gradient-to-br from-red-500 to-red-900 border-red-700 text-red-50 shadow-red-900/40" 
                          : "bg-gradient-to-br from-zinc-600 to-zinc-950 border-zinc-800 text-zinc-100 shadow-black/60")
                      : "bg-gradient-to-br from-zinc-700 to-zinc-800 border-zinc-900 text-transparent shadow-md",
                    isSelected ? "ring-4 ring-red-500/50 ring-offset-2 ring-offset-zinc-900 z-20" : ""
                  )}
                >
                  {piece.isRevealed ? (
                    <span className="select-none drop-shadow-lg">{PIECE_NAMES[piece.color][piece.type]}</span>
                  ) : (
                    <div className="w-full h-full rounded-full bg-[linear-gradient(45deg,_var(--color-zinc-800)_25%,_var(--color-zinc-700)_25%,_var(--color-zinc-700)_50%,_var(--color-zinc-800)_50%,_var(--color-zinc-800)_75%,_var(--color-zinc-700)_75%,_var(--color-zinc-700)_100%)] bg-[length:10px_10px]" />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      }))}
    </div>
  );
}
