import { GoogleGenAI, type GoogleGenAIOptions, createUserContent, createPartFromUri } from "@google/genai";
import { GEMINI_API_KEY } from '$env/static/private';
import { json } from '@sveltejs/kit';
import { promises as fs } from "fs";

let options: GoogleGenAIOptions = {
  apiKey: GEMINI_API_KEY,
}

const ai = new GoogleGenAI(options);

export async function POST({ request }) {
  console.log('Received POST request for audio processing');
  const form = await request.formData();
  const file = form.get('audio');
  if (!(file instanceof Blob || file instanceof File)) {
    return new Response('No audio file received', { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let fileName = "/tmp/recording.webm"

  // Example: save the file temporarily
  await fs.writeFile(fileName, buffer);

  // Upload to your ai.files endpoint
  const myfile = await ai.files.upload({
    file: fileName,
    config: { mimeType: file.type }
  });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: createUserContent([
      createPartFromUri(myfile.uri, myfile.mimeType),
      'Output only the text from the audio file and nothing else.',
    ]),
  });

  return json(response.text);
}

export async function GET({ url }) {
  const question = url.searchParams.get('question');
  if (!question) {
    return new Response('Missing `question` parameter', { status: 400 });
  }
  console.log('Received question:', question);

  // Define the grounding tool
  const groundingTool = {
    googleSearch: {},
  };

  // Configure generation settings
  const config = {
    tools: [groundingTool],
  };

  // Make the request
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    config: config,
    contents: [
      {
        role: 'model',
        parts: [{ text: 'You are an expert about boardgame rules. Asnwer the question about specific board game. Use rulebooks on the internet and browse through forums. Make a short and precide answer.' }]
      },
      {
        role: 'user',
        parts: [{ text: question }]
      }
    ],
  });

  // Print the grounded response
  console.log(response.text);

  return new Response(JSON.stringify(response.text), { status: 200, headers: { 'Content-Type': 'application/json' } });
}