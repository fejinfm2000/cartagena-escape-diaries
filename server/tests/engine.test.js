/**
 * Cartagena: Escape Diaries - Engine Unit Tests (M1)
 * Validates all core rules, movement logic, and edge cases from §5.4.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CartagenaEngine,
  PRNG,
  generateBoard,
  generateDeck,
  JAIL_INDEX,
  BOAT_INDEX,
  SYMBOLS,
  ACTIONS_PER_TURN,
  MAX_PIRATES_PER_SPACE
} from '../engine.js';

test('Board generation contains 36 path spaces, Jail, Boat, and 6 tiles of 6 symbols', () => {
  const board = generateBoard(new PRNG(42));
  assert.equal(board.length, 38); // 0 (Jail) + 36 (Path) + 1 (Boat)
  assert.equal(board[JAIL_INDEX].symbol, 'JAIL');
  assert.equal(board[BOAT_INDEX].symbol, 'BOAT');

  // Verify symbol counts in path (spaces 1..36)
  const pathSymbols = board.slice(1, 37).map(s => s.symbol);
  assert.equal(pathSymbols.length, 36);

  for (const sym of SYMBOLS) {
    const count = pathSymbols.filter(s => s === sym).length;
    assert.equal(count, 6, `Path must contain exactly 6 copies of ${sym}`);
  }
});

test('Deck generation contains 102 cards (17 of each symbol)', () => {
  const deck = generateDeck(new PRNG(42));
  assert.equal(deck.length, 102);

  for (const sym of SYMBOLS) {
    const count = deck.filter(c => c.symbol === sym).length;
    assert.equal(count, 17, `Deck must contain exactly 17 copies of ${sym}`);
  }
});

test('Determinism: Same seed produces identical board and card order', () => {
  const engine1 = new CartagenaEngine({ seed: 99999 });
  const engine2 = new CartagenaEngine({ seed: 99999 });

  assert.deepEqual(engine1.board.map(s => s.symbol), engine2.board.map(s => s.symbol));
  assert.deepEqual(engine1.drawPile.map(c => c.id), engine2.drawPile.map(c => c.id));
});

test('Setup: Players start with 6 cards and 6 pirates in Jail', () => {
  const engine = new CartagenaEngine({ seed: 101 });
  engine.addPlayer({ id: 'p1', name: 'Blackbeard' });
  engine.addPlayer({ id: 'p2', name: 'Calico Jack' });
  engine.start();

  assert.equal(engine.status, 'IN_PROGRESS');
  assert.equal(engine.players[0].hand.length, 6);
  assert.equal(engine.players[1].hand.length, 6);
  assert.equal(engine.players[0].pirates.length, 6);
  assert.equal(engine.players[0].pirates.every(p => p.position === JAIL_INDEX), true);
  assert.equal(engine.board[JAIL_INDEX].pirates.length, 12);
});

test('Action A - Move Forward: moves pirate to nearest matching symbol space with < 3 pirates', () => {
  const engine = new CartagenaEngine({ seed: 202 });
  const p1 = engine.addPlayer({ id: 'p1', name: 'Player 1' });
  engine.addPlayer({ id: 'p2', name: 'Player 2' });
  engine.start();

  // Find a card in p1's hand
  const card = p1.hand[0];
  const pirate = p1.pirates[0];

  // Calculate expected target
  const expectedTarget = engine.getValidForwardTarget(pirate, card.symbol);
  assert.ok(expectedTarget > 0);

  const res = engine.playForward({
    playerId: 'p1',
    pirateId: pirate.id,
    cardId: card.id
  });

  assert.equal(res.success, true);
  assert.equal(pirate.position, expectedTarget);
  assert.equal(engine.board[expectedTarget].pirates.includes(pirate.id), true);
  assert.equal(engine.board[JAIL_INDEX].pirates.includes(pirate.id), false);
  assert.equal(engine.actionsLeft, 2);
  assert.equal(engine.discardPile.length, 1);
});

test('Edge Case: Occupied space is skipped when moving forward with matching symbol', () => {
  const engine = new CartagenaEngine({ seed: 303 });
  const p1 = engine.addPlayer({ id: 'p1' });
  engine.addPlayer({ id: 'p2' });
  engine.start();

  // Find first space matching a symbol
  const testSymbol = SYMBOLS[0];
  const firstMatchingSpace = engine.board.find(s => s.symbol === testSymbol);

  // Manually place 1 pirate on it (occupied)
  firstMatchingSpace.pirates.push('dummy_1');
  assert.equal(firstMatchingSpace.pirates.length, 1);

  // Give p1 a card of testSymbol
  p1.hand = [{ id: 'test_card_1', symbol: testSymbol }];
  const pirate = p1.pirates[0];

  // Moving pirate should SKIP this space because it is occupied!
  const target = engine.getValidForwardTarget(pirate, testSymbol);
  assert.notEqual(target, firstMatchingSpace.index);
  assert.ok(target > firstMatchingSpace.index);
});

test('Edge Case §5.4: If all matching spaces ahead are occupied or none exist, pirate goes to Boat', () => {
  const engine = new CartagenaEngine({ seed: 404 });
  const p1 = engine.addPlayer({ id: 'p1' });
  engine.addPlayer({ id: 'p2' });
  engine.start();

  const sym = SYMBOLS[1];
  // Fill all spaces with sym with 1 pirate (occupied)
  for (let i = 1; i <= 36; i++) {
    if (engine.board[i].symbol === sym) {
      engine.board[i].pirates = ['fake_1'];
    }
  }

  p1.hand = [{ id: 'card_boat_test', symbol: sym }];
  const pirate = p1.pirates[0];

  const target = engine.getValidForwardTarget(pirate, sym);
  assert.equal(target, BOAT_INDEX, 'Should target the Boat (37)');

  engine.playForward({ playerId: 'p1', pirateId: pirate.id, cardId: 'card_boat_test' });
  assert.equal(pirate.position, BOAT_INDEX);
  assert.equal(engine.board[BOAT_INDEX].pirates.includes(pirate.id), true);
});

test('Edge Case §5.4: Pirate on the Boat cannot be selected for any action', () => {
  const engine = new CartagenaEngine({ seed: 505 });
  const p1 = engine.addPlayer({ id: 'p1' });
  engine.addPlayer({ id: 'p2' });
  engine.start();

  const pirate = p1.pirates[0];
  pirate.position = BOAT_INDEX;
  engine.board[BOAT_INDEX].pirates.push(pirate.id);

  p1.hand = [{ id: 'c1', symbol: SYMBOLS[0] }];

  assert.throws(() => {
    engine.playForward({ playerId: 'p1', pirateId: pirate.id, cardId: 'c1' });
  }, /boat/i);

  assert.throws(() => {
    engine.moveBackward({ playerId: 'p1', pirateId: pirate.id });
  }, /boat/i);
});

test('Action B - Move Backward: moves backward to nearest space with 1 or 2 pirates and draws cards', () => {
  const engine = new CartagenaEngine({ seed: 606 });
  const p1 = engine.addPlayer({ id: 'p1' });
  engine.addPlayer({ id: 'p2' });
  engine.start();

  // Set up: Pirate at space 10. Space 5 has 2 pirates. Space 7 is empty. Space 3 has 3 pirates.
  const pirate = p1.pirates[0];
  pirate.position = 10;
  engine.board[10].pirates.push(pirate.id);

  engine.board[5].pirates = ['other_1', 'other_2'];
  engine.board[7].pirates = []; // empty, should be skipped
  engine.board[3].pirates = ['f1', 'f2', 'f3']; // 3 pirates, should be skipped

  const initialHandSize = p1.hand.length;
  const target = engine.getValidBackwardTarget(pirate);
  assert.equal(target, 5);

  const res = engine.moveBackward({ playerId: 'p1', pirateId: pirate.id });
  assert.equal(res.success, true);
  assert.equal(pirate.position, 5);
  // Drew 2 cards because space 5 had 2 pirates
  assert.equal(p1.hand.length, initialHandSize + 2);
});

test('Edge Case §5.4: Backward move when draw pile is empty reshuffles discard pile', () => {
  const engine = new CartagenaEngine({ seed: 707 });
  const p1 = engine.addPlayer({ id: 'p1' });
  engine.addPlayer({ id: 'p2' });
  engine.start();

  const pirate = p1.pirates[0];
  pirate.position = 15;
  engine.board[15].pirates.push(pirate.id);

  engine.board[10].pirates = ['p_a']; // 1 pirate -> should draw 1 card

  // Empty the draw pile, add 3 cards to discard pile
  engine.drawPile = [];
  engine.discardPile = [
    { id: 'disc_1', symbol: 'KEY' },
    { id: 'disc_2', symbol: 'HAT' },
    { id: 'disc_3', symbol: 'SKULL' }
  ];

  const prevHandCount = p1.hand.length;
  engine.moveBackward({ playerId: 'p1', pirateId: pirate.id });

  assert.equal(p1.hand.length, prevHandCount + 1);
  assert.equal(engine.discardPile.length, 0); // Discard pile was reshuffled
  assert.equal(engine.drawPile.length, 2); // 3 - 1 = 2 remaining
});

test('Edge Case §5.4: Action limit enforced (max 3 actions per turn)', () => {
  const engine = new CartagenaEngine({ seed: 808 });
  const p1 = engine.addPlayer({ id: 'p1' });
  engine.addPlayer({ id: 'p2' });
  engine.start();

  engine.actionsLeft = 0;
  p1.hand = [{ id: 'extra_c', symbol: SYMBOLS[0] }];

  assert.throws(() => {
    engine.playForward({ playerId: 'p1', pirateId: p1.pirates[0].id, cardId: 'extra_c' });
  }, /ACTION_LIMIT_REACHED/);
});

test('Turn End: Refills hand up to 6 cards if held fewer than 6, passes to next player', () => {
  const engine = new CartagenaEngine({ seed: 909 });
  const p1 = engine.addPlayer({ id: 'p1' });
  const p2 = engine.addPlayer({ id: 'p2' });
  engine.start();

  // Reduce p1's hand to 3 cards
  p1.hand = p1.hand.slice(0, 3);
  assert.equal(p1.hand.length, 3);

  const res = engine.endTurn('p1');
  assert.equal(res.success, true);
  assert.equal(p1.hand.length, 6, 'Hand must be refilled up to 6');
  assert.equal(engine.getCurrentPlayer().id, 'p2');
  assert.equal(engine.actionsLeft, ACTIONS_PER_TURN);
});

test('Win Condition & Rankings: First player to get all pirates on Boat wins immediately', () => {
  const engine = new CartagenaEngine({ seed: 111, quickGame: true }); // 4 pirates
  const p1 = engine.addPlayer({ id: 'p1' });
  const p2 = engine.addPlayer({ id: 'p2' });
  engine.start();

  // Put 3 pirates of p1 on boat, 1 pirate at space 35
  p1.pirates[0].position = BOAT_INDEX;
  p1.pirates[1].position = BOAT_INDEX;
  p1.pirates[2].position = BOAT_INDEX;
  p1.pirates[3].position = 35;
  engine.board[BOAT_INDEX].pirates.push(p1.pirates[0].id, p1.pirates[1].id, p1.pirates[2].id);
  engine.board[35].pirates.push(p1.pirates[3].id);

  // Give p1 a card whose symbol has no matching space between 35 and 36 -> will hop to Boat!
  const lastSpaceSymbol = engine.board[36].symbol;
  // Pick any symbol that is NOT space 36
  const freeSym = SYMBOLS.find(s => s !== lastSpaceSymbol);
  p1.hand = [{ id: 'winning_card', symbol: freeSym }];

  const res = engine.playForward({
    playerId: 'p1',
    pirateId: p1.pirates[3].id,
    cardId: 'winning_card'
  });

  assert.equal(res.won, true);
  assert.equal(engine.status, 'FINISHED');
  assert.equal(engine.winnerId, 'p1');
  assert.equal(engine.rankings[0].id, 'p1');
  assert.equal(engine.rankings[0].rank, 1);
});

test('Privacy projection: getStateView() only exposes hand of requesting player', () => {
  const engine = new CartagenaEngine({ seed: 1234 });
  engine.addPlayer({ id: 'p1', name: 'Alice' });
  engine.addPlayer({ id: 'p2', name: 'Bob' });
  engine.start();

  const aliceView = engine.getStateView('p1');
  const bobInAliceView = aliceView.players.find(p => p.id === 'p2');
  const aliceInAliceView = aliceView.players.find(p => p.id === 'p1');

  assert.ok(aliceInAliceView.hand !== undefined);
  assert.equal(aliceInAliceView.hand.length, 6);
  assert.equal(bobInAliceView.hand, undefined, 'Bob hand MUST be undefined to Alice');
  assert.equal(bobInAliceView.cardCount, 6, 'Alice only sees Bob card count');

  const publicSpectatorView = engine.getStateView(null);
  assert.equal(publicSpectatorView.players[0].hand, undefined);
  assert.equal(publicSpectatorView.players[1].hand, undefined);
});
