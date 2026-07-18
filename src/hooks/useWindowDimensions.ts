import { useSyncExternalStore } from "react";

type WindowDimensions = {
  width: number;
  height: number;
};

const serverDimensions: WindowDimensions = { width: 1200, height: 800 };
const subscribers = new Set<() => void>();
let cachedDimensions: WindowDimensions | undefined;

const getServerSnapshot = (): WindowDimensions => serverDimensions;

const getSnapshot = (): WindowDimensions => {
  if (typeof window === "undefined") return getServerSnapshot();

  const width = window.innerWidth;
  const height = window.innerHeight;
  if (
    !cachedDimensions ||
    cachedDimensions.width !== width ||
    cachedDimensions.height !== height
  ) {
    cachedDimensions = { width, height };
  }
  return cachedDimensions;
};

const notifySubscribers = () => {
  subscribers.forEach((subscriber) => subscriber());
};

const subscribe = (subscriber: () => void) => {
  subscribers.add(subscriber);
  if (subscribers.size === 1 && typeof window !== "undefined") {
    window.addEventListener("resize", notifySubscribers);
  }

  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("resize", notifySubscribers);
    }
  };
};

const useWindowDimensions = (): WindowDimensions =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

export default useWindowDimensions;
