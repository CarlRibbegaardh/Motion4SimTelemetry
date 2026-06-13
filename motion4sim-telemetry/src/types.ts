export interface MotorTelemetry {
  index: number;
  position: number;
  speed: number;
  torque: number;
  status: number;
  reserved: number;
}

export interface TelemetryFrame {
  magic: number;
  count: number;
  headerReserved: number;
  motors: MotorTelemetry[];
}