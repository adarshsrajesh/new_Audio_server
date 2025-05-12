const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://audio-chat-rho.vercel.app/",
     
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

const PORT = 5000;

// Track online users: { username: socketId }
const onlineUsers = {};

function broadcastOnlineUsers() {
  io.emit("online-users", Object.keys(onlineUsers));
}

io.on("connection", (socket) => {
  console.log(" New socket connected:", socket.id);

  socket.on("login", (username) => {
    if (!username) return;

    socket.username = username;
    onlineUsers[username] = socket.id;
    console.log(`👤 ${username} logged in`);
    broadcastOnlineUsers();
  });

  socket.on("call-user", ({ toUserId, offer }) => {
    const targetSocketId = onlineUsers[toUserId];
    if (targetSocketId) {
      io.to(targetSocketId).emit("incoming-call", {
        fromUserId: socket.username,
        offer,
      });
    }
  });

  socket.on("answer-call", ({ toUserId, answer }) => {
    const targetSocketId = onlineUsers[toUserId];
    if (targetSocketId) {
      io.to(targetSocketId).emit("call-answered", {
        fromUserId: socket.username,
        answer,
      });
    }
  });

  socket.on("ice-candidate", ({ toUserId, candidate }) => {
    const targetSocketId = onlineUsers[toUserId];
    if (targetSocketId) {
      io.to(targetSocketId).emit("ice-candidate", {
        fromUserId: socket.username,
        candidate,
      });
    }
  });

  // 🔄 Invite someone to join a conference call
  socket.on("join-call", ({ joiningUserId }) => {
    for (const [username, sockId] of Object.entries(onlineUsers)) {
      if (username !== joiningUserId) {
        io.to(sockId).emit("join-call", { joiningUserId });
      }
    }
  });

  socket.on("disconnect", () => {
    if (socket.username) {
      delete onlineUsers[socket.username];
      console.log(` ${socket.username} disconnected`);
      broadcastOnlineUsers();
    }
  });
});

server.listen(PORT, () => {
  console.log(` Signaling server running at http://localhost:${PORT}`);
});
