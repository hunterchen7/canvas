import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { WindowDimensionsProbe } from "./probe";

type ListenerStats = {
  adds: number;
  removes: number;
  active: number;
};

type WindowDimensionsTestApi = {
  mount: (id: string) => void;
  unmount: (id: string) => void;
  unmountServer: () => void;
};

declare global {
  interface Window {
    __WINDOW_DIMENSIONS_LISTENERS__: () => ListenerStats;
    __WINDOW_DIMENSIONS_TEST__: WindowDimensionsTestApi;
  }
}

const serverContainer = document.getElementById("root");
if (!serverContainer) throw new Error("Server-rendered root was not found");

let serverRoot: Root | null = hydrateRoot(
  serverContainer,
  <WindowDimensionsProbe id="server" />,
);
const clientRoots = new Map<string, { container: HTMLElement; root: Root }>();

window.__WINDOW_DIMENSIONS_TEST__ = {
  mount(id) {
    if (clientRoots.has(id)) return;
    const container = document.createElement("div");
    container.dataset.dimensionsRoot = id;
    document.body.append(container);
    const root = createRoot(container);
    clientRoots.set(id, { container, root });
    root.render(<WindowDimensionsProbe id={id} />);
  },
  unmount(id) {
    const entry = clientRoots.get(id);
    if (!entry) return;
    entry.root.unmount();
    entry.container.remove();
    clientRoots.delete(id);
  },
  unmountServer() {
    serverRoot?.unmount();
    serverRoot = null;
  },
};
