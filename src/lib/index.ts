let apiKey = ""
let ws = null;

// fetch the API key from the server
if (typeof window !== 'undefined') {
  fetch('/api/soniox').then(response => response.json()).then(data => {
    apiKey = data.key;
    console.log("Fetched API key from server.");
  }).catch(error => {
    console.error("Error fetching API key from server:", error);
  });
}

let finalText = "";
let finalTextReady = false;
const createWebSocket = () => {
  console.log("Creating WebSocket connection...");
  finalTextReady = false;
  finalText = "";

  ws = new WebSocket('wss://stt-rt.soniox.com/transcribe-websocket');

  ws.addEventListener('open', function (event) {
    console.log("It's open");
    ws.send(
      JSON.stringify({
        api_key: apiKey,
        audio_format: "auto", // server detects the format
        model: "stt-rt-preview",
        language_hints: ["sl", "en"],
      })
    );
  });


  // Listen for messages
  ws.addEventListener('message', function (event) {
    const res = JSON.parse(event.data);

    if (res.error_code) {
      console.log(`\nError: ${res.error_code} ${res.error_message}`);
      return;
    }

    let nonFinalText = "";

    for (const token of res.tokens || []) {
      if (token.text) {
        if (token.is_final) {
          finalText += token.text;
        } else {
          nonFinalText += token.text;
        }
      }
    }

    console.log("FINAL TEXT: ", finalText);
    console.log("NON-FINAL TEXT: ", nonFinalText);

    if (res.finished) {
      console.log("\nTranscription done.");
      finalTextReady = true;
    }
  });

  ws.addEventListener("close", () => { console.log("WebSocket connection closed."); });

  ws.addEventListener("error", (error) => {
    console.error("Connection error occurred:", error);
  });
}

const sendMessage = (message) => {
  if (ws.readyState <= 1) {
    ws.send(message);
  }
}

const getFinalText = () => {
  return finalText;
}

const getWSState = () => {
  if (ws) {
    return ws.readyState;
  }
}

const isFinalTextReady = () => {
  return finalTextReady;
}

export default {
  createWebSocket,
  sendMessage,
  getFinalText,
  isFinalTextReady,
  getWSState
}