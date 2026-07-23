import { useEffect, useMemo, useRef, useState } from "react";
import { parseTelemetry } from "./telemetry";
import type { MotorTelemetry } from "./types";
import "./App.css";

type MotorLoad = MotorTelemetry & {
  load: number;
  loadPercent: number;
  angleDegrees: number;
  x: number;
  y: number;
};

const MOTOR_ANGLES: Record<number, number> = {
  1: 60,
  2: 0,
  3: 300,
  4: 240,
  5: 180,
  6: 120,
};

const SENSITIVITY_OPTIONS = [
  { value: 1, label: "Normal", description: "Current scale" },
  { value: 2, label: "Fine", description: "2x movement" },
  { value: 4, label: "Very fine", description: "4x movement" },
  { value: 8, label: "Super fine", description: "8x movement" },
] as const;

export default function App() {
  const [controllerIp, setControllerIp] = useState("192.168.50.88");
  const [connected, setConnected] = useState(false);
  const [motors, setMotors] = useState<MotorTelemetry[]>([]);
  const [lastFrameTime, setLastFrameTime] = useState<string>("-");
  const [error, setError] = useState<string>("");
  const [sensitivity, setSensitivity] = useState(() => {
    const saved = Number(window.localStorage.getItem("load-map-sensitivity"));
    return SENSITIVITY_OPTIONS.some((option) => option.value === saved) ? saved : 1;
  });

  const wsRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<number | null>(null);

  function stopKeepAlive() {
    if (pingTimerRef.current !== null) {
      window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }

  function startKeepAlive(ws: WebSocket) {
    stopKeepAlive();

    pingTimerRef.current = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(new Uint8Array([0x89, 0x00]));
      }
    }, 2000);
  }

  function disconnect() {
    stopKeepAlive();
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }

  function connect() {
    disconnect();
    setError("");

    const ws = new WebSocket(`ws://${controllerIp}/ws`);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      wsRef.current = ws;
      setConnected(true);
      startKeepAlive(ws);
    };

    ws.onmessage = (event) => {
      if (!(event.data instanceof ArrayBuffer)) {
        return;
      }

      const frame = parseTelemetry(event.data);
      if (!frame) {
        return;
      }

      setMotors(frame.motors);
      setLastFrameTime(new Date().toLocaleTimeString());
    };

    ws.onerror = () => setError("Could not communicate with the controller.");

    ws.onclose = () => {
      stopKeepAlive();
      setConnected(false);
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };
  }

  useEffect(
    () => () => {
      if (pingTimerRef.current !== null) {
        window.clearInterval(pingTimerRef.current);
      }
      wsRef.current?.close();
    },
    [],
  );

  useEffect(() => {
    window.localStorage.setItem("load-map-sensitivity", String(sensitivity));
  }, [sensitivity]);

  const loadData = useMemo(() => calculateLoad(motors), [motors]);
  const torqueFieldIsZero =
    motors.length > 0 && motors.every((motor) => motor.torqueBits === 0);
  const balanceLabel =
    loadData.balanceScore >= 90
      ? "Centered"
      : loadData.balanceScore >= 70
        ? "Slightly offset"
        : "Needs adjustment";

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">Motion4Sim telemetry</p>
          <h1>Platform load balance</h1>
        </div>
        <div className="connection-summary">
          <span className={`status-dot ${connected ? "online" : ""}`} />
          <span>{connected ? "Live telemetry" : "Controller offline"}</span>
          <small>Last frame {lastFrameTime}</small>
        </div>
      </header>

      <section className="connection-panel">
        <label>
          <span>Controller IP</span>
          <input
            value={controllerIp}
            onChange={(event) => setControllerIp(event.target.value)}
            disabled={connected}
          />
        </label>
        <button className="primary-button" onClick={connect} disabled={connected}>
          Connect
        </button>
        <button className="secondary-button" onClick={disconnect} disabled={!connected}>
          Disconnect
        </button>
      </section>

      {error && <div className="error">{error}</div>}

      {motors.length === 0 ? (
        <section className="empty-state">
          <div className="empty-platform">
            <span />
          </div>
          <p className="eyebrow">Waiting for telemetry</p>
          <h2>Connect to see the platform load</h2>
          <p>Every detected motor will appear here at the same time.</p>
        </section>
      ) : (
        <>
          {torqueFieldIsZero && (
            <div className="telemetry-warning">
              <strong>The controller is transmitting zero for every torque field.</strong>
              <span>
                Raw torque bytes are <code>00 00 00 00</code> for all motors, so the
                dashboard has no load signal to calculate from.
              </span>
            </div>
          )}

          <section className="overview-grid">
            <article className="balance-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Live estimate</p>
                  <h2>Load center</h2>
                </div>
                <div className="balance-controls">
                  <label className="sensitivity-control">
                    <span>View sensitivity</span>
                    <select
                      value={sensitivity}
                      onChange={(event) => setSensitivity(Number(event.target.value))}
                    >
                      {SENSITIVITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label} ({option.description})
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className={`balance-badge score-${balanceLabel.toLowerCase().replace(" ", "-")}`}>
                    {balanceLabel}
                  </span>
                </div>
              </div>

              <PlatformMap
                motors={loadData.motors}
                centerX={loadData.centerX}
                centerY={loadData.centerY}
                sensitivity={sensitivity}
              />

              <p className="map-note">
                Marker movement is shown at {sensitivity}x. Numeric values and balance
                score remain unscaled. Forward is up.
              </p>
            </article>

            <aside className="summary-cards">
              <article className="summary-card accent">
                <span>Balance score</span>
                <strong>{formatNumber(loadData.balanceScore, 0)}%</strong>
                <div className="score-track">
                  <span style={{ width: `${loadData.balanceScore}%` }} />
                </div>
                <p className="value-definition">
                  100% is centered; the score falls as the load center moves outward.
                </p>
              </article>
              <article className="summary-card">
                <span>Total absolute torque (raw)</span>
                <strong>{formatNumber(loadData.totalLoad)}</strong>
                <small>Across {motors.length} motors</small>
                <p className="value-definition">
                  Sum of all motor torque magnitudes, ignoring direction.
                </p>
              </article>
              <article className="summary-card axis-card">
                <div>
                  <span>Left / right</span>
                  <strong>{formatOffset(loadData.centerX, "left", "right")}</strong>
                  <p className="value-definition">Sideways offset from platform center.</p>
                </div>
                <div>
                  <span>Front / rear</span>
                  <strong>{formatOffset(loadData.centerY, "front", "rear")}</strong>
                  <p className="value-definition">Longitudinal offset from platform center.</p>
                </div>
              </article>
            </aside>
          </section>

          <section className="motor-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Individual telemetry</p>
                <h2>All motors</h2>
                <p className="section-definition">
                  Load share is each motor's portion of total absolute torque.
                </p>
              </div>
              <span className="motor-count">{motors.length} active</span>
            </div>

            <div className="motor-grid">
              {loadData.motors.map((motor) => (
                <MotorCard key={motor.index} motor={motor} />
              ))}
            </div>
          </section>

          <section className="raw-panel">
            <details>
              <summary>Raw telemetry</summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Motor</th>
                      <th title="Raw position value reported by the controller.">Position</th>
                      <th title="Motor speed reported by the controller.">Speed</th>
                      <th title="Signed raw torque value reported by the controller.">
                        Torque (raw)
                      </th>
                      <th title="The four little-endian bytes used to decode raw torque.">
                        Torque bytes
                      </th>
                      <th title="This motor's share of total absolute torque.">Load share</th>
                      <th title="Raw controller status word.">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadData.motors.map((motor) => (
                      <tr key={motor.index}>
                        <td>Motor {motor.index}</td>
                        <td>{motor.position}</td>
                        <td>{formatNumber(motor.speed)}</td>
                        <td>{formatTelemetryNumber(motor.torque)}</td>
                        <td>{formatLittleEndianBytes(motor.torqueBits)}</td>
                        <td>{formatNumber(motor.loadPercent, 1)}%</td>
                        <td>0x{motor.status.toString(16).padStart(4, "0")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        </>
      )}
    </main>
  );
}

function PlatformMap({
  motors,
  centerX,
  centerY,
  sensitivity,
}: {
  motors: MotorLoad[];
  centerX: number;
  centerY: number;
  sensitivity: number;
}) {
  const displayCenter = scaleCenterForDisplay(centerX, centerY, sensitivity);

  return (
    <div className="platform-map" aria-label="Top-down platform load map">
      <div className="platform-surface">
        <span className="crosshair horizontal" />
        <span className="crosshair vertical" />
        <span className="target-ring" />
        {motors.map((motor) => (
          <div
            className="map-motor"
            key={motor.index}
            style={{
              left: `${50 + motor.x * 39}%`,
              top: `${50 + motor.y * 39}%`,
              "--load": `${Math.max(0.35, motor.loadPercent / 35)}`,
            } as React.CSSProperties}
          >
            <span>M{motor.index}</span>
            <strong>{formatNumber(motor.loadPercent, 0)}%</strong>
            <small>{motor.angleDegrees}°</small>
          </div>
        ))}
        <div
          className={`load-center ${displayCenter.clamped ? "display-clamped" : ""}`}
          style={{
            left: `${50 + displayCenter.x * 39}%`,
            top: `${50 + displayCenter.y * 39}%`,
          }}
          title={
            displayCenter.clamped
              ? "Amplified marker position is capped at the platform edge."
              : undefined
          }
        >
          <span>
            LOAD CENTER {sensitivity > 1 ? `${sensitivity}x` : ""}
            {displayCenter.clamped ? " MAX" : ""}
          </span>
        </div>
      </div>
      <span className="direction front">↑ FRONT</span>
    </div>
  );
}

function scaleCenterForDisplay(centerX: number, centerY: number, sensitivity: number) {
  const scaledX = centerX * sensitivity;
  const scaledY = centerY * sensitivity;
  const distance = Math.hypot(scaledX, scaledY);
  const maximumDistance = 0.94;

  if (distance <= maximumDistance || distance === 0) {
    return { x: scaledX, y: scaledY, clamped: false };
  }

  const clampScale = maximumDistance / distance;
  return { x: scaledX * clampScale, y: scaledY * clampScale, clamped: true };
}

function MotorCard({ motor }: { motor: MotorLoad }) {
  return (
    <article className="motor-card">
      <header>
        <div>
          <span className="motor-index">{motor.index}</span>
          <h3>Motor {motor.index}</h3>
        </div>
        <span className={`motor-status ${motor.status === 0 ? "ok" : "warning"}`}>
          {motor.status === 0 ? "Ready" : `Status ${motor.status}`}
        </span>
      </header>
      <div className="load-value">
        <strong>{formatNumber(motor.loadPercent, 1)}%</strong>
        <span>of total load</span>
      </div>
      <div className="load-bar">
        <span style={{ width: `${motor.loadPercent}%` }} />
      </div>
      <dl>
        <div>
          <dt title="Signed torque value reported by the controller.">Torque (raw)</dt>
          <dd>{formatTelemetryNumber(motor.torque)}</dd>
        </div>
        <div>
          <dt title="Raw motor position reported by the controller.">Position</dt>
          <dd>{motor.position}</dd>
        </div>
        <div>
          <dt title="Current motor speed reported by the controller.">Speed</dt>
          <dd>{formatNumber(motor.speed)}</dd>
        </div>
      </dl>
    </article>
  );
}

function calculateLoad(motors: MotorTelemetry[]) {
  const totalLoad = motors.reduce((sum, motor) => sum + Math.abs(motor.torque), 0);
  const loadedMotors: MotorLoad[] = motors.map((motor, index) => {
    const angleDegrees =
      MOTOR_ANGLES[motor.index] ?? (index * 360) / Math.max(motors.length, 1);
    const angle = angleDegrees * (Math.PI / 180);
    const load = Math.abs(motor.torque);

    return {
      ...motor,
      load,
      loadPercent: totalLoad > 0 ? (load / totalLoad) * 100 : 0,
      angleDegrees,
      x: Math.cos(angle),
      // CSS y coordinates increase downward, so positive platform angles point upward.
      y: -Math.sin(angle),
    };
  });

  const centerX =
    totalLoad > 0
      ? loadedMotors.reduce((sum, motor) => sum + motor.x * motor.load, 0) / totalLoad
      : 0;
  const centerY =
    totalLoad > 0
      ? loadedMotors.reduce((sum, motor) => sum + motor.y * motor.load, 0) / totalLoad
      : 0;
  const distanceFromCenter = Math.min(1, Math.hypot(centerX, centerY));
  const balanceScore = totalLoad > 0 ? (1 - distanceFromCenter) * 100 : 100;

  return { motors: loadedMotors, totalLoad, centerX, centerY, balanceScore };
}

function formatOffset(value: number, negativeDirection: string, positiveDirection: string) {
  if (Math.abs(value) < 0.0005) {
    return "Centered";
  }

  const direction = value > 0 ? positiveDirection : negativeDirection;
  return `${formatNumber(Math.abs(value) * 100, 1)}% ${direction}`;
}

function formatNumber(value: number, decimals = 2) {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  return value.toFixed(decimals);
}

function formatTelemetryNumber(value: number) {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  if (value !== 0 && Math.abs(value) < 0.01) {
    return value.toExponential(4);
  }

  return value.toFixed(4);
}

function formatLittleEndianBytes(value: number) {
  return [0, 8, 16, 24]
    .map((shift) => ((value >>> shift) & 0xff).toString(16).padStart(2, "0"))
    .join(" ");
}
