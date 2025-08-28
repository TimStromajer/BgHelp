<script>
  import index from "$lib/index";
  import { onMount } from "svelte";

  let isRecording = $state(false);
  let errorMessage = $state("");
  let isListening = $state(false);
  let mediaRecorder;
  let requestDataInterval;
  let outputText = $state(index.getFinalText());
  let apiResponse = $state("");
  let isLoadingAPI = $state(false);

  onMount(() => {
    if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          mediaRecorder = new MediaRecorder(stream);
          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              if (index.getWSState() === WebSocket.OPEN) {
                console.log("Data available from MediaRecorder2");
                index.sendMessage(event.data);
              }
            }
          };
          mediaRecorder.onstop = () => {
            console.log("Voice recognition ended");
            index.sendMessage("");
            isListening = false;
          };
          mediaRecorder.onerror = (event) => {
            console.error("MediaRecorder error:", event.error);
            errorMessage = `Audio recording error: ${event.error.name}.`;
            isListening = false;
          };
          mediaRecorder.onstart = () => {
            console.log("MediaRecorder started");
            isListening = true;
            errorMessage = "";
          };
        })
        .catch((err) => {
          console.error("Error accessing microphone:", err);
          errorMessage =
            "Error accessing microphone. Please allow access and reload the page.";
        });
    } else {
      errorMessage = "Web Speech API is not supported in this browser. Please use Chrome.";
      console.error(errorMessage);
    }
  });

  function toggleRecording() {
    if (isRecording) {
      // User explicitly presses to Stop listening
      console.log("User pressed stop button.");
      clearInterval(requestDataInterval);
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop(); // This will trigger mediaRecorder.onstop
      }
      isRecording = false; // Set immediately for UI feedback
    } else {
      index.createWebSocket();

      // Start listening
      console.log("User pressed start button.");
      errorMessage = "";
      isRecording = true; // Set immediately for UI feedback

      if (mediaRecorder && mediaRecorder.state === "inactive") {
        mediaRecorder.start();
      }

      //Manually request data every 500ms
      requestDataInterval = setInterval(() => {
        if (
          mediaRecorder?.state === "recording" &&
          index.getWSState() === WebSocket.OPEN
        ) {
          mediaRecorder.requestData();
          outputText = index.getFinalText();
        }
      }, 500);

      const finalTextReadyInterval = setInterval(() => {
        if (index.isFinalTextReady()) {
          console.log("Final text is ready: ", index.getFinalText());
          outputText = index.getFinalText();
          clearInterval(finalTextReadyInterval); // stop polling when ready
          askQuestion(outputText); // Send the final text to the backend
        }
      }, 500); // check every 100ms
    }
  }

  // Function to send transcribed text to backend for processing/answering
  async function askQuestion(question) {
    errorMessage = "";
    isLoadingAPI = true;
    apiResponse = "Getting assistant response..."; // Immediate feedback

    try {
      // Ensure the question is not an object, but a string
      let questionString =
        typeof question === "object" && question !== null && question.text
          ? question.text
          : question;
      if (typeof questionString !== "string") {
        throw new Error(
          "Invalid question format provided to askQuestion. Expected string.",
        );
      }

      const url = `/api/main?question=${encodeURIComponent(questionString)}`; // Use the same endpoint, but different method
      const res = await fetch(url, { method: "GET" });

      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ message: res.statusText }));
        throw new Error(
          `Error ${res.status}: ${errorData.message || "Unknown error"}`,
        );
      }

      const data = await res.json();
      // Assuming your /api/main GET endpoint returns { message: "answer from assistant" }
      apiResponse = data;
      console.log("Answer from /api/main (question):", apiResponse);
    } catch (error) {
      console.error("Error in askQuestion:", error);
      errorMessage = `Failed to get assistant response: ${error.message}`;
      apiResponse = "Failed to get assistant response.";
    } finally {
      isLoadingAPI = false;
    }
  }

</script>

<div class="container">
  <h1>Board Game Assistant</h1>

  <button
      onclick={toggleRecording}
      class="listen-button"
      class:listening={isListening}
  >
      {#if isListening}
          Stop Listening
      {:else if isLoadingAPI}
          Processing...
      {:else}
          Start Listening
      {/if}
  </button>

  {#if errorMessage}
      <p class="error-message">{errorMessage}</p>
  {/if}

  {#if isListening && !errorMessage}
      <p class="status-message">Listening... Speak clearly!</p>
  {:else if isLoadingAPI}
      <p class="status-message loading-indicator">Getting response from assistant...</p>
  {/if}

  {#if outputText}
      <div class="section-content">
          <h2 class="section-title">You Said:</h2>
          <div class="user-text">
              <p>{outputText}</p>
          </div>
      </div>
  {/if}

  {#if apiResponse}
    <div class="section-content">
      <h2 class="section-title">Assistant Says:</h2>
      <div class="api-response">
        <p>{apiResponse}</p>
      </div>
    </div>
  {/if}
</div>

<style>
    :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        font-family: sans-serif;
        background-color: #f0f0f0;
        padding: 20px;
        box-sizing: border-box;
    }

    .container {
        margin-left: auto;
        margin-right: auto;
        background-color: white;
        padding: 2rem;
        border-radius: 8px;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
        text-align: center;
        width: 90%;
        max-width: 600px; /* Increased max-width for better content display */
        display: flex;
        flex-direction: column;
        gap: 1.5rem; /* Spacing between sections */
    }

    h1 {
        color: #333;
        margin-bottom: 0.5rem;
    }

    button {
        padding: 1rem 2rem;
        font-size: 1.2rem;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        transition: background-color 0.3s ease, transform 0.1s ease;
    }

    button:active {
        transform: translateY(1px);
    }

    .listen-button {
        background-color: #007bff;
        color: white;
    }

    .listen-button:hover {
        background-color: #0056b3;
    }

    .listening {
        background-color: #dc3545; /* Red when listening */
    }

    .listening:hover {
        background-color: #c82333;
    }

    button:disabled {
        background-color: #cccccc;
        cursor: not-allowed;
    }

    .status-message {
        font-size: 1rem;
        color: #666;
        min-height: 24px; /* Maintain space */
    }

    .loading-indicator {
        display: flex;
        align-items: center;
        justify-content: center;
        font-style: italic;
        color: #007bff;
    }
    .loading-indicator::before {
        content: ' ';
        display: inline-block;
        width: 1em;
        height: 1em;
        border: 2px solid currentColor;
        border-radius: 50%;
        border-right-color: transparent;
        animation: spin 1s linear infinite;
        margin-right: 0.5em;
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }

    .section-title {
        color: #555;
        font-size: 1.1rem;
        margin-bottom: 0.5rem;
        text-align: left;
    }

    .user-text, .api-response {
        padding: 1rem;
        border-radius: 5px;
        text-align: left;
        min-height: 50px;
        word-wrap: break-word;
        box-sizing: border-box;
    }

    .user-text {
        background-color: #e9ecef;
    }

    .api-response {
        background-color: #d4edda;
        color: #155724;
    }

    .error-message {
        color: #dc3545;
        font-weight: bold;
    }
</style>