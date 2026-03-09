import type {Metadata} from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import './globals.css'; // Global styles

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'PRO DJ STUDIO',
  description: 'Virtual DJ Studio',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`dark ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-background font-display text-slate-200 min-h-screen flex flex-col antialiased transition-colors duration-300" suppressHydrationWarning>
        {children}
        <Toaster position="bottom-right" toastOptions={{
          style: {
            background: 'var(--color-slate-900)',
            color: 'var(--color-slate-200)',
            border: '1px solid var(--color-slate-800)',
          },
          success: {
            iconTheme: {
              primary: 'var(--color-accent)',
              secondary: 'var(--color-slate-900)',
            },
          },
        }} />
      </body>
    </html>
  );
}
