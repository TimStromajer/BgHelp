<script>
    import { onMount } from 'svelte';

    let isListening = false;
    let recognition;
    let audioChunks = [];
    let mediaRecorder;
    let userText = '';
    let apiResponse = '';
    let errorMessage = '';
    let isLoadingSTT = false; // New loading state for Speech-to-Text
    let isLoadingAPI = false; // New loading state for the second API call (askQuestion)
    let isProcessingSpeech = false; // New state to indicate processing of speech

    // This output variable is now mainly for the transcribed text that comes from the backend
    // after the audio is sent.
    // It will be the same as userText after successful transcription.
    let transcribedTextFromBackend = '';

    // Function to send audio to backend for Speech-to-Text
    async function speechToText(blob) {
        errorMessage = '';
        isLoadingSTT = true;
        userText = 'Transcribing audio...'; // Immediate feedback

        try {
            const form = new FormData();
            form.append('audio', blob, 'recording.webm');

            const res = await fetch('/api/main', {
                method: 'POST',
                body: form
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ message: res.statusText }));
                throw new Error(`Server error ${res.status}: ${errorData.message || 'Unknown error'}`);
            }

            const data = await res.json();
            // Assuming your /api/main POST endpoint returns { text: "transcribed text" }
            transcribedTextFromBackend = data;
            userText = transcribedTextFromBackend; // Update userText with the backend's transcription
            console.log('Output from /api/main (STT):', transcribedTextFromBackend);

            // Now, call the second API with the transcribed text
            if (transcribedTextFromBackend) {
                await askQuestion(transcribedTextFromBackend);
            } else {
                apiResponse = "No text was transcribed from your speech.";
            }

        } catch (error) {
            console.error('Error in speechToText:', error);
            errorMessage = `Failed to transcribe speech: ${error.message}`;
            userText = 'Transcription failed.';
        } finally {
            isLoadingSTT = false;
        }
    }

    // Function to send transcribed text to backend for processing/answering
    async function askQuestion(question) {
        errorMessage = '';
        isLoadingAPI = true;
        apiResponse = 'Getting assistant response...'; // Immediate feedback

        try {
            // Ensure the question is not an object, but a string
            let questionString = typeof question === 'object' && question !== null && question.text ? question.text : question;
            if (typeof questionString !== 'string') {
                throw new Error("Invalid question format provided to askQuestion. Expected string.");
            }

            const url = `/api/main?question=${encodeURIComponent(questionString)}`; // Use the same endpoint, but different method
            const res = await fetch(url, { method: 'GET' });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ message: res.statusText }));
                throw new Error(`Error ${res.status}: ${errorData.message || 'Unknown error'}`);
            }

            const data = await res.json();
            // Assuming your /api/main GET endpoint returns { message: "answer from assistant" }
            apiResponse = data;
            console.log('Answer from /api/main (question):', apiResponse);

        } catch (error) {
            console.error('Error in askQuestion:', error);
            errorMessage = `Failed to get assistant response: ${error.message}`;
            apiResponse = 'Failed to get assistant response.';
        } finally {
            isLoadingAPI = false;
        }
    }

    onMount(() => {
        if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
            recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
            recognition.continuous = true;
            recognition.interimResults = false;
            recognition.lang = 'en-US';

            recognition.onstart = () => {
                console.log('Voice recognition started');
                isListening = true;
                errorMessage = '';
                userText = ''; // Clear previous text when starting
                apiResponse = ''; // Clear previous response
                transcribedTextFromBackend = ''; // Clear backend transcription
            };

            recognition.onresult = (event) => {
                // This gives real-time feedback from the browser's STT
                // const transcript = event.results[0][0].transcript;
                // userText = transcript; // Show what the browser thinks it hears
                // console.log('Browser preliminary transcript:', userText);
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                errorMessage = `Speech recognition error: ${event.error}. Please try again.`;
                isListening = false; // Set to false to allow user to try again
                // Immediately stop recording if there's an error
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                }
            };

            recognition.onend = async () => {
                console.log('Voice recognition ended');
                isListening = false; // Set listening to false when it naturally ends

                // Important: Ensure mediaRecorder is stopped before processing audioChunks
                // This ensures all recorded data is available.
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                }

                // Wait a tiny bit for mediaRecorder.onstop to finish pushing the last chunk
                // This is a common pattern, though onstop usually fires synchronously enough.
                await new Promise(resolve => setTimeout(resolve, 50));

                if (audioChunks.length > 0) {
                    console.log('Processing audio after recognition ended naturally or stopped by user...');
                    isProcessingSpeech = false;
                    await speechToText(new Blob(audioChunks, { type: 'audio/webm' }));
                    audioChunks = []; // Clear chunks after processing
                } else {
                    console.log('No audio chunks recorded.');
                    if (!errorMessage) { // Only set if no other error has occurred
                        apiResponse = "No audio was recorded. Please ensure microphone is working and you spoke.";
                    }
                }
            };

            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    mediaRecorder = new MediaRecorder(stream);
                    mediaRecorder.ondataavailable = (event) => {
                        if (event.data.size > 0) {
                            audioChunks.push(event.data);
                        }
                    };
                    mediaRecorder.onstop = () => {
                        console.log('MediaRecorder stopped. Total chunks:', audioChunks.length);
                        isProcessingSpeech = true; // Set processing state to true
                        // The `recognition.onend` will now typically fire and handle
                        // the `speechToText` call with the collected `audioChunks`.
                    };
                    mediaRecorder.onerror = (event) => {
                        console.error('MediaRecorder error:', event.error);
                        errorMessage = `Audio recording error: ${event.error.name}.`;
                        isListening = false;
                    };
                })
                .catch(err => {
                    console.error('Error accessing microphone:', err);
                    errorMessage = 'Error accessing microphone. Please allow access and reload the page.';
                });

        } else {
            errorMessage = 'Web Speech API is not supported in this browser. Please use Chrome.';
            console.error(errorMessage);
        }
    });

    function toggleListening() {
        if (isListening) {
            // User explicitly presses to Stop listening
            console.log('User pressed stop button.');
            if (recognition && recognition.listening) {
                recognition.stop(); // This will trigger recognition.onend
            }
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop(); // This will trigger mediaRecorder.onstop
            }
            isListening = false; // Set immediately for UI feedback
        } else {
            // Start listening
            console.log('User pressed start button.');
            userText = '';
            apiResponse = '';
            errorMessage = '';
            transcribedTextFromBackend = '';
            audioChunks = [];

            if (recognition) {
                // To ensure a clean start, cancel any pending recognition
                recognition.abort();
                recognition.start();
            } else {
                errorMessage = "Speech recognition not initialized. Check browser support.";
                return;
            }

            if (mediaRecorder && mediaRecorder.state === 'inactive') {
                mediaRecorder.start();
            } else if (mediaRecorder && mediaRecorder.state === 'paused') {
                mediaRecorder.resume();
            } else if (!mediaRecorder) {
                errorMessage = "Microphone not initialized. Please ensure access is granted.";
            }

            isListening = true; // Set immediately for UI feedback
        }
    }
</script>

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

<div class="container">
    <h1>Board Game Assistant</h1>

    <button
        on:click={toggleListening}
        class="listen-button"
        class:listening={isListening}
        disabled={!recognition || !mediaRecorder || isLoadingSTT || isLoadingAPI}
    >
        {#if isListening}
            Stop Listening
        {:else if isLoadingSTT || isLoadingAPI}
            Processing...
        {:else}
            Start Listening
        {/if}
    </button>

    {#if errorMessage}
        <p class="error-message">{errorMessage}</p>
    {:else if !recognition || !mediaRecorder}
        <p class="status-message">Initializing microphone and speech recognition...</p>
    {/if}

    {#if isListening && !errorMessage}
        <p class="status-message">Listening... Speak clearly!</p>
    {:else if isProcessingSpeech}
        <p class="status-message loading-indicator">Processing your speech...</p>
    {:else if isLoadingSTT}
        <p class="status-message loading-indicator">Transcribing your speech...</p>
    {:else if isLoadingAPI}
        <p class="status-message loading-indicator">Getting response from assistant...</p>
    {/if}


    {#if userText}
        <div class="section-content">
            <h2 class="section-title">You Said:</h2>
            <div class="user-text">
                <p>{userText}</p>
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