"use client";

import { useIsPresent } from "motion/react";
import type { ReactNode } from "react";

export function PresenceGate({ children }: {
  children: (props: { isPresent: boolean; gate: { inert: boolean; style: { pointerEvents: "auto" | "none" } } }) => ReactNode;
}) {
  const isPresent = useIsPresent();
  return children({ isPresent, gate: { inert: !isPresent, style: { pointerEvents: isPresent ? "auto" : "none" } } });
}
