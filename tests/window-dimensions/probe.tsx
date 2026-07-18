import useWindowDimensions from "../../src/hooks/useWindowDimensions";

export function WindowDimensionsProbe({ id }: { id: string }) {
  const { width, height } = useWindowDimensions();

  return (
    <output data-dimensions-probe={id}>{`${width}x${height}`}</output>
  );
}
