'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const isLightMode = document.documentElement.classList.contains('light');
    const timer = setTimeout(() => setIsLight(isLightMode), 0);
    if (!isLightMode && !document.documentElement.classList.contains('dark')) {
      document.documentElement.classList.add('dark');
    }
    return () => clearTimeout(timer);
  }, []);

  const toggleTheme = () => {
    if (isLight) {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
      setIsLight(false);
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      setIsLight(true);
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors"
      title="Toggle Theme"
    >
      {isLight ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
    </button>
  );
}
