"use client";

import { Layers, Users, Wallet, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";

import { cn } from "~/lib/utils";
import {
  WaterfallDraftProvider,
  useWaterfallDraft,
} from "./waterfall-draft-context";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/cap-table", label: "Cap table", icon: Users },
  { href: "/waterfall", label: "Waterfall", icon: Layers },
  { href: "/distributions", label: "Distributions", icon: Wallet },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <WaterfallDraftProvider>
      <div className="lg:flex">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <MobileNav />
          <main className="mx-auto max-w-6xl px-5 py-8 lg:px-10 lg:py-10">
            {children}
          </main>
        </div>
      </div>
      <Toaster position="bottom-right" richColors closeButton />
    </WaterfallDraftProvider>
  );
}

function Logo() {
  return (
    <Link href="/cap-table" className="flex items-center">
      <Image
        src="/growit-logo.webp"
        alt="growit"
        width={640}
        height={204}
        priority
        className="h-8 w-auto"
      />
    </Link>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const { dirty } = useWaterfallDraft();

  return (
    <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r lg:flex">
      <div className="px-5 py-5">
        <Logo />
      </div>
      <nav className="px-3" aria-label="Main">
        <ul className="space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <li key={href}>
                <Link
                  href={href}
                  // Fully prefetch every page (in production builds) so a click switches instantly.
                  prefetch
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  <span className="flex-1">{label}</span>
                  {href === "/waterfall" && dirty && (
                    <span
                      className="size-1.5 rounded-full bg-amber-500"
                      title="Unsaved changes"
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}

function MobileNav() {
  const pathname = usePathname();
  const { dirty } = useWaterfallDraft();
  return (
    <div className="bg-sidebar text-sidebar-foreground border-sidebar-border sticky top-0 z-30 border-b lg:hidden">
      <div className="px-5 pt-4">
        <Logo />
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 py-3" aria-label="Main">
        {NAV.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            prefetch
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
              pathname === href
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70",
            )}
          >
            {label}
            {href === "/waterfall" && dirty && (
              <span className="size-1.5 rounded-full bg-amber-500" />
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}
