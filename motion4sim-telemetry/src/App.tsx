import { useEffect, useMemo, useRef, useState } from "react";
import { parseTelemetry } from "./telemetry";
import type { MotorTelemetry } from "./types";
import "./App.css";

type MotorLoad = MotorTelemetry & {
  load: number;
  loadPercent: number;
  x: number;
  y: number;
};

export default function App() {
  const [controllerIp, setControllerIp] = useState("192.168.50.88");
  const [connected, setConnected] = useState(false);
  const [motors, setMotors] = useState<MotorTelemetry[]>([]);
  const [lastFrameTime, setLastFrameTime] = useState<string>("-");
  const [error, setError] = useState<string>("");

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

  const loadData = useMemo(() => calculateLoad(motors), [motors]);
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
          <section className="overview-grid">
            <article className="balance-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Live estimate</p>
                  <h2>Load center</h2>
                </div>
                <span className={`balance-badge score-${balanceLabel.toLowerCase().replace(" ", "-")}`}>
                  {balanceLabel}
                </span>
              </div>

              <PlatformMap
                motors={loadData.motors}
                centerX={loadData.centerX}
                centerY={loadData.centerY}
              />

              <p className="map-note">
                Motor position follows telemetry order. Load is estimated from absolute torque.
              </p>
            </article>

            <aside className="summary-cards">
              <article className="summary-card accent">
                <span>Balance score</span>
                <strong>{formatNumber(loadData.balanceScore, 0)}%</strong>
                <div className="score-track">
                  <span style={{ width: `${loadData.balanceScore}%` }} />
                </div>
              </article>
              <article className="summary-card">
                <span>Total absolute torque</span>
                <strong>{formatNumber(loadData.totalLoad)}</strong>
                <small>Across {motors.length} motors</small>
              </article>
              <article className="summary-card axis-card">
                <div>
                  <span>Left / right</span>
                  <strong>{formatOffset(loadData.centerX, "left", "right")}</strong>
                </div>
                <div>
                  <span>Front / rear</span>
                  <strong>{formatOffset(loadData.centerY, "front", "rear")}</strong>
                </div>
              </article>
            </aside>
          </section>

          <section className="motor-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Individual telemetry</p>
                <h2>All motors</h2>
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
                      <th>Position</th>
                      <th>Speed</th>
                      <th>Torque</th>
                      <th>Load share</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadData.motors.map((motor) => (
                      <tr key={motor.index}>
                        <td>Motor {motor.index}</td>
                        <td>{motor.position}</td>
                        <td>{formatNumber(motor.speed)}</td>
                        <td>{formatNumber(motor.torque)}</td>
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
}: {
  motors: MotorLoad[];
  centerX: number;
  centerY: number;
}) {
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
          </div>
        ))}
        <div
          className="load-center"
          style={{
            left: `${50 + centerX * 39}%`,
            top: `${50 + centerY * 39}%`,
          }}
        >
          <span>LOAD CENTER</span>
        </div>
      </div>
      <span className="direction front">FRONT</span>
    </div>
  );
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
          <dt>Torque</dt>
          <dd>{formatNumber(motor.torque)}</dd>
        </div>
        <div>
          <dt>Position</dt>
          <dd>{motor.position}</dd>
        </div>
        <div>
          <dt>Speed</dt>
          <dd>{formatNumber(motor.speed)}</dd>
        </div>
      </dl>
    </article>
  );
}

function calculateLoad(motors: MotorTelemetry[]) {
  const totalLoad = motors.reduce((sum, motor) => sum + Math.abs(motor.torque), 0);
  const motorCount = motors.length;

  const loadedMotors: MotorLoad[] = motors.map((motor, index) => {
    // Starts at the front-left for a four-motor platform and scales to any count.
    const angle = (-135 + (index * 360) / motorCount) * (Math.PI / 180);
    const load = Math.abs(motor.torque);

    return {
      ...motor,
      load,
      loadPercent: totalLoad > 0 ? (load / totalLoad) * 100 : 0,
      x: Math.cos(angle),
      y: Math.sin(angle),
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
  if (Math.abs(value) < 0.01) {
    return "Centered";
  }

  const direction = value > 0 ? positiveDirection : negativeDirection;
  return `${formatNumber(Math.abs(value) * 100, 0)}% ${direction}`;
}

function formatNumber(value: number, decimals = 2) {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  return value.toFixed(decimals);
}
