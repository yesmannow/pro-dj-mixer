'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { useUIStore } from '@/store/uiStore';
import { useLibraryStore } from '@/store/libraryStore';

const buttonBase = 'w-full px-6 py-4 rounded-xl text-base font-bold tracking-wide transition-all border shadow-lg';

export function AddMusicModal() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { isAddMusicModalOpen, setAddMusicModalOpen } = useUIStore();
  const { queueFilesForIngestion, isProcessingQueue } = useLibraryStore();

  useEffect(() => {
    if (!inputRef.current) return;
    (inputRef.current as any).webkitdirectory = true;
    (inputRef.current as any).directory = true;
  }, []);

  const close = () => setAddMusicModalOpen(false);

  const handleFolderClick = () => {
    if (isProcessingQueue) {
      toast.error('Import already running.');
      return;
    }
    inputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    close();
    await queueFilesForIngestion(files);
    e.target.value = '';
  };

  return (
    <AnimatePresence>
      {isAddMusicModalOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            className="w-[92vw] max-w-md rounded-2xl border border-white/10 bg-slate-900/80 p-6 shadow-2xl"
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-6">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Universal Importer</div>
              <h2 className="text-xl font-bold text-white mt-2">Add Music</h2>
              <p className="text-xs text-slate-400 mt-1">Choose a source to ingest audio without UI slowdown.</p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                className={`${buttonBase} bg-red-600/90 text-white border-red-400/30 hover:bg-red-500`}
                onClick={() => toast('YouTube API Integration Coming Soon')}
              >
                YouTube
              </button>
              <button
                type="button"
                className={`${buttonBase} bg-orange-500/90 text-white border-orange-300/30 hover:bg-orange-400`}
                onClick={() => toast('SoundCloud API Integration Coming Soon')}
              >
                SoundCloud
              </button>
              <button
                type="button"
                className={`${buttonBase} bg-slate-800 text-slate-100 border-white/10 hover:bg-slate-700`}
                onClick={handleFolderClick}
              >
                Local Folder
              </button>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="audio/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
