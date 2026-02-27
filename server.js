const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const server = http.createServer(app);

app.use(express.static("public")); // For serving index.html if needed
app.set("view engine", "ejs"); // If you want to use EJS templates
app.set("views", "./views"); // Set views directory


const io = new Server(server, {
  cors: { origin: "*" }
});

// Store latest frame in memory
let latestFrames = {};   // { cameraId: Buffer }
let cameras = {};        // { cameraId: true }
let frameTimestamps = {}; // { cameraId: ISO string }

// ===============================
// 1️⃣ ESP32 uploads frames here
// ===============================
app.post("/upload/:cameraId", (req, res) => {
  const cameraId = req.params.cameraId;
  const base64 = req.body.frame;

  if (!base64) {
    return res.status(400).send("No frame");
  }

  const buffer = Buffer.from(base64, "base64");

  latestFrames[cameraId] = buffer;
  cameras[cameraId] = true;
  frameTimestamps[cameraId] = new Date().toISOString();

  // Notify dashboard that camera exists
  io.emit("camera-list", Object.keys(cameras));

  res.sendStatus(200);
});

// ===============================
// 2️⃣ Snapshot (Thumbnail)
// ===============================
app.get("/snapshot/:cameraId", (req, res) => {
  const cameraId = req.params.cameraId;
  const frame = latestFrames[cameraId];

  if (!frame) {
    return res.status(404).send("No frame available");
  }

  res.writeHead(200, {
    "Content-Type": "image/jpeg",
    "Cache-Control": "no-cache"
  });

  res.end(frame);
});

// ===============================
// 3️⃣ MJPEG Live Stream
// ===============================
app.get("/stream/:cameraId", (req, res) => {
  const cameraId = req.params.cameraId;

  res.writeHead(200, {
    "Content-Type": "multipart/x-mixed-replace; boundary=frame",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Pragma": "no-cache"
  });

  const interval = setInterval(() => {
    const frame = latestFrames[cameraId];
    if (!frame) return;

    res.write(`--frame\r\n`);
    res.write(`Content-Type: image/jpeg\r\n\r\n`);
    res.write(frame);
    res.write(`\r\n`);
  }, 100); // 10 FPS stream

  req.on("close", () => {
    clearInterval(interval);
  });
});

// ===============================
// 4️⃣ Socket.io (Camera List)
// ===============================
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.emit("camera-list", Object.keys(cameras));

  socket.on("get-cameras", () => {
    socket.emit("camera-list", Object.keys(cameras));
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// ===============================
// 5️⃣ Frame Timestamp
// ===============================
app.get("/timestamp/:cameraId", (req, res) => {
  const cameraId = req.params.cameraId;
  const ts = frameTimestamps[cameraId];
  if (!ts) {
    return res.status(404).json({ error: "No frame yet" });
  }
  res.json({ cameraId, timestamp: ts });
});

app.get('/', (req,res)=>{
    res.render("index")
})

// ===============================
server.listen(3000, "0.0.0.0", () => {
  console.log("Server running on port 3000");
});
