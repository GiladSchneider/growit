import "~/styles/globals.css";

import { type Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";

import { AppShell } from "~/app/_components/app-shell";
import { TooltipProvider } from "~/components/ui/tooltip";
import { TRPCReactProvider } from "~/trpc/react";
import { HydrateClient, api } from "~/trpc/server";

export const metadata: Metadata = {
  title: "growit",
  description: "Cap table, distribution waterfall and distributions engine",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans",
});

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Load the data the pages need on the server, so the first paint already has it instead of
  // showing skeletons while the browser fetches. HydrateClient hands it to the client cache, and
  // because layouts persist across navigation, later page switches read from that cache.
  await Promise.all([
    api.investments.list.prefetch(),
    api.waterfall.get.prefetch(),
    api.distributions.list.prefetch(),
  ]);

  return (
    <html lang="en" className={`${inter.variable} ${plusJakartaSans.variable}`}>
      <body>
        <TRPCReactProvider>
          <HydrateClient>
            <TooltipProvider delayDuration={200}>
              <AppShell>{children}</AppShell>
            </TooltipProvider>
          </HydrateClient>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
