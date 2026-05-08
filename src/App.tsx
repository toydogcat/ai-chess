/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, RotateCcw, Cpu, User, Info, Settings, LayoutGrid, Tablet as Table, Volume2, VolumeX } from 'lucide-react';
import confetti from 'canvas-confetti';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { GameMode, GameState, PieceColor, PieceType, Piece, Position } from './types';
import { GameEngine } from './logic/GameEngine';
import { AI } from './logic/AI';
import { PIECE_NAMES } from './constants';

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
    if (!gameState || gameState.winner || !isAiEnabled) return;
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
  }, [gameState, isAiEnabled, playerColor]);

  useEffect(() => {
    if (isAiEnabled && gameState && gameState.turn !== playerColor && !gameState.winner) {
      if (gameState.mode === GameMode.DARK && playerColor === null) return;
      handleAiMove();
    }
  }, [gameState?.turn, isAiEnabled, playerColor, handleAiMove]);

  const handleSquareClick = (r: number, c: number, isAiCall = false) => {
    if (!gameState || gameState.winner) return;
    if (!isAiCall && isAiEnabled && gameState.turn !== playerColor && playerColor !== null) return;

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

  if (!gameState) return null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-serif flex flex-col overflow-hidden">
      {/* Header */}
      <header className="min-h-16 py-3 flex flex-col md:flex-row items-center justify-between px-4 md:px-8 bg-zinc-950 border-b border-zinc-800 gap-3 shrink-0">
        <div className="flex flex-wrap items-center justify-center gap-2 text-center md:text-left">
          <h1 className="text-xl md:text-2xl font-bold tracking-widest text-zinc-100 flex items-center gap-2">
            玄冥棋弈 
            <span className="text-zinc-500 font-light text-sm md:text-base">| {mode === GameMode.DARK ? '暗棋模式' : '正規模式'}</span>
          </h1>
          <span className="px-2.5 py-0.5 bg-zinc-800 text-[9px] text-zinc-400 rounded-full border border-zinc-700 uppercase tracking-widest font-mono">
            v2.4.0 AI {isAiEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        
        <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6">
          <div className="flex items-center text-xs md:text-sm">
            <span className={cn("inline-block w-2 h-2 rounded-full mr-2", gameState.turn === PieceColor.RED ? "bg-red-500 shadow-[0_0_8px_#ef4444]" : "bg-zinc-500")} />
            <span className="text-zinc-400">當前回合：</span>
            <span className={cn("font-bold ml-1", gameState.turn === PieceColor.RED ? "text-red-500" : "text-zinc-300")}>
              {gameState.turn === PieceColor.RED ? '紅方' : '黑方'} {isAiEnabled && gameState.turn !== playerColor ? '(AI)' : (gameState.turn === playerColor ? '(玩家)' : '')}
            </span>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={toggleMute}
              className={cn(
                "p-2 rounded border transition-all relative group",
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
            <button 
              onClick={() => setIsAiEnabled(!isAiEnabled)}
              className={cn(
                "p-2 rounded border transition-all",
                isAiEnabled ? "bg-red-900/20 text-red-400 border-red-900/50" : "bg-zinc-800 text-zinc-400 border-zinc-700"
              )}
              title="切換人機模式"
            >
              <Cpu size={16} />
            </button>
            <button 
              onClick={() => initGame(mode)}
              className="p-2 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded hover:bg-zinc-700 transition"
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

          <div className="mt-auto">
            <h3 className="text-zinc-500 uppercase text-[10px] font-bold tracking-[0.2em] mb-3">棋局模式</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => initGame(GameMode.DARK)}
                className={cn(
                  "p-2 text-[10px] font-bold rounded border transition-all uppercase tracking-widest",
                  mode === GameMode.DARK ? "bg-zinc-100 text-zinc-950 border-zinc-100" : "bg-zinc-800 text-zinc-500 border-zinc-700 hover:border-zinc-500"
                )}
              >
                暗棋
              </button>
              <button
                onClick={() => initGame(GameMode.CLASSIC)}
                className={cn(
                  "p-2 text-[10px] font-bold rounded border transition-all uppercase tracking-widest",
                  mode === GameMode.CLASSIC ? "bg-zinc-100 text-zinc-950 border-zinc-100" : "bg-zinc-800 text-zinc-500 border-zinc-700 hover:border-zinc-500"
                )}
              >
                正規
              </button>
            </div>
          </div>
        </aside>

        {/* Center - Board */}
        <section className="flex-1 flex items-center justify-center p-4 md:p-8 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-800 to-zinc-950 relative min-h-[480px] lg:min-h-0 order-1 lg:order-2">
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
                      className="w-full py-4 bg-zinc-100 text-zinc-950 rounded-xl font-bold hover:bg-white transition-all shadow-xl"
                    >
                      再次開局
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
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
                系統自動切換玩家與 AI
              </p>
            </div>
          </div>
        </aside>
      </main>

      {/* Footer */}
      <footer className="h-12 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between px-8 text-[9px] text-zinc-500 uppercase tracking-[0.2em] font-mono">
        <div>Engine: AlphaDark-V4 (AI Mode Beta)</div>
        <div className="flex gap-8">
          <span id="busuanzi_container_site_pv" style={{ display: 'none' }}>
            VIEWS: <span id="busuanzi_value_site_pv"></span>
          </span>
          <span id="busuanzi_container_site_uv" style={{ display: 'none' }}>
            VISITORS: <span id="busuanzi_value_site_uv"></span>
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
