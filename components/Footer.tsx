export function Footer() {
  return (
    <footer className="bg-primary px-6 py-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500 font-mono transition-colors duration-300">
      <div className="flex gap-6">
        <span>CPU: 12%</span>
        <span>LATENCY: 5ms</span>
        <span>SAMPLE: 44.1kHz</span>
      </div>
      <div className="flex gap-4 items-center">
        <span className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-accent"></div> MASTER OUT
        </span>
        <span className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-slate-700"></div> REC OFF
        </span>
      </div>
    </footer>
  );
}
