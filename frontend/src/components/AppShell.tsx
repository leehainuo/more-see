import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

  const getClampedPosition = (left: number, top: number, width: number, height: number) => {
    const maxLeft = Math.max(16, window.innerWidth - width - 16);
    const maxTop = Math.max(108, window.innerHeight - height - 16);

    return {
      left: Math.min(Math.max(16, left), maxLeft),
      top: Math.min(Math.max(108, top), maxTop),
    };
  };

  useLayoutEffect(() => {
    const panel = floatingPanelRef.current;
    if (!panel || !floatingPanel) {
      return;
    }

    const rect = panel.getBoundingClientRect();
    const nextPosition = getClampedPosition(rect.left, rect.top, rect.width, rect.height);
    setFloatingPosition((current) =>
      current && current.left === nextPosition.left && current.top === nextPosition.top ? current : nextPosition,
    );
  }, [floatingPanel]);

  useEffect(() => {
    if (!floatingPanelRef.current) {
      return;
    }

    const clampPosition = () => {
      const panel = floatingPanelRef.current;
      if (!panel) {
        return;
      }

      setFloatingPosition((current) =>
        current
          ? getClampedPosition(current.left, current.top, panel.offsetWidth, panel.offsetHeight)
          : getClampedPosition(panel.getBoundingClientRect().left, panel.getBoundingClientRect().top, panel.offsetWidth, panel.offsetHeight),
      );
    };

    window.addEventListener("resize", clampPosition);
    return () => window.removeEventListener("resize", clampPosition);
  }, [floatingPanel]);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const panel = floatingPanelRef.current;
      if (!panel) {
        return;
      }

      setFloatingPosition(
        getClampedPosition(
          event.clientX - dragOffsetRef.current.x,
          event.clientY - dragOffsetRef.current.y,
          panel.offsetWidth,
          panel.offsetHeight,
        ),
      );
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
    setFloatingPosition(getClampedPosition(rect.left, rect.top, rect.width, rect.height));
    setIsDragging(true);
  };

  return (
    <div className="min-h-screen bg-background pt-20 text-foreground">
      <TopNav />

      {floatingPanel ? (
        <div
          ref={floatingPanelRef}
          onPointerDown={handleFloatingPanelPointerDown}
          className={cn(
            "pointer-events-none fixed z-40 cursor-grab select-none touch-none active:cursor-grabbing",
            !floatingPosition && "right-4 top-[108px] sm:right-5 lg:right-6",
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
