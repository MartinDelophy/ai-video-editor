import { describe, expect, it } from "vitest";
import { float16BitsToFloat32, readFloat16TensorValue } from "./float16.js";

describe("float16 tensor decoding", () => {
  it("decodes legacy Uint16 bit patterns", () => {
    expect(float16BitsToFloat32(0x3c00)).toBe(1);
    expect(readFloat16TensorValue(new Uint16Array([0x3800]), 0)).toBe(0.5);
  });

  it("does not decode native Float16Array values twice", () => {
    const NativeFloat16Like = class Float16Array extends Array {};
    const values = new NativeFloat16Like();
    values.push(0.625);
    expect(readFloat16TensorValue(values, 0)).toBe(0.625);
  });
});
