import type * as React from "react";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

export function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:border group-[.toaster]:border-black/10 group-[.toaster]:bg-white group-[.toaster]:text-zinc-900 group-[.toaster]:shadow-[0_18px_44px_rgba(0,0,0,0.12)]",
          description: "group-[.toast]:text-zinc-500",
          actionButton: "group-[.toast]:bg-black group-[.toast]:text-white",
          cancelButton: "group-[.toast]:bg-zinc-100 group-[.toast]:text-zinc-700",
        },
      }}
      {...props}
    />
  );
}
