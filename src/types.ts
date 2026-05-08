/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum PieceType {
  KING = 'KING',         // 帥/將
  ADVISOR = 'ADVISOR',   // 仕/士
  ELEPHANT = 'ELEPHANT', // 相/象
  HORSE = 'HORSE',       // 傌/馬
  CHARIOT = 'CHARIOT',   // 俥/車
  CANNON = 'CANNON',     // 炮/砲
  SOLDIER = 'SOLDIER',   // 兵/卒
}

export enum PieceColor {
  RED = 'RED',
  BLACK = 'BLACK',
}

export interface Piece {
  id: string;
  type: PieceType;
  color: PieceColor;
  isRevealed: boolean; // For Dark Chess
}

export type BoardPoint = Piece | null;

export enum GameMode {
  CLASSIC = 'CLASSIC',
  DARK = 'DARK',
}

export interface GameState {
  mode: GameMode;
  board: BoardPoint[][];
  turn: PieceColor;
  capturedRed: Piece[];
  capturedBlack: Piece[];
  winner: PieceColor | 'DRAW' | null;
  history: any[];
  selectedPos: [number, number] | null;
}

export interface Position {
  x: number;
  y: number;
}
