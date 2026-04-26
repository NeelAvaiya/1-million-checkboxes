import http from 'node:http';
import path from 'node:path';

import express from 'express';
import { Server } from 'socket.io';

import { publisher, redis, subscriber } from './redis-connection.js';

const CHECKBOX_SIZE = 100;
const CHECKBOX_STATE_KEY = 'checkbox-state'

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
        console.log(`Socket connected`, {id: socket.id});

        socket.on('client:checkbox:change', async (data) =>{
            console.log(`[Socket:${socket.id}]:client:checkbox:change`, data);

            const existingState = await redis.get(CHECKBOX_STATE_KEY);

            if(existingState){
                const remotedata = JSON.parse(existingState)
                remotedata[data.index] = data.checked
                await redis.set(CHECKBOX_STATE_KEY, JSON.stringify(remotedata))
            } else {
                redis.set(CHECKBOX_STATE_KEY, JSON.stringify(new Array(CHECKBOX_SIZE).fill(false)))
            }
        
        redis.set(CHECKBOX_STATE_KEY, JSON.stringify())
            await publisher.publish('internal-server:checkbox:change', JSON.stringify(data));
        })
    })

    //Express
    app.use(express.static(path.resolve('./public')));
    app.get('/health', (req, res) => res.json({healthy: true}));

    app.get('/checkboxes', async (req, res) =>{
        const existingState = await redis.get(CHECKBOX_STATE_KEY);
        if(existingState){
            const remotedata = JSON.parse(existingState);
            return  res.json({checkboxes: remotedata})
        }
       return res.json({checkboxes: new Array(CHECKBOX_SIZE).fill(false) })
    }) 

    server.listen(PORT, () => {
        console.log(`server is running on ${PORT}`)
    })
}

main();