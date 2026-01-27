const connectToMongo = require('./db')
connectToMongo();

const express = require('express')
const app = express()
const port = 3002

const cors = require('cors')
const http = require('http')
const socketIo = require('socket.io')
const router = require('./Routes/router')
const { addTranslation } = require('./translations')

app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:3001", 
    "https://phong-production-frontend.vercel.app",
    /\.vercel\.app$/
  ],
  credentials: true
}));
app.set('trust proxy', true);

app.use(express.json());
app.use(addTranslation); // Add translation middleware
app.use(router);

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://phong-production-frontend.vercel.app",
      /\.vercel\.app$/
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
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


