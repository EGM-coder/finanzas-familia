import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from 'next/font/google'
import { Toaster } from 'sonner'
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geist = Geist({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-geist',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500'],
  variable: "--font-geist-mono",
  display: 'swap',
});

const newsreader = Newsreader({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "EGMFin",
  description: "Control presupuestario familiar",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning className={`${newsreader.variable} ${geist.variable} ${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased egm">
        {children}
        <Toaster
          position="bottom-center"
          duration={5000}
          visibleToasts={3}
          toastOptions={{
            classNames: {
              toast: 'egm-toast',
              title: 'egm-toast-title',
              description: 'egm-toast-description',
              actionButton: 'egm-toast-action',
              cancelButton: 'egm-toast-cancel',
            },
          }}
        />
      </body>
    </html>
  );
}
