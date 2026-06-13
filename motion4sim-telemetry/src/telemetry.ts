import type { MotorTelemetry, TelemetryFrame } from "./types";

export function parseTelemetry(buffer: ArrayBuffer): TelemetryFrame | null {
  const view = new DataView(buffer);

  let offset = 0;

  if (view.byteLength < 8) {
    return null;
  }

  const magic = view.getUint32(offset, true);
  offset += 4;

  if (magic !== 0xaabbccdd) {
    return null;
  }

  const count = view.getUint16(offset, true);
  offset += 2;

  const headerReserved = view.getUint16(offset, true);
  offset += 2;

  const expectedLength = 8 + count * 16;

  if (view.byteLength !== expectedLength) {
    return null;
  }

  const motors: MotorTelemetry[] = [];

  for (let i = 0; i < count; i++) {
    const position = view.getInt32(offset, true);
    offset += 4;

    const speed = view.getFloat32(offset, true);
    offset += 4;

    const torque = view.getFloat32(offset, true);
    offset += 4;

    const status = view.getUint16(offset, true);
    offset += 2;

    const reserved = view.getUint16(offset, true);
    offset += 2;

    motors.push({
      index: i + 1,
      position,
      speed,
      torque,
      status,
      reserved
    });
  }

  return {
    magic,
    count,
    headerReserved,
    motors
  };
}
