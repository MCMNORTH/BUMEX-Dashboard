"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => undefined;

export function useMounted() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}
