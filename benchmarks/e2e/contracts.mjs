/** This function is evaluated in the browser. Keep it self-contained. */
export function captureDomContract() {
  const round = (value) => Math.round(value * 1_000) / 1_000;
  const styleProperties = [
    "display",
    "visibility",
    "opacity",
    "transform",
    "transformOrigin",
    "pointerEvents",
    "position",
    "overflow",
    "width",
    "height",
    "backgroundColor",
    "backgroundImage",
    "borderRadius",
    "borderTopWidth",
    "filter",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "color",
  ];

  const descriptors = [
    ["root", "[data-testid='benchmark-root']"],
    ["viewport", "[data-benchmark-viewport='true']"],
    ["scene", "[data-benchmark-scene='true']"],
    ["toolbar", "[data-toolbar-button]"],
    ["background", "[data-benchmark-contract='background']"],
    ["home", "[data-benchmark-contract='home']"],
    ["lab", "[data-benchmark-contract='lab']"],
    ["drag", "[data-benchmark-contract='drag']"],
    ["drag-image", "img[alt='Benchmark draggable shape']"],
    ["intro-logo", "img[alt='Benchmark intro logo']"],
    ["intro-content", "[data-benchmark-contract='default-intro-content']"],
    ["nav-home", "button[aria-label='Home']"],
    ["nav-lab", "button[aria-label='Lab']"],
    ["nav-drag", "button[aria-label='Drag']"],
  ];

  const captureElement = ([name, selector]) => {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLElement || element instanceof SVGElement)) {
      return { name, selector, present: false };
    }
    const rect = element.getBoundingClientRect();
    const computed = getComputedStyle(element);
    const attributes = Object.fromEntries(
      Array.from(element.attributes)
        .filter((attribute) => attribute.name !== "style")
        .map((attribute) => [attribute.name, attribute.value])
        .sort(([a], [b]) => a.localeCompare(b)),
    );
    return {
      name,
      selector,
      present: true,
      structure: {
        tagName: element.tagName.toLowerCase(),
        attributes,
        childElementCount: element.childElementCount,
        text:
          name === "scene" || name === "viewport" || name === "root"
            ? ""
            : (element.textContent ?? "").replace(/\s+/g, " ").trim(),
      },
      geometry: {
        x: round(rect.x),
        y: round(rect.y),
        width: round(rect.width),
        height: round(rect.height),
        top: round(rect.top),
        right: round(rect.right),
        bottom: round(rect.bottom),
        left: round(rect.left),
      },
      styles: Object.fromEntries(
        styleProperties.map((property) => [property, computed[property]]),
      ),
    };
  };

  const svgs = Array.from(document.querySelectorAll("svg")).map((svg, index) => {
    const rect = svg.getBoundingClientRect();
    return {
      key: svg.getAttribute("aria-label") || `svg-${index}`,
      geometry: {
        x: round(rect.x),
        y: round(rect.y),
        width: round(rect.width),
        height: round(rect.height),
      },
      outerHTML: svg.outerHTML.replace(/>\s+</g, "><").trim(),
    };
  });

  return {
    url: `${location.pathname}${location.search}`,
    viewport: {
      width: innerWidth,
      height: innerHeight,
      devicePixelRatio,
    },
    elements: descriptors.map(captureElement),
    svgs,
  };
}
