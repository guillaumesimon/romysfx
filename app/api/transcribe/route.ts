export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import FormData from 'form-data';
import fetch from 'node-fetch';

export async function POST(request: NextRequest) {
  console.log('Received transcription request...');

  try {
    const { audioURL } = await request.json();

    // Fetch the audio file from the provided URL
    console.log(`Fetching audio file from URL: ${audioURL}`);
    const audioResponse = await fetch(audioURL);

    if (!audioResponse.ok) {
      throw new Error('Failed to fetch audio file.');
    }

    const audioBuffer = await audioResponse.buffer();

    // Prepare the form data for OpenAI API
    console.log('Preparing data for OpenAI API with word-level timestamps...');
    const formData = new FormData();
    formData.append('file', audioBuffer, {
      filename: 'audio.mp3',
      contentType: audioResponse.headers.get('content-type') || 'audio/mpeg',
    });
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json'); // Required for timestamps
    formData.append('timestamp_granularities[]', 'word'); // Add word-level timestamp granularity

    // Send the audio file to OpenAI Whisper API
    console.log('Sending audio file to OpenAI Whisper API...');
    const openaiResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      throw new Error(data.error?.message || 'Failed to transcribe audio.');
    }

    console.log('Received transcription from OpenAI with timestamps');

    // Return both the transcription text and words with timestamps
    return NextResponse.json({
      transcription: data.text,
      words: data.words // Array of words with timestamps
    });
  } catch (error: any) {
    console.error('Error in transcription API:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}