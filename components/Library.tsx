'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, Layers, ListChecks, ListPlus, UploadCloud, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { Sampler } from './Sampler';
import { useLibraryStore } from '@/store/libraryStore';

export function Library() {
  const [activeTab, setActiveTab] = useState<'tracks' | 'playlists' | 'history' | 'samples'>('tracks');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { tracks, processingTracks, loadTracks, addTrack, seedLibrary } = useLibraryStore();

  useEffect(() => {
    loadTracks().then(() => {
      seedLibrary();
    });
  }, [loadTracks, seedLibrary]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      await addTrack(file);
    }
  }, [addTrack]);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      for (const file of files) {
        await addTrack(file);
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleTrackDragStart = (e: React.DragEvent, trackId: number) => {
    e.dataTransfer.setData('text/plain', trackId.toString());
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div 
      className="flex-1 min-h-[300px] bg-slate-900/60 rounded-xl border border-slate-800 flex flex-col overflow-hidden relative transition-colors duration-300"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-accent/10 backdrop-blur-sm z-50 flex flex-col items-center justify-center border-2 border-dashed border-accent rounded-xl">
          <UploadCloud className="w-16 h-16 text-accent mb-4 animate-bounce" />
          <h2 className="text-2xl font-bold text-white tracking-tight">Drop Audio Files Here</h2>
          <p className="text-slate-300 mt-2">MP3, WAV, FLAC supported</p>
        </div>
      )}

      <div className="p-4 border-b border-slate-800 flex justify-between items-center">
        <div className="flex gap-4 items-center">
          <button 
            onClick={() => setActiveTab('tracks')}
            className={clsx("px-4 py-1 rounded text-sm font-bold transition-colors", activeTab === 'tracks' ? "bg-slate-800 text-accent" : "text-slate-400 hover:text-white")}
          >
            ALL TRACKS
          </button>
          <button 
            onClick={() => setActiveTab('playlists')}
            className={clsx("px-4 py-1 rounded text-sm font-bold transition-colors", activeTab === 'playlists' ? "bg-slate-800 text-accent" : "text-slate-400 hover:text-white")}
          >
            PLAYLISTS
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={clsx("px-4 py-1 rounded text-sm font-bold transition-colors", activeTab === 'history' ? "bg-slate-800 text-accent" : "text-slate-400 hover:text-white")}
          >
            HISTORY
          </button>
          <button 
            onClick={() => setActiveTab('samples')}
            className={clsx("px-4 py-1 rounded text-sm font-bold transition-colors", activeTab === 'samples' ? "bg-slate-800 text-accent" : "text-slate-400 hover:text-white")}
          >
            SAMPLES
          </button>
          
          <div className="w-px h-6 bg-slate-800 mx-2"></div>
          
          <input 
            type="file" 
            multiple 
            accept=".mp3,.wav,.flac,.m4a,audio/*" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileInput}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs font-bold text-slate-300 transition-colors"
          >
            <UploadCloud className="w-3.5 h-3.5 text-accent" />
            UPLOAD
          </button>
        </div>
        {activeTab !== 'samples' && (
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
        )}
      </div>
      <div className="overflow-y-auto flex-1">
        {activeTab === 'samples' ? (
          <Sampler />
        ) : (
          <table className="w-full text-left">
            <thead className="bg-slate-900/80 sticky top-0 border-b border-slate-800 z-20">
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
              {/* Processing Tracks */}
              {processingTracks.map((pt, idx) => (
                <tr key={`processing-${pt.id}`} className="bg-slate-800/20 animate-pulse">
                  <td className="px-6 py-4 text-sm text-slate-500">-</td>
                  <td className="px-6 py-4 text-sm flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center border border-slate-700">
                      <Loader2 className="w-4 h-4 text-accent animate-spin" />
                    </div>
                    <span className="font-medium text-slate-400 italic">Analyzing {pt.name}...</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">-</td>
                  <td className="px-6 py-4 text-sm text-slate-500">-</td>
                  <td className="px-6 py-4 text-sm text-slate-500">-</td>
                  <td className="px-6 py-4 text-sm text-slate-500">-</td>
                  <td className="px-6 py-4"></td>
                </tr>
              ))}

              {/* Loaded Tracks */}
              {tracks.map((track, index) => (
                <tr
                  key={track.id}
                  draggable
                  onDragStart={(e) => handleTrackDragStart(e, track.id!)}
                  className="group cursor-grab active:cursor-grabbing transition-colors hover:bg-slate-800/40"
                >
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {index + 1}
                  </td>
                  <td className="px-6 py-4 text-sm flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-slate-900 flex items-center justify-center border border-slate-700 overflow-hidden relative">
                      <div className="absolute inset-0 bg-[radial-gradient(circle,transparent_20%,#000_120%)] z-10"></div>
                      <div className="w-full h-full bg-slate-800 flex items-center justify-center" style={{ backgroundImage: 'repeating-radial-gradient(#1e293b 0, #1e293b 2px, #0f172a 3px, #0f172a 4px)' }}>
                        <div className="w-3 h-3 bg-accent rounded-full z-20"></div>
                      </div>
                    </div>
                    <span className="font-medium text-slate-200">
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
              {tracks.length === 0 && processingTracks.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <UploadCloud className="w-8 h-8 text-slate-600" />
                      <p>No tracks in library. Drag and drop audio files here to analyze.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
