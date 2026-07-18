import { renderToString } from "react-dom/server";
import { WindowDimensionsProbe } from "./probe";

export const renderWindowDimensionsProbe = () =>
  renderToString(<WindowDimensionsProbe id="server" />);
