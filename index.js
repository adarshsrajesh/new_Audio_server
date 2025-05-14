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

// Store online users
const onlineUsers = new Map();

function broadcastOnlineUsers() {
  io.emit("online-users", Array.from(onlineUsers.keys()));
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("login", (username) => {
    console.log("User logged in:", username);
    onlineUsers.set(username, socket.id);
    
    // Notify all users about the new user
    io.emit("user-joined", username);
    
    // Send current online users to the new user
    socket.emit("online-users", Array.from(onlineUsers.keys()));
  });

  socket.on("get-online-users", () => {
    socket.emit("online-users", Array.from(onlineUsers.keys()));
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    // Find and remove the disconnected user
    for (const [username, id] of onlineUsers.entries()) {
      if (id === socket.id) {
        onlineUsers.delete(username);
        // Notify all users about the user leaving
        io.emit("user-left", username);
        break;
      }
    }
  });

  socket.on("call-user", ({ toUserId, offer }) => {
    try {
      if (!toUserId || !offer) {
        socket.emit("error", "Invalid call data");
        return;
      }

      const targetSocketId = onlineUsers.get(toUserId);
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

      const targetSocketId = onlineUsers.get(toUserId);
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

      const targetSocketId = onlineUsers.get(toUserId);
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

      const targetSocketId = onlineUsers.get(toUserId);
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

      const invitedSocketId = onlineUsers.get(joiningUserId);
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

      const inviterSocketId = onlineUsers.get(fromUserId);
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

      const inviterSocketId = onlineUsers.get(fromUserId);
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

      const targetSocketId = onlineUsers.get(toUserId);
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
    const targetSocketId = onlineUsers.get(toUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit("participant-left", { leavingUserId });
    }
  });

  socket.on("dtmf-tone", ({ toUserId, digit }) => {
    const targetSocketId = onlineUsers.get(toUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit("dtmf-tone", { digit });
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Signaling server running at http://192.168.137.69:${PORT}`);
});
