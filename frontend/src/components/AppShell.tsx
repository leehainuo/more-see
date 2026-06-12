import { useEffect, useRef, useState } from "react";
import type * as React from "react";

import { TopNav } from "@/components/TopNav";
import { cn } from "@/lib/utils";

type AppShellProps = {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  narrow?: boolean;
  floatingPanel?: React.ReactNode;
  floatingPanelClassName?: string;
};

export function AppShell({
  eyebrow,
  title,
  children,
  narrow = false,
  floatingPanel,
  floatingPanelClassName,
}: AppShellProps) {
  const floatingPanelRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [floatingPosition, setFloatingPosition] = useState<{ left: number; top: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!floatingPosition || !floatingPanelRef.current) {
      return;
    }

    const clampPosition = () => {
      const panel = floatingPanelRef.current;
      if (!panel) {
        return;
      }

      const maxLeft = Math.max(16, window.innerWidth - panel.offsetWidth - 16);
      const maxTop = Math.max(92, window.innerHeight - panel.offsetHeight - 16);

      setFloatingPosition((current) =>
        current
          ? {
              left: Math.min(Math.max(16, current.left), maxLeft),
              top: Math.min(Math.max(92, current.top), maxTop),
            }
          : current,
      );
    };

    window.addEventListener("resize", clampPosition);
    return () => window.removeEventListener("resize", clampPosition);
  }, [floatingPosition]);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const panel = floatingPanelRef.current;
      if (!panel) {
        return;
      }

      const maxLeft = Math.max(16, window.innerWidth - panel.offsetWidth - 16);
      const maxTop = Math.max(92, window.innerHeight - panel.offsetHeight - 16);

      setFloatingPosition({
        left: Math.min(Math.max(16, event.clientX - dragOffsetRef.current.x), maxLeft),
        top: Math.min(Math.max(92, event.clientY - dragOffsetRef.current.y), maxTop),
      });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isDragging]);

  const handleFloatingPanelPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!floatingPanelRef.current) {
      return;
    }

    const rect = floatingPanelRef.current.getBoundingClientRect();
    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    setFloatingPosition({
      left: rect.left,
      top: rect.top,
    });
    setIsDragging(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />

      {floatingPanel ? (
        <div
          ref={floatingPanelRef}
          onPointerDown={handleFloatingPanelPointerDown}
          className={cn(
            "pointer-events-none fixed z-40 cursor-grab select-none touch-none active:cursor-grabbing",
            !floatingPosition && "right-4 top-[92px] sm:right-5 lg:right-6",
            floatingPanelClassName,
          )}
          style={
            floatingPosition
              ? {
                  left: floatingPosition.left,
                  top: floatingPosition.top,
                }
              : undefined
          }
        >
          <div className="pointer-events-auto">{floatingPanel}</div>
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6 lg:px-12">
        <div className="">
          <header className="border-b border-black/10 py-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.26em] text-zinc-500">{eyebrow}</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-black">{title}</h2>
            </div>
          </header>

          <div className={cn("p-5 sm:p-6", narrow && "mx-auto w-full")}>{children}</div>
        </div>
      </div>
    </div>
  );
}
