import { createRoot } from "react-dom/client";
import { ProfiledBenchmarkApplication } from "./App";
import { parseBenchmarkConfig } from "./config";
import { installBenchmark } from "./metrics";
import "./styles.css";

const config = parseBenchmarkConfig(window.location.search);
installBenchmark(config);

const root = document.getElementById("root");
if (!root) throw new Error("Benchmark root element was not found");

createRoot(root).render(<ProfiledBenchmarkApplication config={config} />);
