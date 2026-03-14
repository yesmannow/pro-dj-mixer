'use client';

interface CRTTerminalProps {
  children: React.ReactNode;
}

/** Passthrough wrapper — CRT effects have been removed for performance. */
export function CRTTerminal({ children }: CRTTerminalProps) {
  return <>{children}</>;
}
