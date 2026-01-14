// Smart layout algorithm that places provinces without overlap
// Tall provinces are spread out, small ones fill gaps
export function generateProvinceLayout(
  provinces: { name: string; w: number; h: number }[],
  containerWidth: number,
  containerHeight: number
) {
  const padding = 10;
  const gap = 8; // Minimum gap between provinces

  // Sort by height descending - place tallest first
  const sorted = provinces
    .map((p, originalIndex) => ({ ...p, originalIndex }))
    .sort((a, b) => b.h - a.h);

  const positions: {
    x: number;
    y: number;
    w: number;
    h: number;
    originalIndex: number;
  }[] = [];

  // Check if a new rect overlaps with any existing rect
  const overlaps = (x: number, y: number, w: number, h: number) => {
    for (const pos of positions) {
      if (
        x < pos.x + pos.w + gap &&
        x + w + gap > pos.x &&
        y < pos.y + pos.h + gap &&
        y + h + gap > pos.y
      ) {
        return true;
      }
    }
    return false;
  };

  // Create a grid of candidate positions
  const gridStepX = 30;
  const gridStepY = 25;

  for (const prov of sorted) {
    let placed = false;

    // Try to find a non-overlapping position
    // Scan left-to-right, top-to-bottom
    for (
      let y = padding;
      y <= containerHeight - prov.h - padding && !placed;
      y += gridStepY
    ) {
      for (
        let x = padding;
        x <= containerWidth - prov.w - padding && !placed;
        x += gridStepX
      ) {
        if (!overlaps(x, y, prov.w, prov.h)) {
          positions.push({
            x,
            y,
            w: prov.w,
            h: prov.h,
            originalIndex: prov.originalIndex,
          });
          placed = true;
        }
      }
    }

    // Fallback: if no position found, place at a random valid spot anyway
    if (!placed) {
      const x = Math.max(
        padding,
        Math.min(
          containerWidth - prov.w - padding,
          Math.random() * containerWidth
        )
      );
      const y = Math.max(
        padding,
        Math.min(
          containerHeight - prov.h - padding,
          Math.random() * containerHeight
        )
      );
      positions.push({
        x,
        y,
        w: prov.w,
        h: prov.h,
        originalIndex: prov.originalIndex,
      });
    }
  }

  // Return positions in original order
  const result: { x: number; y: number }[] = new Array(provinces.length);
  for (const pos of positions) {
    result[pos.originalIndex] = { x: pos.x, y: pos.y };
  }
  return result;
}
