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
          <Deck deckId="A" />
          <Mixer />
          <Deck deckId="B" />
        </div>
        <Library />
      </main>
      <Footer />
    </>
  );
}
