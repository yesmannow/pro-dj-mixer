import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { DeckFX } from '@/components/DeckFX';
import { MasterFX } from '@/components/MasterFX';
import { Deck } from '@/components/Deck';
import { Mixer } from '@/components/Mixer';
import { Library } from '@/components/Library';

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1 flex flex-col p-4 gap-4">
        <div className="grid grid-cols-12 gap-4 flex-none mb-4">
          <DeckFX side="left" />
          <MasterFX />
          <DeckFX side="right" />
        </div>
        <div className="grid grid-cols-12 gap-4 flex-none">
          <Deck
            side="left"
            title="Neon Nights"
            artist="Synthwave Collective"
            bpm="124"
            keySignature="4A"
            timeRemaining="03:42.12"
            isPlaying={true}
          />
          <Mixer />
          <Deck
            side="right"
            title="Cyber Groove"
            artist="Electric Dreams"
            bpm="126"
            keySignature="7B"
            timeRemaining="02:15.08"
            isPlaying={false}
          />
        </div>
        <Library />
      </main>
      <Footer />
    </>
  );
}
