// Small joint-bilateral pass: source edges guide smoothing, while the depth
// difference gate prevents crossing foreground/background boundaries. Source
// texture never creates a new depth feature; it only reduces mixing.
export function writeDepthPixels(values, rgba, width = 0, height = 0, source = null) {
  let minimum = Infinity;
  let maximum = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    minimum = Math.min(minimum, values[i]);
    maximum = Math.max(maximum, values[i]);
  }
  const range = maximum - minimum;
  const scale = range > 0 ? 1 / range : 0;
  const guided = source?.length === values.length * 4 && width * height === values.length;
  for (let i = 0; i < values.length; i += 1) {
    const center = (values[i] - minimum) * scale;
    let value = center;
    if (guided) {
      const x = i % width;
      const y = Math.floor(i / width);
      let sum = center * 2;
      let total = 2;
      const offset = i * 4;
      for (let direction = 0; direction < 4; direction += 1) {
        if ((direction === 0 && x === 0) || (direction === 1 && x === width - 1)
          || (direction === 2 && y === 0) || (direction === 3 && y === height - 1)) continue;
        const neighbor = i + (direction === 0 ? -1 : direction === 1 ? 1 : direction === 2 ? -width : width);
        const depth = (values[neighbor] - minimum) * scale;
        const difference = (depth - center) / .025;
        const pixel = neighbor * 4;
        const red = source[pixel] - source[offset];
        const green = source[pixel + 1] - source[offset + 1];
        const blue = source[pixel + 2] - source[offset + 2];
        const weight = 1 / (1 + difference * difference * 4)
          / (1 + (red * red + green * green + blue * blue) / 1200);
        sum += depth * weight;
        total += weight;
      }
      value = sum / total;
    }
    const pixel = i * 4;
    const gray = Math.round(Math.max(0, Math.min(1, value)) * 255);
    rgba[pixel] = gray;
    rgba[pixel + 1] = gray;
    rgba[pixel + 2] = gray;
    rgba[pixel + 3] = 255;
  }
}
