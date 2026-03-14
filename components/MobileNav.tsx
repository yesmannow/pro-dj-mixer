'use client';

export type MobileNavTab = 'DECK_A' | 'MIXER' | 'DECK_B' | 'LIBRARY';

interface MobileNavProps {
  activeTab: MobileNavTab;
  onTabChange: (tab: MobileNavTab) => void;
}

const NAV_ITEMS: Array<{ id: MobileNavTab; label: string }> = [
  { id: 'DECK_A', label: 'Deck A' },
  { id: 'MIXER',  label: 'Mixer'  },
  { id: 'DECK_B', label: 'Deck B' },
  { id: 'LIBRARY', label: 'Library' },
];

export function MobileNav({ activeTab, onTabChange }: MobileNavProps) {
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 deck-chassis border-t border-studio-gold/20"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex h-14">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={[
                'flex-1 flex flex-col items-center justify-center gap-0.5',
                'oled-display transition-all duration-150',
                isActive
                  ? 'text-studio-gold neon-text-glow'
                  : 'text-slate-500 hover:text-slate-300',
              ].join(' ')}
            >
              <span className="text-[9px] font-black tracking-[0.22em] uppercase">
                {item.label}
              </span>
              {isActive && (
                <span
                  className="block h-0.5 w-6 rounded-full mt-0.5"
                  style={{ background: 'var(--color-studio-gold)', boxShadow: '0 0 6px var(--color-studio-gold)' }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
