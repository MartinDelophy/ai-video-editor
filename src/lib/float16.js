export function float16BitsToFloat32(value) {
  const sign = value & 0x8000 ? -1 : 1;
  const exponent = (value >>> 10) & 0x1f;
  const mantissa = value & 0x3ff;
  if (exponent === 0) return sign * 2 ** -14 * (mantissa / 1024);
  if (exponent === 0x1f) return mantissa ? Number.NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + mantissa / 1024);
}

export function readFloat16TensorValue(data, index) {
  if (data?.constructor?.name === "Float16Array") return Number(data[index]);
  return float16BitsToFloat32(data[index]);
}
