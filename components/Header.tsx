import { Disc3, Clock, Settings } from 'lucide-react';
import Image from 'next/image';
import { ThemeToggle } from './ThemeToggle';

export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3 bg-primary transition-colors duration-300">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-3 text-accent">
          <Disc3 className="w-8 h-8" />
          <h1 className="text-xl font-bold tracking-tight">
            PRO DJ <span className="font-light text-slate-400">STUDIO</span>
          </h1>
        </div>
        <nav className="hidden md:flex items-center gap-6">
          <a className="text-accent text-sm font-bold border-b-2 border-accent pb-1" href="#">
            PERFORMANCE
          </a>
          <a className="text-slate-400 hover:text-white text-sm font-medium transition-colors" href="#">
            PREPARATION
          </a>
          <a className="text-slate-400 hover:text-white text-sm font-medium transition-colors" href="#">
            EXPORT
          </a>
          <a className="text-slate-400 hover:text-white text-sm font-medium transition-colors" href="#">
            RECORD
          </a>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700">
          <Clock className="w-4 h-4 text-accent" />
          <span className="text-xs font-mono">124.00 BPM</span>
        </div>
        <ThemeToggle />
        <button className="p-2 hover:bg-slate-800 rounded-lg text-slate-400">
          <Settings className="w-5 h-5" />
        </button>
        <div className="h-8 w-8 rounded-full bg-slate-700 overflow-hidden border border-slate-600 relative">
          <Image
            alt="User Profile"
            src="https://picsum.photos/seed/avatar/100/100"
            fill
            className="object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>
    </header>
  );
}
