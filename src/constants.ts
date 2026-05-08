/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PieceType, PieceColor } from './types';

export const PIECE_NAMES: Record<PieceColor, Record<PieceType, string>> = {
  [PieceColor.RED]: {
    [PieceType.KING]: '帥',
    [PieceType.ADVISOR]: '仕',
    [PieceType.ELEPHANT]: '相',
    [PieceType.CHARIOT]: '俥',
    [PieceType.HORSE]: '傌',
    [PieceType.CANNON]: '炮',
    [PieceType.SOLDIER]: '兵',
  },
  [PieceColor.BLACK]: {
    [PieceType.KING]: '將',
    [PieceType.ADVISOR]: '士',
    [PieceType.ELEPHANT]: '象',
    [PieceType.CHARIOT]: '車',
    [PieceType.HORSE]: '馬',
    [PieceType.CANNON]: '砲',
    [PieceType.SOLDIER]: '卒',
  },
};

// Hierarchy for Dark Chess (High to Low)
export const DARK_CHESS_HIERARCHY: Record<PieceType, number> = {
  [PieceType.KING]: 7,
  [PieceType.ADVISOR]: 6,
  [PieceType.ELEPHANT]: 5,
  [PieceType.CHARIOT]: 4,
  [PieceType.HORSE]: 3,
  [PieceType.CANNON]: 2, // Cannon is special in movement, but rank wise usually below Horse or above Soldier
  [PieceType.SOLDIER]: 1,
};

export const INITIAL_PIECES_COUNT: Record<PieceType, number> = {
  [PieceType.KING]: 1,
  [PieceType.ADVISOR]: 2,
  [PieceType.ELEPHANT]: 2,
  [PieceType.CHARIOT]: 2,
  [PieceType.HORSE]: 2,
  [PieceType.CANNON]: 2,
  [PieceType.SOLDIER]: 5,
};
