import http from 'node:http';

async function main() {
    const server = http.createServer()
    const PORT = process.env.PORT ?? 8000

    server.listen(PORT, () => {
        console.log(`server is running on ${PORT}`)
    })
}