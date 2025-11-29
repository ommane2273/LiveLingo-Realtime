// server.js
// Minimal changes: remove "two distinct languages" guard and fail-safe translation.
// Based on your original server file (backup recommended).

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fetch = require("node-fetch");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// serve your static files (adjust folder name if needed)
app.use(express.static(path.join(__dirname, "Public")));

// small language map (expand if needed)
const LANG_MAP = {
  "English": "en",
  "Hindi": "hi",
  "Marathi": "mr",
  "French": "fr",
  "Spanish": "es",
  "German": "de",
  // add more mappings if you need
};

// simple translate helper using MyMemory (public demo API)
// If targetCode is missing or unknown, the function simply returns original text.
async function translateText(text, sourceCode, targetCode) {
  if (!text) return "";
  if (!targetCode) return text;

  const src = sourceCode || "en";
  const tgt = targetCode;
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${src}|${tgt}`;
    const r = await fetch(url);
    const j = await r.json();
    return (j && j.responseData && j.responseData.translatedText) ? j.responseData.translatedText : text;
  } catch (err) {
    // let caller fallback
    throw err;
  }
}

let userALang = "English";
let userBLang = "English";

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // keep server copies of chosen languages (optional)
  socket.on("setLang", ({ user, lang }) => {
    if (user === "User A") userALang = lang || userALang;
    else if (user === "User B") userBLang = lang || userBLang;
    socket.broadcast.emit("lang-updated", { user, lang });
  });

  // chat message: tolerant — do not force two distinct languages
  socket.on("chat message", async (msg) => {
    try {
      // msg: { user, text, lang (source code or name), timestamp, (optional) targetLang }
      // determine source and target language names
      const sourceName = msg.lang || (msg.user === "User A" ? userALang : userBLang);
      const targetName = msg.targetLang || (msg.user === "User A" ? userBLang : userALang);

      const sourceCode = LANG_MAP[sourceName] || null;
      const targetCode = LANG_MAP[targetName] || null;

      let translatedText = msg.text; // default: return original text

      // attempt translation only if we have a valid target code and source != target
      if (targetCode && sourceCode !== targetCode) {
        try {
          translatedText = await translateText(msg.text, sourceCode, targetCode);
        } catch (tErr) {
          console.error("Translation API error:", tErr);
          translatedText = msg.text; // fallback to original
        }
      } else {
        // either no valid target or source==target -> keep original text (no error)
        translatedText = msg.text;
      }

      io.emit("chat message", { ...msg, translatedText });
    } catch (err) {
      console.error("chat message handler error:", err);
      io.emit("chat message", { ...msg, translatedText: msg.text });
    }
  });

  // speech transcripts: same tolerant behavior
  socket.on("speech", async (data) => {
    try {
      const sourceName = data.lang || (data.user === "User A" ? userALang : userBLang);
      const targetName = data.targetLang || (data.user === "User A" ? userBLang : userALang);

      const sourceCode = LANG_MAP[sourceName] || null;
      const targetCode = LANG_MAP[targetName] || null;

      let translatedText = data.text;

      if (targetCode && sourceCode !== targetCode) {
        try {
          translatedText = await translateText(data.text, sourceCode, targetCode);
        } catch (err) {
          console.error("Speech translation error:", err);
          translatedText = data.text;
        }
      } else {
        translatedText = data.text;
      }

      socket.broadcast.emit("speech", { ...data, translatedText });
    } catch (err) {
      console.error("speech handler error:", err);
      socket.broadcast.emit("speech", { ...data, translatedText: data.text });
    }
  });

  // WebRTC signaling passthrough
  socket.on("user-joined", () => socket.broadcast.emit("user-joined"));
  socket.on("offer", (d) => socket.broadcast.emit("offer", d));
  socket.on("answer", (d) => socket.broadcast.emit("answer", d));
  socket.on("candidate", (d) => socket.broadcast.emit("candidate", d));

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

const PORT = parseInt(process.env.PORT || "3000", 10);
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
