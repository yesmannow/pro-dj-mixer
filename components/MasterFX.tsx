export function MasterFX() {
  return (
    <div className="col-span-12 lg:col-span-2 bg-slate-900/80 rounded-xl border border-accent/20 p-4 flex flex-col items-center justify-between transition-colors duration-300">
      <div className="w-full flex flex-col gap-2">
        <label className="text-[9px] uppercase tracking-widest text-accent font-bold text-center">
          Master FX
        </label>
        <select className="bg-black/40 border-slate-800 rounded-lg py-1 text-[10px] focus:ring-accent focus:border-accent text-slate-300 cursor-pointer w-full uppercase">
          <option>Tape Delay</option>
          <option>Flanger</option>
          <option>Gater</option>
        </select>
      </div>
      <button className="w-full py-3 bg-slate-900 border-2 border-red-900/50 rounded-lg text-red-500 text-[10px] font-black tracking-widest hover:bg-red-950/20 transition-all active:scale-95">
        FREEZE
      </button>
    </div>
  );
}
