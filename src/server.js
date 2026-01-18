const http = require('http');
const crypto = require('crypto');

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
  constructor({ id, joinCode, games = [], participants = [], votes = [] }) {
    this.id = id;
    this.joinCode = joinCode;
    this.games = games;
    this.participants = participants;
    this.votes = votes;
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

const server = http.createServer((req, res) => {
  if (req.url === '/' && req.method === 'GET') {
    const payload = JSON.stringify({
      message: 'Gamechooser API is running',
      status: 'ok',
    });

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
    return;
  }

  res.writeHead(404, {
    'Content-Type': 'application/json',
  });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
