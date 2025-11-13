const express = require('express');
const WebSocket = require('ws');
const crypto = require('crypto');

const app = express();
app.use(express.json()); // Izinkan n8n (atau Vercel) baca JSON

// --- Kredensial lu ---
const APP_ID = '9270470619';
const ACCESS_TOKEN = 'QdVehDR-O8UFkx7A4j-ObwWObE7TkQJD';
const SECRET_KEY = 't5ZtH_4uC5ktf7MgjPEBSq0Axkn0NygU';
// --------------------

// Ini adalah endpoint yang bakal dipanggil n8n
app.post('/api/tts', (req, res) => {
  const { text, uid } = req.body;

  if (!text || !uid) {
    return res.status(400).json({ error: 'Missing text or uid' });
  }

  // 1. Bikin Signature (kunci rahasia)
  const timestampSec = Math.floor(Date.now() / 1000).toString();
  const signString = `appid=${APP_ID}&timestamp=${timestampSec}`;
  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(signString)
    .digest('hex');

  // 2. Bikin Auth Header (INI FORMAT YANG BENER, TANPA "Bearer")
  const authHeader = `t=${timestampSec};a=${APP_ID};s=${signature}`;

  // 3. Siapin koneksi WebSocket ke BytePlus
  const wsUrl = 'wss://openspeech.bytedance.com/api/v1/tts/ws_binary';
  const ws = new WebSocket(wsUrl, {
    headers: {
      'Authorization': authHeader
    }
  });

  let audioChunks = []; // Buat nampung potongan audio

  // 4. Kalo WebSocket berhasil konek
  ws.on('open', () => {
    console.log('WebSocket connected. Sending payload...');
    // Kirim JSON request ke BytePlus
    const payload = {
      app: {
        appid: APP_ID,
        token: ACCESS_TOKEN,
        cluster: 'volcano_tts'
      },
      user: {
        uid: uid.toString() // Pastiin UID itu string
      },
      audio: {
        voice: 'BV700_V2_streaming',
        encoding: 'mp3',
        speed_ratio: 1.0,
        volume_ratio: 1.2
      },
      request: {
        reqid: `n8n-${Date.now()}`,
        text: text,
        text_type: 'plain',
        operation: 'query'
      }
    };
    ws.send(JSON.stringify(payload));
  });

  // 5. Kalo BytePlus ngirim balik data audio
  ws.on('message', (data) => {
    if (Buffer.isBuffer(data)) {
      audioChunks.push(data); // Kumpulin potongan audio
    } else {
      console.log('Received text message:', data.toString());
    }
  });

  // 6. Kalo koneksi putus (artinya audio selesai)
  ws.on('close', () => {
    console.log('WebSocket closed. Sending audio back to n8n.');
    if (audioChunks.length > 0) {
      // Gabungin semua potongan audio
      const finalAudioBuffer = Buffer.concat(audioChunks);
      // Kirim balik ke n8n sebagai base64
      res.json({
        audio_base64: finalAudioBuffer.toString('base64')
      });
    } else {
      res.status(500).json({ error: 'No audio data received' });
    }
  });

  // Kalo ada error
  ws.on('error', (err) => {
    console.error('WebSocket Error:', err.message);
    res.status(500).json({ error: 'WebSocket connection error' });
  });
});

// --- INI BLOK YANG HILANG (GARA2 GUE) ---
// Ini buat "NYALAIN" servernya
const PORT = 3000; // PAKSA JALAN DI PORT 3000
app.listen(PORT, () => {
  console.log(`TTS Proxy server running on port ${PORT}`);
});
// ----------------------------------------