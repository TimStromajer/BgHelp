import { WebSocketServer, WebSocket } from 'ws';
import { createWebSocketStream } from 'ws';
import * as https from 'https';
import { SONIOX_API_KEY } from '$env/static/private';

// For creating the second WebSocket to Soniox
import WebSocketClient from 'ws';

const PORT = 3000;

if (!global._wss) {
  global._wss = new WebSocketServer({ port: PORT });
  console.log('WebSocket server started');
}
const wss = global._wss;

// const wss = new WebSocketServer({ port: PORT });

console.log(`WebSocket server listening on ws://localhost:${PORT}`);

// Replace with your actual Soniox API key
const SONIOX_WS_URL = 'wss://stt-rt.soniox.com/transcribe-websocket';

let finalText = "";
let finalTextReady = false;
let sonioxConntected = false;
wss.on('connection', (clientSocket: WebSocket) => {
  console.log('Client connected');

  let sonioxSocket: WebSocketClient | null = null;

  clientSocket.on('message', async (data: WebSocket.RawData) => {
    if (data.toString() === '<start>') {
      console.log('Starting Soniox stream');

      // Connect to Soniox
      sonioxSocket = new WebSocketClient(SONIOX_WS_URL, {
        headers: {
          Authorization: `Bearer ${SONIOX_API_KEY}`,
        },
      });

      sonioxSocket.on('open', () => {
        console.log('Connected to Soniox WebSocket');
        sonioxSocket.send(
          JSON.stringify({
            api_key: SONIOX_API_KEY,
            audio_format: "auto",
            model: "stt-rt-preview",
            language_hints: ["sl", "en"],
          })
        );
      });

      sonioxSocket.on('message', (sonioxData) => {
        const res = JSON.parse(sonioxData.toString());
        if (!sonioxConntected) {
          clientSocket.send(JSON.stringify({ type: "sonioxConntected", text: "true" }));
        }
        sonioxConntected = true

        if (res.error_code) {
          console.log(`\nError: ${res.error_code} ${res.error_message}`);
          return;
        }

        let nonFinalText = "";

        for (const token of res.tokens || []) {
          if (token.text) {
            if (token.is_final) {
              if (token.text == "<fin>") {
                sonioxSocket.close();
                sonioxSocket = null;
              } else {
                finalText += token.text;
              }
            } else {
              nonFinalText += token.text;
            }
          }
        }

        // console.log("FINAL TEXT: ", finalText);
        // console.log("NON-FINAL TEXT: ", nonFinalText);

        if (res.finished) {
          console.log("\nTranscription done.");
          finalTextReady = true;
        }

        // Send non-final text to client
        if (nonFinalText) {
          clientSocket.send(JSON.stringify({ type: "partial", text: nonFinalText }));
        }

      });

      sonioxSocket.on('error', (err) => {
        console.error('Soniox WebSocket error:', err);
        sonioxConntected = false; // Reset connection status
      });

      sonioxSocket.on('close', () => {
        console.log('Soniox WebSocket closed');
        sonioxConntected = false; // Reset connection status

        // Send final text to client
        if (finalText) {
          console.log("FINAL TEXT: ", finalText);
          clientSocket.send(JSON.stringify({ type: "final", text: finalText }));
          finalText = ""; // Reset after sending
        }
      });

    } else if (data.toString() === '<end>') {
      console.log('Stopping Soniox stream');
      finalText = "";

      if (sonioxSocket && sonioxSocket.readyState === WebSocketClient.OPEN) {
        sonioxSocket.send("{\"type\": \"finalize\"}");
      }

    } else {
      console.log('Sending audio data to Soniox', sonioxSocket?.readyState);
      // Assume it's audio blob
      if (sonioxSocket && sonioxSocket.readyState === WebSocketClient.OPEN) {
        sonioxSocket.send(data);
      }
    }
  });

  clientSocket.on('close', () => {
    console.log('Client disconnected');

    if (sonioxSocket && sonioxSocket.readyState === WebSocketClient.OPEN) {
      sonioxSocket.close();
    }
  });

  clientSocket.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});
