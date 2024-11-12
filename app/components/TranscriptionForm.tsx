'use client';

import { useState } from 'react';

interface Word {
  word: string;
  start: number;
  end: number;
}

interface SFX {
  description: string;
  position: string;
  duration: number;
  intensity: 'background' | 'foreground';
  timestamp?: number;
  audioUrl?: string;
  isGenerating?: boolean;
}

export default function TranscriptionForm() {
  const [audioURL, setAudioURL] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [words, setWords] = useState<Word[]>([]);
  const [error, setError] = useState('');
  const [showRawData, setShowRawData] = useState(false);
  const [rawData, setRawData] = useState<any>(null);
  const [sfxLoading, setSfxLoading] = useState(false);
  const [sfxList, setSfxList] = useState<SFX[]>([]);
  const [isMapping, setIsMapping] = useState(false);

  // Format timestamp to readable format (MM:SS.ms)
  const formatTimestamp = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = (seconds % 60).toFixed(2);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.padStart(5, '0')}`;
  };

  const handleTranscribe = async () => {
    console.log('Starting transcription process...');
    setIsLoading(true);
    setTranscription('');
    setWords([]);
    setError('');
    setRawData(null);

    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ audioURL }),
      });

      const data = await response.json();

      if (response.ok) {
        setTranscription(data.transcription);
        setWords(data.words);
        setRawData(data); // Store the raw data
        console.log('Transcription successful with timestamps');
      } else {
        throw new Error(data.error || 'Transcription failed.');
      }
    } catch (err: unknown) {
      console.error('Error during transcription:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
      console.log('Transcription process finished.');
    }
  };

  // Function to handle SFX generation
  const handleGenerateSFX = async () => {
    console.log('Starting SFX generation process...');
    setSfxLoading(true);
    setError('');
    setSfxList([]);

    try {
      // Send POST request to the API route
      const response = await fetch('/api/generate-sfx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcription }),
      });

      const data = await response.json();

      if (response.ok) {
        setSfxList(data.sfxList);
        console.log('SFX generation successful:', data.sfxList);
      } else {
        throw new Error(data.error || 'SFX generation failed.');
      }
    } catch (err: any) {
      console.error('Error during SFX generation:', err);
      setError(err.message);
    } finally {
      setSfxLoading(false);
      console.log('SFX generation process finished.');
    }
  };

  // Add the mapping function
  const mapPositionsToTimestamps = () => {
    console.log('Mapping positions to timestamps...');
    setIsMapping(true);
    setError('');

    try {
      const updatedSfxList = sfxList.map((sfx) => {
        const timestamp = findTimestampForPosition(sfx.position, words);
        if (timestamp === null) {
          console.warn(`Could not find timestamp for position: ${sfx.position}`);
          // Handle this case as needed
        }
        return {
          ...sfx,
          timestamp,
        };
      });

      // Cast updatedSfxList to SFX[] to match state type
      setSfxList(updatedSfxList as SFX[]);
      console.log('Mapping completed:', updatedSfxList);
    } catch (err: any) {
      console.error('Error during mapping:', err);
      setError(err.message);
    } finally {
      setIsMapping(false);
    }
  };

  // Helper function to clean text (language-agnostic approach)
  function cleanText(text: string): string {
    return text
      .toLowerCase()
      // Normalize unicode characters (handles accents and special characters across languages)
      .normalize('NFKD')
      // Remove all non-alphanumeric characters except spaces
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      // Replace multiple spaces with a single space
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Helper function to find timestamp based on position text
  function findTimestampForPosition(positionText: string, words: Word[]): number | null {
    console.log('\n----------------------------------------');
    console.log('🔍 FINDING TIMESTAMP FOR:', positionText);
    console.log('----------------------------------------');

    // Clean the position text
    const cleanedPositionText = cleanText(positionText);
    console.log('📝 Cleaned position text:', cleanedPositionText);

    // Create an array of cleaned words from the transcript
    const transcriptWords = words.map(w => ({
      ...w,
      cleaned: cleanText(w.word),
      original: w.word
    }));

    // Log the context
    console.log('\n📚 Context:');
    console.log('Original position text:', positionText);
    console.log('Cleaned position text:', cleanedPositionText);

    // Split into words and filter out empty strings
    const positionWords = cleanedPositionText
      .split(' ')
      .filter(word => word.length > 0);

    if (positionWords.length === 0) {
      console.warn('⚠️ No words to match after cleaning');
      return null;
    }

    // Create a sliding window of different sizes
    const windowSizes = [
      positionWords.length,                    // Exact match
      Math.floor(positionWords.length * 0.8),  // 80% of words
      Math.floor(positionWords.length * 0.6),  // 60% of words
      3,                                       // Minimum context
    ].filter((size, index, arr) => 
      size > 0 && (index === 0 || size < arr[index - 1])
    );

    console.log('\n🎯 Trying different window sizes:', windowSizes);

    for (const windowSize of windowSizes) {
      console.log(`\n🔄 Trying window size: ${windowSize}`);

      let bestMatch = {
        index: -1,
        score: 0,
        matchedSequence: '',
      };

      // Sliding window approach
      for (let i = 0; i < transcriptWords.length - windowSize + 1; i++) {
        const windowWords = transcriptWords.slice(i, i + windowSize);
        const windowText = windowWords.map(w => w.cleaned).join(' ');
        
        // Calculate match score using various metrics
        const score = calculateMatchScore(
          cleanedPositionText,
          windowText,
          positionWords,
          windowWords.map(w => w.cleaned)
        );

        if (score > bestMatch.score) {
          bestMatch = {
            index: i,
            score,
            matchedSequence: windowWords.map(w => w.original).join(' '),
          };
          console.log('\n📍 New best match found:');
          console.log(`  Score: ${(score * 100).toFixed(2)}%`);
          console.log(`  Sequence: "${bestMatch.matchedSequence}"`);
          console.log(`  Timestamp: ${formatTimestamp(words[i].start)}`);
        }
      }

      // If we found a good enough match
      if (bestMatch.score >= 0.7) {
        console.log(`\n✨ SUCCESS: Found match with window size ${windowSize}`);
        console.log(`  Final score: ${(bestMatch.score * 100).toFixed(2)}%`);
        console.log(`  Timestamp: ${formatTimestamp(words[bestMatch.index].start)}`);
        return words[bestMatch.index].start;
      }
    }

    console.warn('\n⚠️ WARNING: No sufficient match found');
    console.log('----------------------------------------\n');
    return null;
  }

  // Helper function to calculate match score using multiple metrics
  function calculateMatchScore(
    targetText: string,
    windowText: string,
    targetWords: string[],
    windowWords: string[]
  ): number {
    // 1. Word overlap score
    const wordOverlapScore = calculateWordOverlap(targetWords, windowWords);

    // 2. Sequence similarity score
    const sequenceScore = calculateSequenceSimilarity(targetText, windowText);

    // 3. Length ratio score
    const lengthScore = Math.min(
      targetText.length / windowText.length,
      windowText.length / targetText.length
    );

    // Weighted combination of scores
    const finalScore = (
      wordOverlapScore * 0.5 +
      sequenceScore * 0.3 +
      lengthScore * 0.2
    );

    return finalScore;
  }

  // Helper function to calculate word overlap
  function calculateWordOverlap(words1: string[], words2: string[]): number {
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    return intersection.size / Math.max(set1.size, set2.size);
  }

  // Helper function to calculate sequence similarity
  function calculateSequenceSimilarity(str1: string, str2: string): number {
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1.0;
    
    const distance = levenshteinDistance(str1, str2);
    return 1 - distance / maxLength;
  }

  // Helper function to calculate Levenshtein distance
  function levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = Array(str1.length + 1)
      .fill(null)
      .map(() => Array(str2.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= str2.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= str1.length; i++) {
      for (let j = 1; j <= str2.length; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[str1.length][str2.length];
  }

  // Add new function to generate sound for a specific SFX
  const generateSound = async (index: number) => {
    console.log('🎵 Generating sound for SFX:', sfxList[index].description);
    
    // Update the loading state for this specific SFX
    const updatedSfxList = [...sfxList];
    updatedSfxList[index] = { ...updatedSfxList[index], isGenerating: true };
    setSfxList(updatedSfxList);

    try {
      const response = await fetch('/api/generate-sound', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: sfxList[index].description,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate sound');
      }

      // Update the SFX list with the new audio URL
      const newSfxList = [...sfxList];
      newSfxList[index] = {
        ...newSfxList[index],
        audioUrl: data.audioBase64,
        isGenerating: false,
      };
      setSfxList(newSfxList);
      console.log('✅ Sound generated successfully for SFX:', index);

    } catch (error) {
      console.error('❌ Error generating sound:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate sound');
      
      // Reset the generating state on error
      const newSfxList = [...sfxList];
      newSfxList[index] = {
        ...newSfxList[index],
        isGenerating: false,
      };
      setSfxList(newSfxList);
    }
  };

  return (
    <div className="p-4">
      <input
        type="text"
        value={audioURL}
        onChange={(e) => setAudioURL(e.target.value)}
        placeholder="Enter audio file URL"
        className="border p-2 w-full mb-4 rounded"
      />

      <button
        onClick={handleTranscribe}
        disabled={isLoading}
        className={`${
          isLoading ? 'bg-gray-400' : 'bg-blue-500 hover:bg-blue-600'
        } text-white px-4 py-2 rounded transition-colors`}
      >
        {isLoading ? 'Transcribing...' : 'Transcript'}
      </button>

      {isLoading && (
        <div className="mt-4">
          <div className="animate-pulse flex space-x-4">
            <div className="flex-1 space-y-4 py-1">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {words.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-bold mb-4">Transcription with Timestamps:</h2>
          <div className="space-y-2">
            {words.map((word, index) => (
              <span
                key={index}
                className="inline-block bg-gray-100 rounded px-2 py-1 m-1 text-sm"
                title={`${formatTimestamp(word.start)} - ${formatTimestamp(word.end)}`}
              >
                {word.word}
                <span className="text-xs text-gray-500 ml-1">
                  ({formatTimestamp(word.start)})
                </span>
              </span>
            ))}
          </div>

          {/* Generate SFX Button */}
          <button
            onClick={handleGenerateSFX}
            disabled={sfxLoading}
            className={`${
              sfxLoading ? 'bg-gray-400' : 'bg-green-500 hover:bg-green-600'
            } text-white px-4 py-2 rounded mt-4 transition-colors`}
          >
            {sfxLoading ? 'Generating SFX...' : 'Generate SFX'}
          </button>

          {/* Loading indicator for SFX generation */}
          {sfxLoading && (
            <div className="mt-4">
              <p>Generating sound effects...</p>
              {/* A loading spinner can be added here */}
            </div>
          )}

          {/* Display SFX List */}
          {sfxList.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-bold mb-2">Sound Effects (Positions):</h2>
              <div className="space-y-4">
                {sfxList.map((sfx, index) => (
                  <div 
                    key={index}
                    className={`p-4 rounded-lg ${
                      sfx.intensity === 'background' ? 'bg-blue-50' : 'bg-green-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {sfx.timestamp !== undefined
                          ? formatTimestamp(sfx.timestamp)
                          : 'Timestamp not mapped'}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        sfx.intensity === 'background' 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {sfx.intensity}
                      </span>
                    </div>
                    <p className="mt-1">{sfx.description}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Duration: {sfx.duration}s
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Position: "{sfx.position}"
                    </p>

                    {/* Add Generate button and audio player */}
                    <div className="mt-3 space-y-2">
                      {!sfx.audioUrl && (
                        <button
                          onClick={() => generateSound(index)}
                          disabled={sfx.isGenerating}
                          className={`${
                            sfx.isGenerating 
                              ? 'bg-gray-400' 
                              : 'bg-indigo-500 hover:bg-indigo-600'
                          } text-white px-3 py-1 rounded text-sm transition-colors`}
                        >
                          {sfx.isGenerating ? 'Generating...' : 'Generate Sound'}
                        </button>
                      )}
                      
                      {sfx.audioUrl && (
                        <div className="mt-2">
                          <audio 
                            controls 
                            className="w-full"
                            src={sfx.audioUrl}
                          >
                            Your browser does not support the audio element.
                          </audio>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Button to Map Positions to Timestamps */}
              <button
                onClick={mapPositionsToTimestamps}
                disabled={isMapping}
                className={`${
                  isMapping ? 'bg-gray-400' : 'bg-purple-500 hover:bg-purple-600'
                } text-white px-4 py-2 rounded mt-4 transition-colors`}
              >
                {isMapping ? 'Mapping...' : 'Map Positions to Timestamps'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Raw JSON Data Collapsible Section */}
      {rawData && (
        <div className="mt-8">
          <button
            onClick={() => setShowRawData(!showRawData)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
          >
            <svg
              className={`w-4 h-4 transition-transform ${showRawData ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            {showRawData ? 'Hide Raw JSON' : 'Show Raw JSON'}
          </button>
          
          {showRawData && (
            <div className="mt-2 p-4 bg-gray-50 rounded-lg overflow-auto max-h-96">
              <pre className="text-sm text-gray-800 whitespace-pre-wrap">
                {JSON.stringify(rawData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-50 text-red-500 rounded">
          <p>Error: {error}</p>
        </div>
      )}
    </div>
  );
} 