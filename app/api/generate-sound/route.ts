import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  console.log('🎵 Starting sound generation...');
  
  try {
    const { text } = await request.json();
    
    // Validate input
    if (!text) {
      console.error('❌ No text provided for sound generation');
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    console.log('📝 Generating sound for text:', text);

    const response = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': process.env.ELEVEN_LABS_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        duration_seconds: 5
      }),
    });

    if (!response.ok) {
      console.error('❌ ElevenLabs API error:', response.status);
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    // Get the audio buffer
    const audioBuffer = await response.arrayBuffer();
    
    // Convert to base64
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');
    
    console.log('✅ Sound generated successfully');
    
    return NextResponse.json({
      audioBase64: `data:audio/mpeg;base64,${audioBase64}`
    });

  } catch (error) {
    console.error('❌ Error generating sound:', error);
    return NextResponse.json(
      { error: 'Failed to generate sound effect' },
      { status: 500 }
    );
  }
} 