import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

import { AppShell } from "~/app/_components/app-shell";
import { TooltipProvider } from "~/components/ui/tooltip";
import { TRPCReactProvider } from "~/trpc/react";
import { HydrateClient, api } from "~/trpc/server";

export const metadata: Metadata = {
  title: "GrowIt Distributions",
  description: "Cap table, distribution waterfall and distributions engine",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Load the data the pages need on the server, so the first paint already has it instead of
  // showing skeletons while the browser fetches. HydrateClient hands it to the client cache, and
  // because layouts persist across navigation, later page switches read from that cache.
  await Promise.all([
    api.investors.list.prefetch(),
    api.waterfall.get.prefetch(),
    api.distributions.list.prefetch(),
  ]);

  return (
    <html lang="en" className={`${geist.variable}`}>
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
