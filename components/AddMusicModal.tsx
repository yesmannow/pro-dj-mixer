'use client';

import { motion, AnimatePresence } from 'motion/react';
import { useUIStore } from '@/store/uiStore';
import { useLibraryStore } from '@/store/libraryStore';
import { X, Youtube, CloudLightning, FolderOpen, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'react-hot-toast';

export function AddMusicModal() {
  const { isAddMusicModalOpen, setAddMusicModalOpen } = useUIStore();
  const { queueFilesForIngestion, isProcessingQueue, queueProgress } = useLibraryStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      queueFilesForIngestion(Array.from(e.target.files));
    }
  };

  return (
    <AnimatePresence>
      {isAddMusicModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !isProcessingQueue && setAddMusicModalOpen(false)}
            className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
          ></motion.div>

          {/* Modal Content */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            onPointerDown={(e) => e.stopPropagation()} 
            className="relative w-full max-w-lg bg-slate-900/90 border border-slate-700 rounded-2xl shadow-2xl p-6 overflow-hidden flex flex-col gap-6"
          >
            {/* Header */}
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-[800] tracking-tight text-white">Universal Importer</h2>
                <p className="text-slate-400 text-sm mt-1">Ingest tracks and stems from any source.</p>
              </div>
              {!isProcessingQueue && (
                 <button
                   onClick={() => setAddMusicModalOpen(false)}
                   className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-full transition-colors"
                 >
                   <X className="w-5 h-5" />
                 </button>
              )}
            </div>

            {/* Content Area */}
            <div className="flex flex-col gap-4">
              
              {isProcessingQueue ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                   <Loader2 className="w-12 h-12 text-accent animate-spin" />
                   <div className="text-center">
                      <h3 className="text-lg font-bold text-white mb-1">Analyzing Library...</h3>
                      <p className="text-slate-400 font-mono text-sm">{queueProgress}</p>
                   </div>
                   <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mt-4">
                      {/* We'd map actual percentage here if calculated, for now pulse */}
                      <div className="h-full bg-accent w-1/2 animate-pulse rounded-full shadow-[0_0_10px_#00f2ff]"></div>
                   </div>
                </div>
              ) : (
                <>
                  <button 
                     onClick={() => toast.error("YouTube API integration coming soon.")}
                     className="w-full group relative overflow-hidden bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors rounded-xl p-4 flex items-center gap-4 text-left"
                  >
                    <div className="w-12 h-12 bg-red-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.4)]">
                      <Youtube className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-lg group-hover:text-red-400 transition-colors">Import from YouTube</h3>
                      <p className="text-sm text-red-200/50">Rip audio directly from URL (128kbps)</p>
                    </div>
                  </button>

                  <button 
                     onClick={() => toast.error("SoundCloud API integration coming soon.")}
                     className="w-full group relative overflow-hidden bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 transition-colors rounded-xl p-4 flex items-center gap-4 text-left"
                  >
                    <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.4)]">
                      <CloudLightning className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-lg group-hover:text-orange-400 transition-colors">Import from SoundCloud</h3>
                      <p className="text-sm text-orange-200/50">Connect account & fetch playlists</p>
                    </div>
                  </button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-700/50"></div>
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-slate-900 px-2 text-xs uppercase tracking-widest text-slate-500 font-bold">or</span>
                    </div>
                  </div>

                  <input 
                     type="file" 
                     multiple 
                     accept=".mp3,.wav,.flac,.m4a,audio/*" 
                     className="hidden" 
                     ref={fileInputRef}
                     onChange={handleFolderSelect}
                     /* @ts-ignore - webkitdirectory is non-standard but heavily supported */
                     webkitdirectory="true"
                     directory="true"
                  />
                  <button 
                     onClick={() => fileInputRef.current?.click()}
                     className="w-full group relative overflow-hidden bg-slate-800 hover:bg-slate-700 border border-slate-600 transition-colors rounded-xl p-4 flex items-center gap-4 text-left"
                  >
                    <div className="w-12 h-12 bg-slate-700 group-hover:bg-slate-600 transition-colors rounded-lg flex items-center justify-center">
                      <FolderOpen className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-lg">Scan Local Folder</h3>
                      <p className="text-sm text-slate-400">Bulk ingest & analyze local directories</p>
                    </div>
                  </button>
                </>
              )}
            </div>
            
            {/* Footer */}
            {!isProcessingQueue && (
               <div className="text-center pt-2">
                 <button onClick={() => setAddMusicModalOpen(false)} className="text-sm text-slate-500 hover:text-white transition-colors">
                   Cancel & Return to Studio
                 </button>
               </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
