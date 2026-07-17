export const STRICT_PARITY_THRESHOLDS = Object.freeze({
  visual: {
    maxDifferentPixels: 0,
    pixelmatchThreshold: 0,
  },
  geometry: {
    maxAbsoluteDifferencePx: 0.01,
  },
  interaction: {
    maxPositionDifferencePx: 0.01,
    maxScaleDifference: 0.000001,
  },
  trajectory: {
    sampleStepMs: 1000 / 60,
    maxPositionDifferencePx: 0.25,
    maxScaleDifference: 0.00025,
    maxStageTimingDifferenceMs: 1000 / 60,
  },
  performance: {
    maxRatio: 1.15,
    minimumAbsoluteRegressionMs: 2,
  },
});
