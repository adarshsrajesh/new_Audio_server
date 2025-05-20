const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const twilio = require("twilio");
const dotenv = require("dotenv");

const app = express();
const server = http.createServer(app);
dotenv.config();

// Configure CORS
app.use(cors({
  origin: ['http://127.0.0.1:5501', 'http://localhost:5501', 'http://127.0.0.1:5500', 'http://localhost:5500'],
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

//TURN FROM TWILIO
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

app.get('/turn-credentials', async (req, res) => {
  try {
    const token = await client.tokens.create();
    console.log('TURN config:', token.iceServers);
    res.json({ iceServers: token.iceServers });
  } catch (error) {
    console.error('Error creating TURN token:', error);
    res.status(500).json({ error: 'Failed to get TURN credentials' });
  }
});

// Configure Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: ['http://127.0.0.1:5501', 'http://localhost:5501', 'http://127.0.0.1:5500', 'http://localhost:5500'],
    methods: ["GET", "POST"],
    credentials: true
  },
});

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

  socket.on("get-online-users", () => {
    try {
      console.log(`📋 Sending online users to ${socket.username}`);
      socket.emit("online-users", Object.keys(onlineUsers));
    } catch (error) {
      console.error("Get online users error:", error);
      socket.emit("error", "Failed to get online users");
    }
  });

  socket.on("call-user", ({ toUserId, offer }) => {
    try {
      if (!toUserId || !offer) {
        socket.emit("error", "Invalid call data");
        return;
      }

      const targetSocketId = onlineUsers[toUserId];
      if (!targetSocketId) {
        socket.emit("error", "User is not online");
        return;
      }

      // Check if the caller is online
      if (!socket.username || !onlineUsers[socket.username]) {
        socket.emit("error", "You must be logged in to make calls");
        return;
      }

      console.log(`📞 ${socket.username} calling ${toUserId}`);
      io.to(targetSocketId).emit("incoming-call", {
        fromUserId: socket.username,
        offer,
      });
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
      if (!targetSocketId) {
        socket.emit("error", "User is not online");
        return;
      }

      // Check if the answerer is online
      if (!socket.username || !onlineUsers[socket.username]) {
        socket.emit("error", "You must be logged in to answer calls");
        return;
      }

      console.log(`✅ ${socket.username} answered call from ${toUserId}`);
      io.to(targetSocketId).emit("call-answered", {
        fromUserId: socket.username,
        answer,
      });
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
      if (!targetSocketId) {
        socket.emit("error", "User is not online");
        return;
      }

      // Check if the rejecter is online
      if (!socket.username || !onlineUsers[socket.username]) {
        socket.emit("error", "You must be logged in to reject calls");
        return;
      }

      console.log(`❌ ${socket.username} rejected call from ${toUserId}`);
      io.to(targetSocketId).emit("call-rejected", {
        fromUserId: socket.username
      });
    } catch (error) {
      console.error("Reject error:", error);
      socket.emit("error", "Reject failed");
    }
  });

  socket.on("ice-candidate", ({ toUserId, candidate }) => {
    try {
      if (!toUserId || !candidate || !candidate.candidate) {
        console.error("Invalid ICE candidate data:", { toUserId, candidate });
        socket.emit("error", "Invalid ICE candidate data");
        return;
      }

      const targetSocketId = onlineUsers[toUserId];
      if (!targetSocketId) {
        console.error("Target user not found:", toUserId);
        socket.emit("error", "User is not online");
        return;
      }

      // Check if the sender is online
      if (!socket.username || !onlineUsers[socket.username]) {
        console.error("Sender not logged in:", socket.username);
        socket.emit("error", "You must be logged in to send ICE candidates");
        return;
      }

      console.log(`ICE candidate from ${socket.username} to ${toUserId}:`, candidate);
      io.to(targetSocketId).emit("ice-candidate", {
        fromUserId: socket.username,
        candidate: candidate
      });
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

  socket.on("new-participant-joined", ({ toUserId, newParticipant }) => {
    try {
      if (!toUserId || !newParticipant) {
        socket.emit("error", "Invalid participant data");
        return;
      }

      const targetSocketId = onlineUsers[toUserId];
      if (targetSocketId) {
        io.to(targetSocketId).emit("new-participant-joined", {
          newParticipant: newParticipant
        });
      }
    } catch (error) {
      console.error("New participant notification error:", error);
      socket.emit("error", "Failed to notify participants");
    }
  });

  socket.on("participant-left", ({ toUserId, leavingUserId }) => {
    const targetSocketId = onlineUsers[toUserId];
    if (targetSocketId) {
      io.to(targetSocketId).emit("participant-left", { leavingUserId });
    }
  });

  socket.on("dtmf-tone", ({ toUserId, digit }) => {
    const targetSocketId = onlineUsers[toUserId];
    if (targetSocketId) {
      io.to(targetSocketId).emit("dtmf-tone", { digit });
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
