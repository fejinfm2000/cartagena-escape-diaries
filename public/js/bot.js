/**
 * Cartagena: Escape Diaries - Bot AI (§7.8)
 * Supports Easy, Medium, and Hard difficulty levels.
 */

import { BOAT_INDEX, JAIL_INDEX } from './engine.js';

export class CartagenaBot {
  /**
   * Decide the next action for a bot player
   * Returns: { action: 'FORWARD'|'BACKWARD'|'END_TURN', move?: object }
   */
  static chooseAction(engine, botPlayerId, difficulty = 'medium') {
    const activePlayer = engine.getCurrentPlayer();
    if (!activePlayer || activePlayer.id !== botPlayerId) {
      return null;
    }

    if (engine.actionsLeft <= 0) {
      return { action: 'END_TURN' };
    }

    const legalMoves = engine.getLegalMoves(botPlayerId);
    if (legalMoves.length === 0) {
      return { action: 'END_TURN' };
    }

    switch (difficulty) {
      case 'easy':
        return CartagenaBot._chooseEasy(legalMoves);
      case 'hard':
        return CartagenaBot._chooseHard(engine, activePlayer, legalMoves);
      case 'medium':
      default:
        return CartagenaBot._chooseMedium(engine, activePlayer, legalMoves);
    }
  }

  static _chooseEasy(legalMoves) {
    // 85% chance of picking a random legal move, 15% chance of ending turn if at least 1 action done
    const pick = legalMoves[Math.floor(Math.random() * legalMoves.length)];
    return { action: pick.type, move: pick };
  }

  static _chooseMedium(engine, player, legalMoves) {
    const handCount = player.hand.length;

    // If critically low on cards (< 3) and backward move is available, prefer backward move that gains 2 cards
    if (handCount < 3) {
      const backwardMoves = legalMoves.filter(m => m.type === 'BACKWARD');
      if (backwardMoves.length > 0) {
        // Sort by cards gained descending, then by shortest backward distance
        backwardMoves.sort((a, b) => {
          if (b.cardsGained !== a.cardsGained) return b.cardsGained - a.cardsGained;
          const distA = a.from - a.to;
          const distB = b.from - b.to;
          return distA - distB; // smaller backward retreat is better
        });
        return { action: 'BACKWARD', move: backwardMoves[0] };
      }
    }

    // Forward moves: prefer boat moves or greatest distance jumped
    const forwardMoves = legalMoves.filter(m => m.type === 'FORWARD');
    if (forwardMoves.length > 0) {
      // Check for direct boat score
      const boatMove = forwardMoves.find(m => m.to === BOAT_INDEX);
      if (boatMove) {
        return { action: 'FORWARD', move: boatMove };
      }

      // Sort by distance jumped descending
      forwardMoves.sort((a, b) => {
        const distA = a.to - a.from;
        const distB = b.to - b.from;
        return distB - distA;
      });
      return { action: 'FORWARD', move: forwardMoves[0] };
    }

    // Otherwise backward move if available
    const backwardMoves = legalMoves.filter(m => m.type === 'BACKWARD');
    if (backwardMoves.length > 0) {
      return { action: 'BACKWARD', move: backwardMoves[0] };
    }

    return { action: 'END_TURN' };
  }

  static _chooseHard(engine, player, legalMoves) {
    const handCount = player.hand.length;

    // Evaluate each legal move with a heuristic utility score
    let bestScore = -Infinity;
    let bestMove = legalMoves[0];

    for (const move of legalMoves) {
      let score = 0;

      if (move.type === 'FORWARD') {
        const distance = move.to - move.from;
        score += distance * 3; // Forward progress

        // Huge bonus for putting pirate on Boat
        if (move.to === BOAT_INDEX) {
          score += 150;
        }

        // Bonus if landing space already has 2 pirates (filling to 3 blocks opponents)
        if (move.to !== BOAT_INDEX && engine.board[move.to].pirates.length === 2) {
          score += 18;
        }

        // Penalty if moving pirate from a space where opponent could have used it for backward card draw
        // Moving pirate out of Jail gives good board presence
        if (move.from === JAIL_INDEX) {
          score += 15;
        }

        // Penalty for having very few cards left
        if (handCount <= 2 && move.to !== BOAT_INDEX) {
          score -= 10;
        }
      } else if (move.type === 'BACKWARD') {
        const cardsGained = move.cardsGained; // 1 or 2
        const backwardDistance = move.from - move.to;

        // Card value is extremely high when hand is low
        const cardValueMultiplier = handCount <= 2 ? 35 : handCount <= 4 ? 20 : 8;
        score += cardsGained * cardValueMultiplier;

        // Penalty for stepping backward too far
        score -= backwardDistance * 2.5;

        // Prefer retreating pirates that are trailing rather than lead pirates
        score -= move.from * 0.5;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    // If best move has negative utility and player has done at least 1 action, consider ending turn
    if (bestScore < -5 && engine.actionsLeft < 3) {
      return { action: 'END_TURN' };
    }

    return { action: bestMove.type, move: bestMove };
  }
}
