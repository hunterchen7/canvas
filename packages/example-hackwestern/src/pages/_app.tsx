import { type AppType } from "next/app";
import { JetBrains_Mono, Figtree } from "next/font/google";
import localFont from "next/font/local";

import "../styles/globals.css";
import { Toaster, PerformanceProvider } from "@canvas/core";

const dico = localFont({
  src: "../../public/fonts/dico/Dico.ttf",
  variable: "--font-dico",
  display: "swap",
});

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  fallback: ["Inter", "sans-serif"],
});

const jetbrainsmono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrainsmono",
  fallback: ["monospace"],
});

const MyApp: AppType = ({ Component, pageProps }) => {
  return (
    <PerformanceProvider>
      <main
        className={`${figtree.variable} font-figtree ${jetbrainsmono.variable} font-jetbrains-mono ${dico.variable} font-dico`}
      >
        <Component {...pageProps} />
        <Toaster />
      </main>
    </PerformanceProvider>
  );
};

export default MyApp;
