const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// 部屋ごとのデータを管理するオブジェクト
// 例: { "合言葉1": { players: [...], wall: [...], discards: [...] } }
let rooms = {};

// 三人麻雀用の牌種
const tileTypes = ['1m', '9m', '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '1s', '9s', '東', '南', '西', '北', '白', '發', '中'];

function createDeck() {
    let deck = [];
    tileTypes.forEach(tile => {
        for (let i = 0; i < 4; i++) deck.push(tile);
    });
    return deck.sort(() => Math.random() - 0.5); // シャッフル
}

io.on('connection', (socket) => {
    let currentRoom = null;

    // 部屋に参加（合言葉の入力）
    socket.on('joinRoom', ({ roomId, playerName }) => {
        currentRoom = roomId;
        socket.join(roomId);

        // 部屋がまだ存在しなければ作成
        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [],
                discards: [],
                isStarted: false
            };
        }

        const room = rooms[roomId];

        // 3人未満ならプレイヤー追加（初期持ち点 35,000点）
        if (room.players.length < 3 && !room.players.some(p => p.id === socket.id)) {
            room.players.push({
                id: socket.id,
                name: playerName || `P${room.players.length + 1}`,
                score: 35000,
                hand: []
            });
        }

        // 部屋の中にいる全員に最新状況を通知
        io.to(roomId).emit('updateState', room);
    });

    // ゲーム開始（配牌）
    socket.on('startGame', () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];

        let deck = createDeck();

        // 参加者に13枚ずつ配牌 & 持ち点35,000点リセット
        room.players.forEach(player => {
            player.hand = deck.splice(0, 13);
            player.score = 35000;
        });

        room.discards = [];
        room.isStarted = true;

        io.to(currentRoom).emit('updateState', room);
    });

    // 打牌（牌を捨てる）
    socket.on('discard', (tileIndex) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];

        const player = room.players.find(p => p.id === socket.id);
        if (player && player.hand[tileIndex] !== undefined) {
            const discarded = player.hand.splice(tileIndex, 1)[0];
            room.discards.push({ playerName: player.name, tile: discarded });
            
            io.to(currentRoom).emit('updateState', room);
        }
    });

    // 切断時の処理
    socket.on('disconnect', () => {
        if (currentRoom && rooms[currentRoom]) {
            const room = rooms[currentRoom];
            room.players = room.players.filter(p => p.id !== socket.id);

            // 部屋に誰もいなくなったら削除
            if (room.players.length === 0) {
                delete rooms[currentRoom];
            } else {
                io.to(currentRoom).emit('updateState', room);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running: http://localhost:${PORT}`));
