import http from 'node:http';
import path from 'node:path';

import express from 'express';
import { Server } from 'socket.io';

import { publisher, redis, subscriber } from './redis-connection.js';

const CHECKBOX_SIZE = 100;
const CHECKBOX_STATE_KEY = 'checkbox-state:v1';

const rateLimitingMap = new Map();

async function getCheckboxState() {
    const existingState = await redis.get(CHECKBOX_STATE_KEY);
    return existingState ? JSON.parse(existingState) : new Array(CHECKBOX_SIZE).fill(false);
}

async function main() {
    const PORT = process.env.PORT ?? 8000;

    const app = express();
    const server = http.createServer(app);

    const io = new Server();
    io.attach(server);

    await subscriber.subscribe('internal-server:checkbox:change')
    subscriber.on('message', (channel, message) =>{
        if(channel === 'internal-server:checkbox:change'){
            const {index, checked} = JSON.parse(message)
            io.emit('server:checkbox:change', {index, checked});
        }
    })

    //Socket IO Handler
    io.on('connection', (socket) => {
        //OIDC Authentication can be implemented here // user.sub?
        console.log(`Socket connected`, {id: socket.id});

        socket.on('client:checkbox:change', async (data) =>{
            console.log(`[Socket:${socket.id}]:client:checkbox:change`, data);

            const lastOperationTime = await redis.get(`rate-limit:${socket.id}`);
            if(lastOperationTime){
                const timeElapsed = Date.now() - parseInt(lastOperationTime);
                if( timeElapsed < 5.5 * 1000){
                    socket.emit('server:error', {error: 'Please wait'})
                    return
                }
            }
            await redis.set(`rate-limit:${socket.id}`, Date.now().toString());

            const checkboxes = await getCheckboxState();
            checkboxes[data.index] = data.checked;
            await redis.set(CHECKBOX_STATE_KEY, JSON.stringify(checkboxes));

            await publisher.publish('internal-server:checkbox:change', JSON.stringify(data));
        })
    })

    //Express
    app.use(express.static(path.resolve('./public')));
    app.get('/health', (req, res) => res.json({healthy: true}));

    app.get('/checkboxes', async (req, res) =>{
        const checkboxes = await getCheckboxState();
        return res.json({ checkboxes });
    }) 

    server.listen(PORT, () => {
        console.log(`server is running on ${PORT}`)
    })
}

main();