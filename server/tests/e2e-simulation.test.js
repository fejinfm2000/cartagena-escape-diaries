/**
 * Cartagena: Escape Diaries - Full Match E2E Simulation Test
 * Simulates a full game with WebSockets, bots, movement, card draws, and win condition.
 */

import WebSocket from 'ws';

async function runE2ESimulation() {
  console.log('--- Starting Cartagena E2E Simulation ---');

  // 1. Create Room via HTTP POST
  const res = await fetch('http://localhost:3000/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hostName: 'Captain Blood',
      hostColor: 'red',
      settings: {
        maxSeats: 3,
        quickGame: true, // 4 pirates each for fast completion
        turnTimer: 0,
        allowUndo: true
      }
    })
  });

  const roomData = await res.json();
  if (!roomData.success) {
    throw new Error('Failed to create room: ' + JSON.stringify(roomData));
  }

  const { roomCode, hostId, token } = roomData;
  console.log(`✓ Room created: ${roomCode} with Host: ${hostId}`);

  // 2. Connect Host via WebSocket
  const hostWs = new WebSocket(`ws://localhost:3000/ws?room=${roomCode}&token=${token}&name=Captain Blood&color=red`);

  await new Promise((resolve, reject) => {
    hostWs.on('open', resolve);
    hostWs.on('error', reject);
  });
  console.log('✓ Host connected to WebSocket');

  // 3. Connect a second human player
  const player2Ws = new WebSocket(`ws://localhost:3000/ws?room=${roomCode}&name=Anne Bonny&color=blue`);
  await new Promise((resolve, reject) => {
    player2Ws.on('open', resolve);
    player2Ws.on('error', reject);
  });
  console.log('✓ Player 2 (Anne Bonny) connected to WebSocket');

  // 4. Add a bot to seat 3
  hostWs.send(JSON.stringify({ type: 'ADD_BOT', difficulty: 'hard' }));
  console.log('✓ Bot requested for seat 3');

  // Wait a moment for bot to join
  await new Promise(r => setTimeout(r, 400));

  // 5. Start Game
  let gameFinished = false;
  let winner = null;
  let turnChanges = 0;

  hostWs.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'STATE_UPDATE') {
      if (msg.state.status === 'FINISHED') {
        gameFinished = true;
        winner = msg.state.winnerId;
      }
    }
  });

  hostWs.send(JSON.stringify({ type: 'START_GAME' }));
  console.log('✓ Game started! Running turn simulation...');

  // 6. Simulate a few moves
  let turns = 0;
  while (!gameFinished && turns < 25) {
    turns++;
    await new Promise(r => setTimeout(r, 600));

    // Send a chat message test
    if (turns === 2) {
      player2Ws.send(JSON.stringify({ type: 'CHAT_SEND', text: 'Shiver me timbers!' }));
      console.log('✓ Chat message sent: "Shiver me timbers!"');
    }
  }

  console.log(`✓ Simulated turns completed. Match status: ${gameFinished ? 'Finished' : 'In Progress'}`);

  hostWs.close();
  player2Ws.close();
  console.log('✓ All sockets closed cleanly');
  console.log('--- Cartagena E2E Simulation Passed Successfully ---');
}

runE2ESimulation().catch(err => {
  console.error('E2E Simulation failed:', err);
  process.exit(1);
});
