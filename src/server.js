const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 3000;

class Game {
  constructor({ id, title, description = '' }) {
    this.id = id;
    this.title = title;
    this.description = description;
  }
}

class Participant {
  constructor({ id, name }) {
    this.id = id;
    this.name = name;
  }
}

class Vote {
  constructor({ id, roomId, participantId, gameId, value }) {
    this.id = id;
    this.roomId = roomId;
    this.participantId = participantId;
    this.gameId = gameId;
    this.value = value;
  }
}

class Room {
  constructor({
    id,
    joinCode,
    games = [],
    participants = [],
    votes = [],
    hostId = null,
    selectedGameId = null,
  }) {
    this.id = id;
    this.joinCode = joinCode;
    this.games = games;
    this.participants = participants;
    this.votes = votes;
    this.hostId = hostId;
    this.selectedGameId = selectedGameId;
  }

  getGameList() {
    return [...this.games];
  }

  getVoteState() {
    return this.games.reduce((accumulator, game) => {
      const tallies = this.votes
        .filter((vote) => vote.gameId === game.id)
        .reduce(
          (counts, vote) => {
            if (vote.value === 'positive') counts.positive += 1;
            if (vote.value === 'negative') counts.negative += 1;
            if (vote.value === 'random') counts.random += 1;
            return counts;
          },
          { positive: 0, negative: 0, random: 0 }
        );
      accumulator[game.id] = tallies;
      return accumulator;
    }, {});
  }
}

class InMemoryRepository {
  constructor() {
    this.roomsById = new Map();
    this.roomsByJoinCode = new Map();
  }

  createRoom({ games = [] } = {}) {
    const joinCode = this.generateUniqueJoinCode();
    const room = new Room({
      id: this.generateId(),
      joinCode,
      games: games.map((game) => new Game(game)),
    });
    this.roomsById.set(room.id, room);
    this.roomsByJoinCode.set(room.joinCode, room);
    return room;
  }

  getRoomByJoinCode(joinCode) {
    return this.roomsByJoinCode.get(joinCode) || null;
  }

  addParticipant(roomId, participant) {
    const room = this.roomsById.get(roomId);
    if (!room) return null;
    const newParticipant = new Participant(participant);
    room.participants.push(newParticipant);
    return newParticipant;
  }

  addGame(roomId, game) {
    const room = this.roomsById.get(roomId);
    if (!room) return null;
    const newGame = new Game(game);
    room.games.push(newGame);
    return newGame;
  }

  addVote(roomId, vote) {
    const room = this.roomsById.get(roomId);
    if (!room) return null;
    const newVote = new Vote({ ...vote, roomId });
    room.votes.push(newVote);
    return newVote;
  }

  generateUniqueJoinCode() {
    let joinCode = this.generateJoinCode();
    while (this.roomsByJoinCode.has(joinCode)) {
      joinCode = this.generateJoinCode();
    }
    return joinCode;
  }

  generateJoinCode() {
    return crypto.randomBytes(3).toString('hex').toUpperCase();
  }

  generateId() {
    return crypto.randomUUID();
  }
}

const repository = new InMemoryRepository();

const jsonResponse = (res, statusCode, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
};

const parseJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });

const getVoteCategory = (value) => (value === 'negative' ? 'negative' : 'positive');

const getVoteValue = (type) => {
  if (type === 'up') return 'positive';
  if (type === 'down') return 'negative';
  if (type === 'random_up') return 'random';
  return null;
};

const applyRandomVotes = (room) => {
  if (!room.games.length) return;
  const randomVotes = room.votes.filter((vote) => vote.value === 'random');
  if (!randomVotes.length) return;

  for (const vote of randomVotes) {
    const randomIndex = Math.floor(Math.random() * room.games.length);
    const randomGame = room.games[randomIndex];
    vote.gameId = randomGame.id;
    vote.value = 'positive';
  }
};

const selectGame = (room) => {
  applyRandomVotes(room);
  const voteState = room.getVoteState();
  const totalParticipants = room.participants.length;
  if (!room.games.length) return null;

  let majorityWinner = null;
  for (const game of room.games) {
    const positiveVotes = voteState[game.id]?.positive || 0;
    const negativeVotes = voteState[game.id]?.negative || 0;
    const netScore = positiveVotes - negativeVotes;
    if (positiveVotes > totalParticipants / 2 && netScore > 0) {
      majorityWinner = game;
      break;
    }
  }

  if (majorityWinner) return majorityWinner;

  let topScore = -Infinity;
  let topPositiveVotes = -Infinity;
  let topCandidates = [];
  for (const game of room.games) {
    const positiveVotes = voteState[game.id]?.positive || 0;
    const negativeVotes = voteState[game.id]?.negative || 0;
    const netScore = positiveVotes - negativeVotes;
    if (netScore > topScore) {
      topScore = netScore;
      topPositiveVotes = positiveVotes;
      topCandidates = [game];
      continue;
    }
    if (netScore === topScore) {
      if (positiveVotes > topPositiveVotes) {
        topPositiveVotes = positiveVotes;
        topCandidates = [game];
      } else if (positiveVotes === topPositiveVotes) {
        topCandidates.push(game);
      }
    }
  }

  if (!topCandidates.length) return null;
  const randomIndex = Math.floor(Math.random() * topCandidates.length);
  return topCandidates[randomIndex];
};

const publicDir = path.join(__dirname, '..', 'public');

const getContentType = (filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.html') return 'text/html';
  if (extension === '.css') return 'text/css';
  if (extension === '.js') return 'text/javascript';
  if (extension === '.json') return 'application/json';
  return 'application/octet-stream';
};

const serveStatic = (res, filePath, statusCode = 200) => {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      jsonResponse(res, 404, { error: 'Not Found' });
      return;
    }
    res.writeHead(statusCode, {
      'Content-Type': getContentType(filePath),
      'Content-Length': data.length,
    });
    res.end(data);
  });
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (req.method === 'GET') {
    const publicFile =
      pathname === '/styles.css' ||
      pathname === '/app.js' ||
      pathname.startsWith('/public/');
    if (publicFile) {
      const relativePath = pathname.startsWith('/public/')
        ? pathname.replace('/public/', '')
        : pathname.slice(1);
      const filePath = path.join(publicDir, relativePath);
      serveStatic(res, filePath);
      return;
    }

    if (pathname === '/app' || pathname === '/room') {
      serveStatic(res, path.join(publicDir, 'index.html'));
      return;
    }

    const roomPageMatch = pathname.match(/^\/room\/([A-F0-9]+)$/i);
    if (roomPageMatch) {
      serveStatic(res, path.join(publicDir, 'index.html'));
      return;
    }
  }

  if (req.url === '/' && req.method === 'GET') {
    const payload = {
      message: 'Gamechooser API is running',
      status: 'ok',
    };

    jsonResponse(res, 200, payload);
    return;
  }

  if (pathname === '/rooms' && req.method === 'POST') {
    parseJsonBody(req)
      .then((body) => {
        const games = Array.isArray(body.games) ? body.games : [];
        const room = repository.createRoom({ games });
        const hostParticipant = repository.addParticipant(room.id, {
          id: repository.generateId(),
          name: body.hostName || 'Host',
        });
        room.hostId = hostParticipant.id;
        jsonResponse(res, 201, {
          roomId: room.id,
          joinCode: room.joinCode,
          hostId: room.hostId,
          games: room.getGameList(),
        });
      })
      .catch(() => jsonResponse(res, 400, { error: 'Invalid JSON body' }));
    return;
  }

  if (pathname === '/rooms/join' && req.method === 'POST') {
    parseJsonBody(req)
      .then((body) => {
        const joinCode = String(body.joinCode || '').toUpperCase();
        if (!joinCode) {
          jsonResponse(res, 400, { error: 'Join code is required' });
          return;
        }
        const room = repository.getRoomByJoinCode(joinCode);
        if (!room) {
          jsonResponse(res, 404, { error: 'Room not found' });
          return;
        }
        const name = body.name || 'Player';
        const participant = repository.addParticipant(room.id, {
          id: repository.generateId(),
          name,
        });
        jsonResponse(res, 200, {
          roomId: room.id,
          joinCode: room.joinCode,
          participant,
        });
      })
      .catch(() => jsonResponse(res, 400, { error: 'Invalid JSON body' }));
    return;
  }

  const roomMatch = pathname.match(/^\/rooms\/([A-F0-9]+)(?:\/(.*))?$/i);
  if (roomMatch) {
    const joinCode = roomMatch[1].toUpperCase();
    const action = roomMatch[2] || '';
    const room = repository.getRoomByJoinCode(joinCode);

    if (!room) {
      jsonResponse(res, 404, { error: 'Room not found' });
      return;
    }

    if (action === '' && req.method === 'GET') {
      jsonResponse(res, 200, {
        roomId: room.id,
        joinCode: room.joinCode,
        hostId: room.hostId,
        games: room.getGameList(),
        participants: room.participants,
        votes: room.getVoteState(),
        selectedGameId: room.selectedGameId,
      });
      return;
    }

    if (action === 'games' && req.method === 'GET') {
      jsonResponse(res, 200, {
        roomId: room.id,
        joinCode: room.joinCode,
        games: room.getGameList(),
      });
      return;
    }

    if (action === 'participants' && req.method === 'POST') {
      parseJsonBody(req)
        .then((body) => {
          if (!body.name) {
            jsonResponse(res, 400, { error: 'Participant name is required' });
            return;
          }
          const participant = repository.addParticipant(room.id, {
            id: repository.generateId(),
            name: body.name,
          });
          jsonResponse(res, 201, participant);
        })
        .catch(() => jsonResponse(res, 400, { error: 'Invalid JSON body' }));
      return;
    }

    if (action === 'games' && req.method === 'POST') {
      parseJsonBody(req)
        .then((body) => {
          if (!body.title) {
            jsonResponse(res, 400, { error: 'Game title is required' });
            return;
          }
          const game = repository.addGame(room.id, {
            id: repository.generateId(),
            title: body.title,
            description: body.description || '',
          });
          jsonResponse(res, 201, game);
        })
        .catch(() => jsonResponse(res, 400, { error: 'Invalid JSON body' }));
      return;
    }

    if (action === 'vote' && req.method === 'POST') {
      parseJsonBody(req)
        .then((body) => {
          const voteValue = getVoteValue(body.type);
          if (!body.participantId || !body.gameId || !voteValue) {
            jsonResponse(res, 400, {
              error: 'participantId, gameId, and vote type are required',
            });
            return;
          }

          const participant = room.participants.find(
            (item) => item.id === body.participantId
          );
          const game = room.games.find((item) => item.id === body.gameId);
          if (!participant || !game) {
            jsonResponse(res, 404, { error: 'Participant or game not found' });
            return;
          }

          const category = getVoteCategory(voteValue);
          room.votes = room.votes.filter((vote) => {
            if (vote.participantId !== body.participantId) return true;
            return getVoteCategory(vote.value) !== category;
          });

          const vote = repository.addVote(room.id, {
            id: repository.generateId(),
            participantId: body.participantId,
            gameId: body.gameId,
            value: voteValue,
          });

          jsonResponse(res, 201, {
            vote,
            votes: room.getVoteState(),
          });
        })
        .catch(() => jsonResponse(res, 400, { error: 'Invalid JSON body' }));
      return;
    }

    if (action === 'start' && req.method === 'POST') {
      parseJsonBody(req)
        .then((body) => {
          if (!body.hostId || body.hostId !== room.hostId) {
            jsonResponse(res, 403, { error: 'Only the host can start choosing' });
            return;
          }
          const selectedGame = selectGame(room);
          if (!selectedGame) {
            jsonResponse(res, 400, { error: 'No games available to select' });
            return;
          }
          room.selectedGameId = selectedGame.id;
          jsonResponse(res, 200, {
            selectedGame,
            selectedGameId: room.selectedGameId,
            votes: room.getVoteState(),
          });
        })
        .catch(() => jsonResponse(res, 400, { error: 'Invalid JSON body' }));
      return;
    }
  }

  jsonResponse(res, 404, { error: 'Not Found' });
});

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
