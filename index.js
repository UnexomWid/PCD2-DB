import url from 'url';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import mysql from 'mysql2/promise';
import http from 'http';
import { Server } from 'socket.io';
import express from 'express';

import env from './env.js'

const app = express();

const PORT = 3004;

(async () => {
    const db = await mysql.createConnection({
        host: env.database.host,
        database: env.database.db,
        user: env.database.user,
        password: env.database.password 
    });

    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());

    app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Max-Age', '99999999');
        next();
    });

    app.use(express.static(path.join(path.dirname(url.fileURLToPath(import.meta.url)), 'public')))

    app.get('/stats', async (req, res) => {
        let result = {};
        const langs = ['RO', 'EN', 'FR', 'DE', 'ES'];

        for (const lang of langs) {
            try {
                const count = (await db.execute('SELECT COUNT(*) AS count FROM logs WHERE language=?', [lang]))[0][0].count;
                result[lang] = count;
            } catch (_) {
                result[lang] = '*';
            }
        }

        res.json(result);
    });

    app.get('/', (req, res) => {
        res.sendFile('index.html');
    });

    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: '*' } });

    var data = {};
    var rooms = [];

    io.on('connection', (socket) => {
        console.log('HENLO');

        socket.dataId = uuidv4();

        data[socket.dataId] = {
            state: 'connected'
        };

        socket.on('disconnect', () => {
            console.log('BYE');

            if (data[socket.dataId].room) {
                data[socket.dataId].state = 'disconnected';

                data[socket.dataId].room.socks.splice(data[socket.dataId].room.socks.indexOf(socket), 1);

                if (data[socket.dataId].room.socks.length === 0) {
                    // Last user left, delete the room
                    rooms.splice(rooms.indexOf(data[socket.dataId].room), 1);
                } else {
                    // Notify the other user that this one left
                    data[socket.dataId].room.socks[0].emit('left');
                    data[data[socket.dataId].room.socks[0].dataId].state = 'searching';
                }
            }
        });

        socket.on('setup', async (req) => {
            if (data[socket.dataId].state === 'connected') {
                // TODO: Sanitize
                data[socket.dataId].language = req.language;
                data[socket.dataId].name = req.name;

                data[socket.dataId].state = 'searching';

                try {
                    await db.execute('INSERT INTO logs(ip, language) VALUES(?, ?)', [socket.request.socket.remoteAddress, req.language]);
                } catch(ex) {
                    console.log(ex);
                }

                for (let room of rooms) {
                    if (room.socks.length === 1) {
                        room.socks.push(socket);

                        data[socket.dataId].state = 'chatting';
                        data[socket.dataId].room = room;

                        socket.emit('room', room.id);
                        room.socks[0].emit('joined', {
                            language: req.language,
                            name: req.name
                        });

                        data[room.socks[0].dataId].state = 'chatting';

                        socket.emit('joined', {
                            language: data[room.socks[0].dataId].language,
                            name: data[room.socks[0].dataId].name
                        });

                        return;
                    }
                }

                const room = {
                    id: uuidv4(),
                    socks: [socket]
                };

                data[socket.dataId].state = 'chatting';

                rooms.unshift(room);
                data[socket.dataId].room = room;

                socket.emit('room', room.id);
            }
        });

        socket.on('send', (req) => {
            if (data[socket.dataId].state === 'chatting') {
                const room = data[socket.dataId].room;

                if (room.socks.length < 2) {
                    return;
                }

                let receiver = room.socks[0];

                if (receiver === socket) {
                    receiver = room.socks[1];
                }

                receiver.emit('message', req);
            }
        });
    });

    server.listen(PORT, 'localhost');
})();