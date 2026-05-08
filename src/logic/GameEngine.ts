/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PieceType, PieceColor, Piece, BoardPoint, GameMode, GameState } from '../types';
import { INITIAL_PIECES_COUNT, DARK_CHESS_HIERARCHY } from '../constants';

export class GameEngine {
  static createInitialPieces(): Piece[] {
    const pieces: Piece[] = [];
    [PieceColor.RED, PieceColor.BLACK].forEach((color) => {
      Object.entries(INITIAL_PIECES_COUNT).forEach(([type, count]) => {
        for (let i = 0; i < count; i++) {
          pieces.push({
            id: `${color}-${type}-${i}`,
            type: type as PieceType,
            color,
            isRevealed: false,
          });
        }
      });
    });
    return pieces;
  }

  static initBoard(mode: GameMode): BoardPoint[][] {
    if (mode === GameMode.DARK) {
      const allPieces = this.shuffle(this.createInitialPieces());
      const board: BoardPoint[][] = Array(8).fill(null).map(() => Array(4).fill(null));
      let idx = 0;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 4; c++) {
          board[r][c] = allPieces[idx++];
        }
      }
      return board;
    } else {
      // Classic Xiangqi Board 10x9
      const board: BoardPoint[][] = Array(10).fill(null).map(() => Array(9).fill(null));
      this.setupClassic(board);
      return board;
    }
  }

  static shuffle<T>(array: T[]): T[] {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  static setupClassic(board: BoardPoint[][]) {
    const pieces = (color: PieceColor, r: number) => {
      const side = color === PieceColor.RED ? 1 : -1;
      const row = r;
      // Chariots
      board[row][0] = { id: `${color}-rc-1`, type: PieceType.CHARIOT, color, isRevealed: true };
      board[row][8] = { id: `${color}-rc-2`, type: PieceType.CHARIOT, color, isRevealed: true };
      // Horses
      board[row][1] = { id: `${color}-rh-1`, type: PieceType.HORSE, color, isRevealed: true };
      board[row][7] = { id: `${color}-rh-2`, type: PieceType.HORSE, color, isRevealed: true };
      // Elephants
      board[row][2] = { id: `${color}-re-1`, type: PieceType.ELEPHANT, color, isRevealed: true };
      board[row][6] = { id: `${color}-re-2`, type: PieceType.ELEPHANT, color, isRevealed: true };
      // Advisors
      board[row][3] = { id: `${color}-ra-1`, type: PieceType.ADVISOR, color, isRevealed: true };
      board[row][5] = { id: `${color}-ra-2`, type: PieceType.ADVISOR, color, isRevealed: true };
      // King
      board[row][4] = { id: `${color}-rk`, type: PieceType.KING, color, isRevealed: true };

      // Cannons
      const cannonRow = color === PieceColor.RED ? 7 : 2;
      board[cannonRow][1] = { id: `${color}-ca-1`, type: PieceType.CANNON, color, isRevealed: true };
      board[cannonRow][7] = { id: `${color}-ca-2`, type: PieceType.CANNON, color, isRevealed: true };

      // Soldiers
      const soldierRow = color === PieceColor.RED ? 6 : 3;
      for (let i = 0; i < 9; i += 2) {
        board[soldierRow][i] = { id: `${color}-so-${i}`, type: PieceType.SOLDIER, color, isRevealed: true };
      }
    };

    pieces(PieceColor.BLACK, 0);
    pieces(PieceColor.RED, 9);
  }

  static getValidMoves(state: GameState, pos: [number, number]): [number, number][] {
    const { mode, board } = state;
    const [r, c] = pos;
    const piece = board[r][c];
    if (!piece || !piece.isRevealed) return [];

    const moves: [number, number][] = [];
    const rows = board.length;
    const cols = board[0].length;

    if (mode === GameMode.DARK) {
      // Banqi moves
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      dirs.forEach(([dr, dc]) => {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          if (this.canCaptureBanqi(piece, board[nr][nc])) {
            moves.push([nr, nc]);
          }
        }
      });

      // Special Cannon jump-capture
      if (piece.type === PieceType.CANNON) {
        dirs.forEach(([dr, dc]) => {
          let hurdle = 0;
          for (let step = 1; ; step++) {
            const nr = r + dr * step;
            const nc = c + dc * step;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) break;
            
            const target = board[nr][nc];
            if (target) {
              if (hurdle === 0) {
                hurdle = 1;
              } else if (hurdle === 1) {
                // Second piece found
                if (target.isRevealed && target.color !== piece.color) {
                  moves.push([nr, nc]);
                }
                break;
              }
            }
          }
        });
      }
    } else {
      // Classic Moves
      // Simplified: Just basic legal moves without check detection for brevity in a 'simple' algorithm
      this.getClassicMoves(piece, r, c, board, moves);
    }

    return moves;
  }

  static canCaptureBanqi(attacker: Piece, target: BoardPoint): boolean {
    if (!target) return true; // Move to empty
    if (!target.isRevealed) return false; // Cannot capture face down pieces (except for the first flip move which is handled elsewhere)
    if (attacker.color === target.color) return false; // Same color

    // Cannon Special: Captures are handled in getValidMoves loop
    if (attacker.type === PieceType.CANNON) return false; 

    const aRank = DARK_CHESS_HIERARCHY[attacker.type];
    const tRank = DARK_CHESS_HIERARCHY[target.type];

    // Soldier (1) eats King (7)
    if (attacker.type === PieceType.SOLDIER && target.type === PieceType.KING) return true;
    // King (7) cannot eat Soldier (1)
    if (attacker.type === PieceType.KING && target.type === PieceType.SOLDIER) return false;
    
    return aRank >= tRank;
  }

  static getClassicMoves(piece: Piece, r: number, c: number, board: BoardPoint[][], moves: [number, number][]) {
    const isRed = piece.color === PieceColor.RED;
    const addIfLegal = (nr: number, nc: number) => {
      if (nr < 0 || nr >= 10 || nc < 0 || nc >= 9) return false;
      const target = board[nr][nc];
      if (!target || target.color !== piece.color) {
        moves.push([nr, nc]);
        return !target; // Return true if empty (can continue for Chariot)
      }
      return false; // Blocked by own
    };

    switch (piece.type) {
      case PieceType.KING: {
        const rRange = isRed ? [7, 9] : [0, 2];
        const cRange = [3, 5];
        [[0,1],[0,-1],[1,0],[-1,0]].forEach(([dr, dc]) => {
          const nr = r + dr, nc = c + dc;
          if (nr >= rRange[0] && nr <= rRange[1] && nc >= cRange[0] && nc <= cRange[1]) {
            addIfLegal(nr, nc);
          }
        });
        break;
      }
      case PieceType.ADVISOR: {
        const rRange = isRed ? [7, 9] : [0, 2];
        const cRange = [3, 5];
        [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([dr, dc]) => {
          const nr = r + dr, nc = c + dc;
          if (nr >= rRange[0] && nr <= rRange[1] && nc >= cRange[0] && nc <= cRange[1]) {
            addIfLegal(nr, nc);
          }
        });
        break;
      }
      case PieceType.ELEPHANT: {
        const river = isRed ? 5 : 4;
        [[2,2],[2,-2],[-2,2],[-2,-2]].forEach(([dr, dc]) => {
          const nr = r + dr, nc = c + dc;
          const eyeR = r + dr/2, eyeC = c + dc/2;
          if (isRed ? nr >= 5 : nr <= 4) {
             if (nr >= 0 && nr < 10 && nc >= 0 && nc < 9 && !board[eyeR][eyeC]) {
               addIfLegal(nr, nc);
             }
          }
        });
        break;
      }
      case PieceType.HORSE: {
        [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]].forEach(([dr, dc]) => {
          const nr = r + dr, nc = c + dc;
          const footR = r + (Math.abs(dr) === 2 ? dr/2 : 0);
          const footC = c + (Math.abs(dc) === 2 ? dc/2 : 0);
          if (nr >= 0 && nr < 10 && nc >= 0 && nc < 9 && !board[footR][footC]) {
            addIfLegal(nr, nc);
          }
        });
        break;
      }
      case PieceType.CHARIOT: {
        [[0,1],[0,-1],[1,0],[-1,0]].forEach(([dr, dc]) => {
          for (let i = 1; ; i++) {
            const nr = r + dr*i, nc = c + dc*i;
            if (nr < 0 || nr >= 10 || nc < 0 || nc >= 9) break;
            const target = board[nr][nc];
            if (!target) {
              moves.push([nr, nc]);
            } else {
              if (target.color !== piece.color) moves.push([nr, nc]);
              break;
            }
          }
        });
        break;
      }
      case PieceType.CANNON: {
        [[0,1],[0,-1],[1,0],[-1,0]].forEach(([dr, dc]) => {
          let hurdle = false;
          for (let i = 1; ; i++) {
            const nr = r + dr*i, nc = c + dc*i;
            if (nr < 0 || nr >= 10 || nc < 0 || nc >= 9) break;
            const target = board[nr][nc];
            if (!hurdle) {
              if (!target) moves.push([nr, nc]);
              else hurdle = true;
            } else {
              if (target) {
                if (target.color !== piece.color) moves.push([nr, nc]);
                break;
              }
            }
          }
        });
        break;
      }
      case PieceType.SOLDIER: {
        const dir = isRed ? -1 : 1;
        const crossed = isRed ? r <= 4 : r >= 5;
        addIfLegal(r + dir, c);
        if (crossed) {
          addIfLegal(r, c + 1);
          addIfLegal(r, c - 1);
        }
        break;
      }
    }
  }
}
