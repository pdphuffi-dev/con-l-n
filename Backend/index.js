const connectToMongo = require('./db')
connectToMongo();

const express = require('express')
const app = express()
const port = 3001

const cors = require('cors')
const http = require('http')
const socketIo = require('socket.io')
const router = require('./Routes/router')

app.use(cors());
app.use(express.json());
app.use(router);

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Make io accessible from routes
app.set('io', io);

server.listen(port, () => {
  console.log(`Server listening on port ${port}`)
})


