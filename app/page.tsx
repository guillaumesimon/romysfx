import TranscriptionForm from './components/TranscriptionForm';

export default function Home() {
  return (
    <main className="container mx-auto p-4">
      <h1 className="text-2xl font-bold text-center my-8">Audio Transcription App</h1>
      <TranscriptionForm />
    </main>
  );
}
