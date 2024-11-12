export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Initialize OpenAI client with API key from environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define the Zod schema for sound effects without timestamps
const SoundEffect = z.object({
  description: z.string().describe('A short description of the sound effect.'),
  position: z.string().describe('A unique phrase or sentence where the sound effect should be added.'),
  duration: z.number().describe('How long the sound effect should play in seconds.'),
  intensity: z.enum(['background', 'foreground']).describe('Whether the sound should be played in the background or foreground.'),
});

const SoundEffectsSchema = z.object({
  sound_effects: z.array(SoundEffect),
});

// Convert the Zod schema to JSON Schema
const soundEffectsFunction = {
  name: 'generate_sound_effects',
  description: 'Generates sound effects for a podcast based on the transcription.',
  parameters: zodToJsonSchema(SoundEffectsSchema),
};

export async function POST(request: NextRequest) {
  console.log('Received SFX generation request...');

  try {
    const { transcription } = await request.json();

    if (!transcription) {
      throw new Error('Transcription is required in the request body.');
    }

    console.log('Sending request to OpenAI GPT-4...');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // Use GPT-4 with functions capability
      messages: [
        {
          role: 'system',
          content: "You are a creative sound designer specializing in children's content. Generate engaging sound effects for a children's podcast.",
        },
        {
          role: 'user',
          content: `Generate more than 10sound effects for this podcast transcript. For each sound effect, specify:
1. A clear description of the sound.
2. A unique phrase or sentence where the sound effect should be added.
3. How long it should play.
4. Whether it should be in the background or foreground.

Transcription:
"""
${transcription}
"""`,
        },
      ],
      functions: [soundEffectsFunction],
      function_call: { name: 'generate_sound_effects' }, // Force the assistant to call the function
      temperature: 0.7,
    });

    const responseMessage = completion.choices[0].message;

    if (responseMessage?.function_call?.arguments) {
      const functionArgs = JSON.parse(responseMessage.function_call.arguments);

      // Validate the data with Zod
      const parseResult = SoundEffectsSchema.safeParse(functionArgs);

      if (!parseResult.success) {
        throw new Error(`Validation error: ${parseResult.error.message}`);
      }

      const sfxListWithPositions = parseResult.data.sound_effects;
      console.log('Received SFX list from OpenAI:', sfxListWithPositions);

      // Return the SFX list with positions directly
      return NextResponse.json({ sfxList: sfxListWithPositions });
    } else {
      throw new Error('No function arguments returned from OpenAI.');
    }
  } catch (error: unknown) {
    // Type guard to ensure error is an Error object
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('Error in SFX generation API:', errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// Remove or comment out the findTimestampForPosition function as it's no longer used
// function findTimestampForPosition(positionText: string, words: any[]): number | null {
//   // Implement logic to find the timestamp corresponding to the positionText
// }