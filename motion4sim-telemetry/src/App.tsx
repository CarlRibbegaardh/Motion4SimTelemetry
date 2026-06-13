import { useRef, useState } from "react";
import { parseTelemetry } from "./telemetry";
import type { MotorTelemetry } from "./types";
import "./App.css";

export default function App() {
  const [controllerIp, setControllerIp] = useState("192.168.50.88");
  const [connected, setConnected] = useState(false);
  const [motors, setMotors] = useState<MotorTelemetry[]>([]);
  const [selectedMotor, setSelectedMotor] = useState(0);
  const [lastFrameTime, setLastFrameTime] = useState<string>("-");
  const [error, setError] = useState<string>("");

  const wsRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<number | null>(null);

  function startKeepAlive(ws: WebSocket) {
    stopKeepAlive();

    pingTimerRef.current = window.setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        return;
      }

      const payload = new Uint8Array([0x89, 0x00]);
      ws.send(payload);
    }, 2000);
  }

  function stopKeepAlive() {
    if (pingTimerRef.current !== null) {
      window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }

  function connect() {
    disconnect();

    setError("");

    const url = `ws://${controllerIp}/ws`;
    const ws = new WebSocket(url);

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

    ws.onerror = () => {
      setError("WebSocket error");
    };

    ws.onclose = () => {
      stopKeepAlive();
      setConnected(false);

      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };
  }

  function disconnect() {
    stopKeepAlive();

    const ws = wsRef.current;

    if (ws) {
      ws.close();
      wsRef.current = null;
    }

    setConnected(false);
  }

  const selected = motors[selectedMotor] ?? null;

  const totalAbsTorque = motors.reduce(
    (sum, m) => sum + Math.abs(m.torque),
    0
  );

  return (
    <main className="app">
      <h1>Motion4Sim Load Dashboard</h1>

      <section className="panel">
        <label>
          Controller IP
          <input
            value={controllerIp}
            onChange={(e) => setControllerIp(e.target.value)}
            disabled={connected}
          />
        </label>

        <button onClick={connect} disabled={connected}>
          Connect
        </button>

        <button onClick={disconnect} disabled={!connected}>
          Disconnect
        </button>

        <span className={connected ? "status online" : "status offline"}>
          {connected ? "Connected" : "Disconnected"}
        </span>
      </section>

      {error && <section className="error">{error}</section>}

      <section className="panel">
        <label>
          Selected motor
          <select
            value={selectedMotor}
            onChange={(e) => setSelectedMotor(Number(e.target.value))}
          >
            {motors.map((m, i) => (
              <option key={m.index} value={i}>
                Motor {m.index}
              </option>
            ))}
          </select>
        </label>

        <div>Last frame: {lastFrameTime}</div>
      </section>

      {selected && (
        <section className="cards">
          <div className="card">
            <div>Position</div>
            <strong>{selected.position}</strong>
          </div>

          <div className="card">
            <div>Speed</div>
            <strong>{formatNumber(selected.speed)}</strong>
          </div>

          <div className="card">
            <div>Torque</div>
            <strong>{formatNumber(selected.torque)}</strong>
          </div>

          <div className="card">
            <div>Status</div>
            <strong>{selected.status}</strong>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>All motors</h2>

        <table>
          <thead>
            <tr>
              <th>Motor</th>
              <th>Position</th>
              <th>Speed</th>
              <th>Torque</th>
              <th>|Torque| %</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {motors.map((m) => {
              const torquePercent =
                totalAbsTorque > 0
                  ? (Math.abs(m.torque) / totalAbsTorque) * 100
                  : 0;

              return (
                <tr key={m.index}>
                  <td>{m.index}</td>
                  <td>{m.position}</td>
                  <td>{formatNumber(m.speed)}</td>
                  <td>{formatNumber(m.torque)}</td>
                  <td>{formatNumber(torquePercent)}%</td>
                  <td>{m.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function formatNumber(value: number) {
  if (Number.isNaN(value)) {
    return "NaN";
  }

  if (!Number.isFinite(value)) {
    return String(value);
  }

  return value.toFixed(2);
}
