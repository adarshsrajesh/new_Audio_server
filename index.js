const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// TODO: In production, replace "*" with your frontend domain
// Example: origin: "https://yourdomain.com"
const io = new Server(server, {
  cors: {
    origin: "https://audio-chat-rho.vercel.app",
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
    try {
      if (!username || typeof username !== "string") {
        socket.emit("error", "Invalid username");
        return;
      }

      socket.username = username;
      onlineUsers[username] = socket.id;
      console.log(`👤 ${username} logged in`);
      broadcastOnlineUsers();
    } catch (error) {
      console.error("Login error:", error);
      socket.emit("error", "Login failed");
    }
  });

  socket.on("call-user", ({ toUserId, offer }) => {
    try {
      if (!toUserId || !offer) {
        socket.emit("error", "Invalid call data");
        return;
      }

      const targetSocketId = onlineUsers[toUserId];
      if (targetSocketId) {
        io.to(targetSocketId).emit("incoming-call", {
          fromUserId: socket.username,
          offer,
        });
      }
    } catch (error) {
      console.error("Call error:", error);
      socket.emit("error", "Call failed");
    }
  });

  socket.on("answer-call", ({ toUserId, answer }) => {
    try {
      if (!toUserId || !answer) {
        socket.emit("error", "Invalid answer data");
        return;
      }

      const targetSocketId = onlineUsers[toUserId];
      if (targetSocketId) {
        io.to(targetSocketId).emit("call-answered", {
          fromUserId: socket.username,
          answer,
        });
      }
    } catch (error) {
      console.error("Answer error:", error);
      socket.emit("error", "Answer failed");
    }
  });

  socket.on("reject-call", ({ toUserId }) => {
    try {
      if (!toUserId) {
        socket.emit("error", "Invalid user ID");
        return;
      }

      const targetSocketId = onlineUsers[toUserId];
      if (targetSocketId) {
        io.to(targetSocketId).emit("call-rejected", {
          fromUserId: socket.username
        });
      }
    } catch (error) {
      console.error("Reject error:", error);
      socket.emit("error", "Reject failed");
    }
  });

  socket.on("ice-candidate", ({ toUserId, candidate }) => {
    try {
      if (!toUserId || !candidate) {
        socket.emit("error", "Invalid ICE candidate data");
        return;
      }

      const targetSocketId = onlineUsers[toUserId];
      if (targetSocketId) {
        io.to(targetSocketId).emit("ice-candidate", {
          fromUserId: socket.username,
          candidate,
        });
      }
    } catch (error) {
      console.error("ICE candidate error:", error);
      socket.emit("error", "ICE candidate failed");
    }
  });

  socket.on("join-call", ({ joiningUserId }) => {
    try {
      if (!joiningUserId) {
        socket.emit("error", "Invalid user ID");
        return;
      }

      const invitedSocketId = onlineUsers[joiningUserId];
      if (invitedSocketId) {
        io.to(invitedSocketId).emit("incoming-invite", {
          fromUserId: socket.username
        });
      }
    } catch (error) {
      console.error("Join call error:", error);
      socket.emit("error", "Join call failed");
    }
  });

  socket.on("accept-invite", ({ fromUserId }) => {
    try {
      if (!fromUserId) {
        socket.emit("error", "Invalid user ID");
        return;
      }

      const inviterSocketId = onlineUsers[fromUserId];
      if (inviterSocketId) {
        io.to(inviterSocketId).emit("invite-accepted", {
          fromUserId: socket.username
        });
      }
    } catch (error) {
      console.error("Accept invite error:", error);
      socket.emit("error", "Accept invite failed");
    }
  });

  socket.on("reject-invite", ({ fromUserId }) => {
    try {
      if (!fromUserId) {
        socket.emit("error", "Invalid user ID");
        return;
      }

      const inviterSocketId = onlineUsers[fromUserId];
      if (inviterSocketId) {
        io.to(inviterSocketId).emit("invite-rejected", {
          fromUserId: socket.username
        });
      }
    } catch (error) {
      console.error("Reject invite error:", error);
      socket.emit("error", "Reject invite failed");
    }
  });

  socket.on("disconnect", () => {
    try {
      if (socket.username) {
        delete onlineUsers[socket.username];
        console.log(`❌ ${socket.username} disconnected`);
        broadcastOnlineUsers();
      }
    } catch (error) {
      console.error("Disconnect error:", error);
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Signaling server running at http://192.168.137.69:${PORT}`);
});
