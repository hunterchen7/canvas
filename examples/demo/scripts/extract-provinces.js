import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import svgPathBounds from 'svg-path-bounds';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read the SVG file
let svgContent = readFileSync(join('/Users/hunterchen/Downloads/Canada_blank_map.svg'), 'utf-8');

// Province/territory IDs and their names
const provinces = {
  'BC': 'British Columbia',
  'AB': 'Alberta',
  'SK': 'Saskatchewan',
  'MB': 'Manitoba',
  'ON': 'Ontario',
  'QC': 'Quebec',
  'NB': 'New Brunswick',
  'NS': 'Nova Scotia',
  'PE': 'Prince Edward Island',
  'NL': 'Newfoundland and Labrador',
  'YT': 'Yukon',
  'NT': 'Northwest Territories',
  'NU': 'Nunavut'
};

// Create output directory
const outputDir = join(__dirname, '../public/provinces');
try {
  mkdirSync(outputDir, { recursive: true });
} catch (e) {
  // Directory exists
}

// Extract defs section (contains masks, clipPaths, etc.)
const defsMatch = svgContent.match(/<defs[^>]*>[\s\S]*?<\/defs>/);
const defs = defsMatch ? defsMatch[0] : '';

// Extract style section
const styleMatch = svgContent.match(/<style[^>]*>[\s\S]*?<\/style>/);
const style = styleMatch ? styleMatch[0] : '';

// Original viewBox from the SVG
const viewBox = "-24500 -27050 55700 47100";

// Generate a list of distinct colors for each province
const colors = [
  '#FF6B6B', // Red - BC
  '#4ECDC4', // Teal - AB
  '#45B7D1', // Blue - SK
  '#FFA07A', // Light Salmon - MB
  '#98D8C8', // Mint - ON
  '#F7DC6F', // Yellow - QC
  '#BB8FCE', // Purple - NB
  '#85C1E2', // Light Blue - NS
  '#F8B88B', // Peach - PE
  '#52B788', // Green - NL
  '#FF8C94', // Pink - YT
  '#A8E6CF', // Light Green - NT
  '#FFD3B6'  // Light Orange - NU
];

const colorMap = {};
const provinceIds = Object.keys(provinces);
provinceIds.forEach((id, index) => {
  colorMap[id] = colors[index % colors.length];
});

// Function to extract all numeric coordinates from SVG content
function extractAllCoordinates(svgContent) {
  const coords = { x: [], y: [] };

  // Extract from path d attributes, but skip the background mask path
  const pathRegex = /d="([^"]*)"/g;
  let match;

  while ((match = pathRegex.exec(svgContent)) !== null) {
    const pathData = match[1];

    // Skip the background rectangle mask (m-24500-27050h55700v47100h-55700z)
    if (pathData === 'm-24500-27050h55700v47100h-55700z') {
      continue;
    }

    // Skip defs and other non-path data attributes
    if (pathData.includes('defs') || pathData === 'all') {
      continue;
    }

    // Match all numbers (including decimals and negatives)
    const numbers = pathData.match(/-?\d+(?:\.\d+)?/g) || [];

    for (let i = 0; i < numbers.length; i++) {
      const num = parseFloat(numbers[i]);
      if (i % 2 === 0) coords.x.push(num);
      else coords.y.push(num);
    }
  }

  // Extract from use elements (position)
  const useRegex = /<use[^>]*x="([^"]*)"[^>]*y="([^"]*)"/g;
  while ((match = useRegex.exec(svgContent)) !== null) {
    coords.x.push(parseFloat(match[1]));
    coords.y.push(parseFloat(match[2]));
  }

  return coords;
}

// Calculate bounds using accurate path parsing (handles arcs/curves)
function calculateBounds(svgContent, originalViewBox) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasGeometry = false;

  const pathRegex = /d="([^"]*)"/g;
  let match;

  while ((match = pathRegex.exec(svgContent)) !== null) {
    const pathData = match[1];

    // Skip the background rectangle mask (m-24500-27050h55700v47100h-55700z)
    if (pathData === 'm-24500-27050h55700v47100h-55700z') {
      continue;
    }

    // Skip defs and other non-path data attributes
    if (pathData.includes('defs') || pathData === 'all') {
      continue;
    }

    try {
      const [pMinX, pMinY, pMaxX, pMaxY] = svgPathBounds(pathData);
      if (!Number.isFinite(pMinX) || !Number.isFinite(pMinY) || !Number.isFinite(pMaxX) || !Number.isFinite(pMaxY)) {
        continue;
      }
      minX = Math.min(minX, pMinX);
      minY = Math.min(minY, pMinY);
      maxX = Math.max(maxX, pMaxX);
      maxY = Math.max(maxY, pMaxY);
      hasGeometry = true;
    } catch (err) {
      // Ignore malformed paths
    }
  }

  if (!hasGeometry) {
    return null;
  }

  const width = maxX - minX;
  const height = maxY - minY;

  // Add 5% padding
  const padding = Math.max(width, height) * 0.05;

  return {
    x: minX - padding,
    y: minY - padding,
    width: width + padding * 2,
    height: height + padding * 2
  };

}

// Function to extract a group by ID and find its matching closing tag
function extractGroup(content, groupId) {
  const groupRegex = new RegExp(`<g[^>]*id="${groupId}"[^>]*>`, 'i');
  const match = content.match(groupRegex);

  if (!match || match.index === undefined) {
    return null;
  }

  const searchPos = match.index + match[0].length;
  const remaining = content.substring(searchPos);

  let result = '';
  let depth = 1;
  let charIndex = 0;

  // Count <g and </g> to find matching closing tag
  while (depth > 0 && charIndex < remaining.length) {
    if (remaining.substring(charIndex).match(/^<g[^>]*>/i)) {
      depth++;
      const m = remaining.substring(charIndex).match(/^<g[^>]*>/i)[0];
      result += m;
      charIndex += m.length;
    } else if (remaining.substring(charIndex).match(/^<\/g\s*>/i)) {
      depth--;
      const m = remaining.substring(charIndex).match(/^<\/g\s*>/i)[0];
      if (depth > 0) {
        result += m;
      }
      charIndex += m.length;
    } else {
      result += remaining[charIndex];
      charIndex++;
    }
  }

  return { openTag: match[0], content: result };
}

// Extract each province to its own SVG file
for (const [id, name] of Object.entries(provinces)) {
  // Extract main province group
  const provinceData = extractGroup(svgContent, id);

  if (!provinceData) {
    console.log(`Could not find group for ${id} (${name})`);
    continue;
  }

  // Extract corresponding islands group if it exists
  const islandGroupId = `i-CA-${id}`;
  const islandData = extractGroup(svgContent, islandGroupId);

  // Build the combined content
  let combinedContent = `<g id="${id}" fill="${colorMap[id]}">${provinceData.content}</g>`;

  if (islandData) {
    // Add islands group with same color
    combinedContent += `\n  <g id="${islandGroupId}" fill="${colorMap[id]}">${islandData.content}</g>`;
  }

  // Build SVG with original viewBox first
  let provinceSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${viewBox}">
  <title>${name}</title>
  ${style}
  ${defs}
  ${combinedContent}
</svg>`;

  // Calculate bounding box using only the province/island geometry (ignore defs/masks)
  const bounds = calculateBounds(combinedContent, viewBox);
  const viewBoxValue = bounds
    ? `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`
    : viewBox;

  // Rebuild SVG with cropped viewBox if bounds were calculated
  if (bounds) {
    provinceSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${viewBoxValue}">
  <title>${name}</title>
  ${style}
  ${defs}
  ${combinedContent}
</svg>`;
  }

  const filename = `${id.toLowerCase()}.svg`;
  writeFileSync(join(outputDir, filename), provinceSvg);
  console.log(`Created ${filename} (${name})`);
}

console.log('\nDone! Province SVGs saved to:', outputDir);


