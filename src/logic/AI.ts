/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PieceType, PieceColor, GameState, GameMode, BoardPoint } from '../types';
import { GameEngine } from './GameEngine';

const PIECE_VALUES: Record<PieceType, number> = {
  [PieceType.KING]: 10000,
  [PieceType.ADVISOR]: 200,
  [PieceType.ELEPHANT]: 200,
  [PieceType.CHARIOT]: 1000,
  [PieceType.HORSE]: 450,
  [PieceType.CANNON]: 500,
  [PieceType.SOLDIER]: 100,
};

const BANQI_VALUES: Record<PieceType, number> = {
  [PieceType.KING]: 100,
  [PieceType.ADVISOR]: 80,
  [PieceType.ELEPHANT]: 60,
  [PieceType.CHARIOT]: 40,
  [PieceType.HORSE]: 30,
  [PieceType.CANNON]: 50,
  [PieceType.SOLDIER]: 20,
};

export class AI {
  // --- 盤面靜態評估函數 ---
  private static evaluateBoard(board: BoardPoint[][], mode: GameMode, aiColor: PieceColor): number {
    let score = 0;
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[0].length; c++) {
        const piece = board[r][c];
        if (piece && piece.isRevealed) {
          const value = mode === GameMode.CLASSIC ? PIECE_VALUES[piece.type] : BANQI_VALUES[piece.type];
          score += piece.color === aiColor ? value : -value;
        }
      }
    }
    return score;
  }

  // --- 模擬移動 (用於搜尋樹) ---
  private static simulateMove(board: BoardPoint[][], from: [number, number], to: [number, number]): BoardPoint[][] {
    const newBoard = board.map(row => [...row]);
    newBoard[to[0]][to[1]] = newBoard[from[0]][from[1]];
    newBoard[from[0]][from[1]] = null;
    return newBoard;
  }

  // --- 取得當下所有合法移動 ---
  private static getAllPossibleMoves(state: GameState, color: PieceColor): { from: [number, number], to: [number, number] }[] {
    const moves: { from: [number, number], to: [number, number] }[] = [];
    for (let r = 0; r < state.board.length; r++) {
      for (let c = 0; c < state.board[0].length; c++) {
        const piece = state.board[r][c];
        if (piece && piece.isRevealed && piece.color === color) {
          const validTargets = GameEngine.getValidMoves(state, [r, c]);
          validTargets.forEach(target => {
            moves.push({ from: [r, c], to: target });
          });
        }
      }
    }
    return moves;
  }

  // --- Minimax with Alpha-Beta Pruning (明棋核心) ---
  private static minimax(state: GameState, depth: number, alpha: number, beta: number, isMaximizing: boolean, aiColor: PieceColor): number {
    if (depth === 0) {
      return this.evaluateBoard(state.board, state.mode, aiColor);
    }

    const currentColor = isMaximizing ? aiColor : (aiColor === PieceColor.RED ? PieceColor.BLACK : PieceColor.RED);
    const possibleMoves = this.getAllPossibleMoves(state, currentColor);

    if (possibleMoves.length === 0) {
      return isMaximizing ? -99999 : 99999; // 無步可走即為輸
    }

    // Alpha-Beta 剪枝優化：吃子走法排在前面優先搜尋，能成倍提高剪枝效率
    const orderedMoves = possibleMoves.map(move => {
      const target = state.board[move.to[0]][move.to[1]];
      const score = target ? (state.mode === GameMode.CLASSIC ? PIECE_VALUES[target.type] : BANQI_VALUES[target.type]) : 0;
      return { ...move, score };
    }).sort((a, b) => b.score - a.score);

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const move of orderedMoves) {
        const newBoard = this.simulateMove(state.board, move.from, move.to);
        const evalScore = this.minimax({ ...state, board: newBoard, turn: currentColor }, depth - 1, alpha, beta, false, aiColor);
        maxEval = Math.max(maxEval, evalScore);
        alpha = Math.max(alpha, evalScore);
        if (beta <= alpha) break; // Beta Cut-off
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const move of orderedMoves) {
        const newBoard = this.simulateMove(state.board, move.from, move.to);
        const evalScore = this.minimax({ ...state, board: newBoard, turn: currentColor }, depth - 1, alpha, beta, true, aiColor);
        minEval = Math.min(minEval, evalScore);
        beta = Math.min(beta, evalScore);
        if (beta <= alpha) break; // Alpha Cut-off
      }
      return minEval;
    }
  }

  // --- 主進入點 ---
  static getBestMove(state: GameState): { from: [number, number] | null, to: [number, number] | null, flip: [number, number] | null } {
    const { board, turn, mode } = state;

    // == 策略 1：暗棋 (Banqi) 啟發式優化 ==
    if (mode === GameMode.DARK) {
      const possibleMoves = this.getAllPossibleMoves(state, turn);
      const possibleFlips: [number, number][] = [];

      for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board[0].length; c++) {
          const piece = board[r][c];
          if (piece && !piece.isRevealed) possibleFlips.push([r, c]);
        }
      }

      // 取得當前敵方所有可能合法的步子，以便進行威脅防守評估
      const enemyColor = turn === PieceColor.RED ? PieceColor.BLACK : PieceColor.RED;
      const currentEnemyMoves = this.getAllPossibleMoves(state, enemyColor);

      let bestMove = null;
      let bestScore = -Infinity;

      for (const move of possibleMoves) {
        const myPiece = board[move.from[0]][move.from[1]]!;
        const targetPiece = board[move.to[0]][move.to[1]];
        let score = targetPiece ? BANQI_VALUES[targetPiece.type] * 2 : 0; // 吃子優先加權

        // 逃跑啟發式：如果我方棋子原本就被敵方威脅，主動走開/逃跑應給予額外加分
        const isCurrentlyThreatened = currentEnemyMoves.some(m => m.to[0] === move.from[0] && m.to[1] === move.from[1]);
        if (isCurrentlyThreatened) {
          score += BANQI_VALUES[myPiece.type] * 0.8; // 逃跑加分
        }

        // 模擬移動後，檢查新位置是否進入敵方射程
        const newBoard = this.simulateMove(board, move.from, move.to);
        const nextEnemyMoves = this.getAllPossibleMoves({ ...state, board: newBoard }, enemyColor);
        
        // 修正原版比較 bug：m.to[1] === m.to[1] 恆為 true，改為正確的 m.to[1] === move.to[1]
        const isThreatenedInNewPos = nextEnemyMoves.some(m => m.to[0] === move.to[0] && m.to[1] === move.to[1]);
        if (isThreatenedInNewPos) {
          score -= BANQI_VALUES[myPiece.type] * 1.2; // 進入敵方射程(送死)，扣除自身價值加成
        }

        // 稍微加入隨機性避免死板走法
        score += Math.random() * 5;

        if (score > bestScore) {
          bestScore = score;
          bestMove = move;
        }
      }

      // 如果最佳步數的預期效益是負的 (出去送死)，且還有牌可翻，則選擇翻牌
      if ((bestMove === null || bestScore < 0) && possibleFlips.length > 0) {
        const randomFlip = possibleFlips[Math.floor(Math.random() * possibleFlips.length)];
        return { from: null, to: null, flip: randomFlip as [number, number] };
      }

      if (bestMove) {
        return { from: bestMove.from, to: bestMove.to, flip: null };
      }
    }

    // == 策略 2：明棋 (Classic) Minimax 搜尋 ==
    const possibleMoves = this.getAllPossibleMoves(state, turn);
    if (possibleMoves.length === 0) return { from: null, to: null, flip: null };

    let bestScore = -Infinity;
    let bestMoves: { from: [number, number], to: [number, number] }[] = [];
    const SEARCH_DEPTH = 3; // 深度 3 可以在不卡頓的情況下提供不錯的決策品質

    for (const move of possibleMoves) {
      const newBoard = this.simulateMove(board, move.from, move.to);
      const score = this.minimax({ ...state, board: newBoard, turn: turn === PieceColor.RED ? PieceColor.BLACK : PieceColor.RED }, SEARCH_DEPTH - 1, -Infinity, Infinity, false, turn);
      
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [move];
      } else if (score === bestScore) {
        bestMoves.push(move); // 同分時加入陣列，增加開局多樣性
      }
    }

    const chosenMove = bestMoves[Math.floor(Math.random() * bestMoves.length)];
    return { from: chosenMove.from, to: chosenMove.to, flip: null };
  }
}
