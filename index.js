const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // Change to your frontend domain in production
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
  console.log("✅ New socket connected:", socket.id);

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

  socket.on("reject-call", ({ toUserId }) => {
    const targetSocketId = onlineUsers[toUserId];
    if (targetSocketId) {
      io.to(targetSocketId).emit("call-rejected", {
        fromUserId: socket.username
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

  socket.on("join-call", ({ joiningUserId }) => {
    const invitedSocketId = onlineUsers[joiningUserId];
    if (invitedSocketId) {
      io.to(invitedSocketId).emit("incoming-invite", {
        fromUserId: socket.username
      });
    }
  });

  socket.on("accept-invite", ({ fromUserId }) => {
    const inviterSocketId = onlineUsers[fromUserId];
    if (inviterSocketId) {
      io.to(inviterSocketId).emit("invite-accepted", {
        fromUserId: socket.username
      });
    }
  });

  socket.on("reject-invite", ({ fromUserId }) => {
    const inviterSocketId = onlineUsers[fromUserId];
    if (inviterSocketId) {
      io.to(inviterSocketId).emit("invite-rejected", {
        fromUserId: socket.username
      });
    }
  });

  socket.on("disconnect", () => {
    if (socket.username) {
      delete onlineUsers[socket.username];
      console.log(`❌ ${socket.username} disconnected`);
      broadcastOnlineUsers();
    }
  });
});

server.listen(PORT,() => {
  console.log(`🚀 Signaling server running at http://192.168.137.69:${PORT}`);
});
