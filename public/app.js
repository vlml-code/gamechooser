const statusNode = document.getElementById('status');
const inviteWrap = document.getElementById('invite');
const inviteLink = document.getElementById('invite-link');
const createRoomForm = document.getElementById('create-room-form');
const joinRoomForm = document.getElementById('join-room-form');
const addGameForm = document.getElementById('add-game-form');
const gameList = document.getElementById('game-list');
const refreshButton = document.getElementById('refresh-button');

let activeRoom = null;
let participantId = null;

const updateStatus = (text) => {
  statusNode.textContent = text;
};

const showInvite = (joinCode) => {
  const url = new URL(`/room/${joinCode}`, window.location.origin);
  inviteLink.textContent = url.toString();
  inviteLink.href = url.toString();
  inviteWrap.classList.remove('hidden');
};

const parseGamesInput = (value) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length)
    .map((title, index) => ({ id: `seed-${index}`, title }));

const requestJson = async (path, options = {}) => {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error || 'Request failed';
    throw new Error(message);
  }
  return payload;
};

const setRoomState = ({ joinCode, roomId, participant }) => {
  activeRoom = { joinCode, roomId };
  participantId = participant?.id || participantId;
  updateStatus(`Connected to room ${joinCode}`);
  showInvite(joinCode);
  addGameForm.classList.remove('hidden');
  refreshRoom();
};

const renderGames = (room) => {
  gameList.innerHTML = '';
  if (!room.games.length) {
    gameList.innerHTML = '<p class="empty">No games yet.</p>';
    return;
  }

  room.games.forEach((game) => {
    const container = document.createElement('div');
    container.className = 'game-card';

    const heading = document.createElement('div');
    heading.className = 'game-title';
    heading.textContent = game.title;

    const voteState = room.votes?.[game.id] || { positive: 0, negative: 0, random: 0 };
    const tally = document.createElement('div');
    tally.className = 'vote-tally';
    tally.textContent = `👍 ${voteState.positive}  👎 ${voteState.negative}  🎲 ${voteState.random}`;

    const actions = document.createElement('div');
    actions.className = 'vote-actions';

    ['up', 'down', 'random_up'].forEach((type) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'vote-button';
      button.textContent = type === 'up' ? '👍 Vote' : type === 'down' ? '👎 Vote' : '🎲 Random';
      button.addEventListener('click', () => submitVote(game.id, type));
      actions.appendChild(button);
    });

    container.appendChild(heading);
    container.appendChild(tally);
    container.appendChild(actions);
    gameList.appendChild(container);
  });
};

const refreshRoom = async () => {
  if (!activeRoom) return;
  try {
    const room = await requestJson(`/rooms/${activeRoom.joinCode}`);
    renderGames(room);
  } catch (error) {
    updateStatus(error.message);
  }
};

const submitVote = async (gameId, type) => {
  if (!activeRoom || !participantId) {
    updateStatus('Join a room before voting.');
    return;
  }
  try {
    await requestJson(`/rooms/${activeRoom.joinCode}/vote`, {
      method: 'POST',
      body: JSON.stringify({ participantId, gameId, type }),
    });
    await refreshRoom();
  } catch (error) {
    updateStatus(error.message);
  }
};

createRoomForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(createRoomForm);
  const games = parseGamesInput(formData.get('games') || '');
  const hostName = formData.get('hostName');
  try {
    const room = await requestJson('/rooms', {
      method: 'POST',
      body: JSON.stringify({ hostName, games }),
    });
    setRoomState({
      joinCode: room.joinCode,
      roomId: room.roomId,
      participant: { id: room.hostId },
    });
  } catch (error) {
    updateStatus(error.message);
  }
});

joinRoomForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(joinRoomForm);
  const joinCode = String(formData.get('joinCode') || '').trim();
  const name = String(formData.get('name') || '').trim() || 'Player';
  if (!joinCode) {
    updateStatus('Enter a room code.');
    return;
  }
  try {
    const room = await requestJson('/rooms/join', {
      method: 'POST',
      body: JSON.stringify({ joinCode, name }),
    });
    setRoomState({ joinCode: room.joinCode, roomId: room.roomId, participant: room.participant });
  } catch (error) {
    updateStatus(error.message);
  }
});

addGameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!activeRoom) return;
  const formData = new FormData(addGameForm);
  const title = String(formData.get('title') || '').trim();
  if (!title) return;
  try {
    await requestJson(`/rooms/${activeRoom.joinCode}/games`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
    addGameForm.reset();
    await refreshRoom();
  } catch (error) {
    updateStatus(error.message);
  }
});

refreshButton.addEventListener('click', refreshRoom);

const boot = async () => {
  const pathParts = window.location.pathname.split('/');
  if (pathParts[1] === 'room' && pathParts[2]) {
    const joinCode = pathParts[2];
    joinRoomForm.querySelector('input[name="joinCode"]').value = joinCode;
    updateStatus(`Invite loaded for room ${joinCode}. Join to vote.`);
    showInvite(joinCode);
  }
};

boot();
