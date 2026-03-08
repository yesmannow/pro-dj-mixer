import { Search, Plus, Layers, ListChecks, ListPlus } from 'lucide-react';
import { clsx } from 'clsx';

const tracks = [
  {
    id: 1,
    title: 'Midnight Pulse',
    artist: 'Solar Echo',
    bpm: '124',
    key: '8A',
    duration: '06:12',
    hasVocal: true,
  },
  {
    id: 2,
    title: 'Neon Nights',
    artist: 'Synthwave Collective',
    bpm: '124',
    key: '4A',
    duration: '05:45',
    hasVocal: true,
    isActive: true,
  },
  {
    id: 3,
    title: 'Techno Core',
    artist: 'Base Unit',
    bpm: '128',
    key: '11B',
    duration: '07:22',
  },
  {
    id: 4,
    title: 'Ethereal Drift',
    artist: 'Cloud Walker',
    bpm: '122',
    key: '2A',
    duration: '04:58',
  },
  {
    id: 5,
    title: 'Cyber Groove',
    artist: 'Electric Dreams',
    bpm: '126',
    key: '7B',
    duration: '06:40',
  },
];

export function Library() {
  return (
    <div className="flex-1 min-h-[300px] bg-primary/40 rounded-xl border border-slate-800 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-slate-800 flex justify-between items-center">
        <div className="flex gap-4">
          <button className="px-4 py-1 bg-slate-800 rounded text-accent text-sm font-bold">
            ALL TRACKS
          </button>
          <button className="px-4 py-1 text-slate-400 hover:text-white text-sm font-medium transition-colors">
            PLAYLISTS
          </button>
          <button className="px-4 py-1 text-slate-400 hover:text-white text-sm font-medium transition-colors">
            HISTORY
          </button>
        </div>
        <div className="flex items-center">
          <select className="bg-slate-900 border-slate-800 rounded-lg py-1.5 text-xs focus:ring-accent focus:border-accent text-slate-400 mr-2 cursor-pointer">
            <option>Local</option>
            <option>SoundCloud</option>
            <option>Tidal</option>
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              className="bg-slate-900 border-slate-800 rounded-lg pl-10 py-1.5 text-sm w-64 focus:ring-accent focus:border-accent text-slate-200"
              placeholder="Search track, artist, BPM..."
              type="text"
            />
          </div>
        </div>
      </div>
      <div className="overflow-y-auto">
        <table className="w-full text-left">
          <thead className="bg-primary/80 sticky top-0 border-b border-slate-800 z-20">
            <tr>
              <th className="px-6 py-3 text-xs uppercase tracking-wider text-slate-500 font-bold">
                #
              </th>
              <th className="px-6 py-3 text-xs uppercase tracking-wider text-slate-500 font-bold">
                Title
              </th>
              <th className="px-6 py-3 text-xs uppercase tracking-wider text-slate-500 font-bold">
                Artist
              </th>
              <th className="px-6 py-3 text-xs uppercase tracking-wider text-slate-500 font-bold">
                BPM
              </th>
              <th className="px-6 py-3 text-xs uppercase tracking-wider text-slate-500 font-bold">
                Key
              </th>
              <th className="px-6 py-3 text-xs uppercase tracking-wider text-slate-500 font-bold">
                Duration
              </th>
              <th className="px-6 py-3 text-xs uppercase tracking-wider text-slate-500 font-bold text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {tracks.map((track) => (
              <tr
                key={track.id}
                className={clsx(
                  'group cursor-pointer transition-colors',
                  track.isActive
                    ? 'bg-accent/5 hover:bg-accent/10 border-l-2 border-accent'
                    : 'hover:bg-slate-800/40'
                )}
              >
                <td
                  className={clsx(
                    'px-6 py-4 text-sm',
                    track.isActive ? 'text-accent' : 'text-slate-500'
                  )}
                >
                  {track.id}
                </td>
                <td className="px-6 py-4 text-sm flex items-center">
                  <span
                    className={clsx(
                      'font-medium',
                      track.isActive ? 'font-bold text-white' : 'text-slate-200'
                    )}
                  >
                    {track.title}
                  </span>
                  {track.hasVocal && (
                    <span className="ml-2 px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[9px] font-bold rounded border border-blue-500/30">
                      VOCAL
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-slate-400">{track.artist}</td>
                <td className="px-6 py-4 text-sm text-accent font-mono">{track.bpm}</td>
                <td className="px-6 py-4 text-sm text-slate-400">{track.key}</td>
                <td className="px-6 py-4 text-sm text-slate-500">{track.duration}</td>
                <td className="px-6 py-4 text-right relative group/menu">
                  <button className="p-1.5 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-400 hover:text-accent hover:border-accent transition-all duration-200">
                    <Plus className="w-4 h-4" />
                  </button>
                  <div className="absolute right-6 top-full mt-1 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all duration-200 z-50 overflow-hidden">
                    <div className="flex flex-col">
                      <button className="flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-slate-300 hover:bg-accent/10 hover:text-accent transition-colors text-left">
                        <Layers className="w-4 h-4" />
                        Add to Deck A
                      </button>
                      <button className="flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-slate-300 hover:bg-accent/10 hover:text-accent transition-colors text-left border-t border-slate-800/50">
                        <Layers className="w-4 h-4 text-pink-500" />
                        Add to Deck B
                      </button>
                      <button className="flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-slate-300 hover:bg-accent/10 hover:text-accent transition-colors text-left border-t border-slate-800/50">
                        <ListChecks className="w-4 h-4" />
                        Add to Cue
                      </button>
                      <button className="flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-slate-300 hover:bg-accent/10 hover:text-accent transition-colors text-left border-t border-slate-800/50">
                        <ListPlus className="w-4 h-4" />
                        Add to Playlist
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
