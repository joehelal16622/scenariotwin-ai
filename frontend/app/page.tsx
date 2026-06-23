"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type TimePoint = {
  t: number;
  displacement: number;
  velocity: number;
};

type SimulationResult = {
  natural_frequency_hz: number;
  forcing_frequency_hz: number;
  damping_ratio: number;
  frequency_ratio: number;
  peak_displacement_m: number;
  steady_state_amplitude_m: number;
  resonance_risk: string;
  time_series: TimePoint[];
};

type ModelParameters = {
  rpm: number;
  mass_kg: number;
  stiffness_N_m: number;
  damping_Ns_m: number;
  force_N: number;
};

type ScenarioInterpretation = {
  solver_family: string;
  model: string;
  assumptions: string[];
  parameters: ModelParameters;
};

type OptimizationCase = {
  strategy: string;
  description: string;
  mass_kg: number;
  stiffness_N_m: number;
  damping_Ns_m: number;
  force_N: number;
  rpm: number;
  natural_frequency_hz: number;
  forcing_frequency_hz: number;
  frequency_ratio: number;
  peak_displacement_m: number;
  resonance_risk: string;
};

type OptimizationResult = {
  baseline: OptimizationCase;
  best_options: OptimizationCase[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function riskTextColor(risk: string) {
  if (risk === "high") return "text-red-400";
  if (risk === "moderate") return "text-yellow-400";
  return "text-cyan-400";
}

export default function Home() {
  const [scenario, setScenario] = useState(
    "A rotating machine vibrates heavily at 480 RPM. The mount feels unstable and the vibration increases near operating speed."
  );

  const [result, setResult] = useState<SimulationResult | null>(null);
  const [interpretation, setInterpretation] =
    useState<ScenarioInterpretation | null>(null);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(
    null
  );
  const [loading, setLoading] = useState(false);

  const [mass, setMass] = useState(20);
  const [stiffness, setStiffness] = useState(50000);
  const [damping, setDamping] = useState(120);
  const [force, setForce] = useState(100);
  const [rpm, setRpm] = useState(480);

  function syncControls(params: ModelParameters) {
    setMass(params.mass_kg);
    setStiffness(params.stiffness_N_m);
    setDamping(params.damping_Ns_m);
    setForce(params.force_N);
    setRpm(params.rpm);
  }

  function currentSliderParams(): ModelParameters {
    return {
      mass_kg: mass,
      stiffness_N_m: stiffness,
      damping_Ns_m: damping,
      force_N: force,
      rpm: rpm,
    };
  }

  async function runModel(params: ModelParameters) {
    syncControls(params);

    const requestBody = {
      mass_kg: params.mass_kg,
      stiffness_N_m: params.stiffness_N_m,
      damping_Ns_m: params.damping_Ns_m,
      force_N: params.force_N,
      rpm: params.rpm,
      duration_s: 5,
      time_steps: 500,
    };

    const simulationResponse = await fetch(
      "http://127.0.0.1:8000/simulate/vibration",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    const optimizationResponse = await fetch(
      "http://127.0.0.1:8000/optimize/vibration",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    const simulationData = await simulationResponse.json();
    const optimizationData = await optimizationResponse.json();

    setResult(simulationData);
    setOptimization(optimizationData);
  }

  async function generateTwin() {
    setLoading(true);
    setResult(null);
    setOptimization(null);

    const interpretResponse = await fetch(
      "http://127.0.0.1:8000/interpret/scenario",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scenario: scenario,
        }),
      }
    );

    const interpreted: ScenarioInterpretation = await interpretResponse.json();
    setInterpretation(interpreted);

    await runModel(interpreted.parameters);

    setLoading(false);
  }

  async function runCurrentControls() {
    setLoading(true);

    const params = currentSliderParams();

    setInterpretation((current) =>
      current
        ? {
            ...current,
            parameters: params,
          }
        : {
            solver_family: "vibration / resonance",
            model: "forced mass-spring-damper",
            assumptions: [
              "single-degree-of-freedom vibration model",
              "sinusoidal forcing from rotating machine",
              "linear spring and viscous damper",
              "rigid machine mass",
            ],
            parameters: params,
          }
    );

    await runModel(params);

    setLoading(false);
  }

  async function applyOptimizationOption(option: OptimizationCase) {
    setLoading(true);

    const nextParams = {
      mass_kg: option.mass_kg,
      stiffness_N_m: option.stiffness_N_m,
      damping_Ns_m: option.damping_Ns_m,
      force_N: option.force_N,
      rpm: option.rpm,
    };

    setInterpretation((current) =>
      current
        ? {
            ...current,
            parameters: nextParams,
          }
        : current
    );

    await runModel(nextParams);

    setLoading(false);
  }

  const chartData =
    result?.time_series.map((point) => ({
      time: Number(point.t.toFixed(2)),
      displacement_mm: Number((point.displacement * 1000).toFixed(3)),
    })) ?? [];

  const peakDisplacementMm = result ? result.peak_displacement_m * 1000 : 0;

  const riskColor = result
    ? riskTextColor(result.resonance_risk)
    : "text-cyan-400";

  const riskBorder =
    result?.resonance_risk === "high"
      ? "border-red-500/40"
      : result?.resonance_risk === "moderate"
      ? "border-yellow-500/40"
      : "border-cyan-500/40";

  const ratioPosition = result
    ? clamp((result.frequency_ratio / 2) * 100, 0, 100)
    : 0;

  const amplitudeSeverity = result
    ? clamp((peakDisplacementMm / 20) * 100, 0, 100)
    : 0;

  const dampingSeverity = result
    ? clamp((result.damping_ratio / 0.3) * 100, 0, 100)
    : 0;

  const recommendation =
    result?.resonance_risk === "high"
      ? "Critical resonance proximity detected. Increase stiffness, increase damping, reduce excitation force, or shift operating speed away from the natural frequency."
      : result?.resonance_risk === "moderate"
      ? "The system is operating near a sensitive frequency range. Check damping, mounting stiffness, and operating-speed variation."
      : "The system is currently away from resonance. Continue monitoring displacement amplitude and damping margin.";

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
        <div className="mb-10">
          <p className="mb-3 text-sm uppercase tracking-[0.3em] text-cyan-400">
            ScenarioTwin AI
          </p>

          <h1 className="max-w-4xl text-5xl font-semibold leading-tight">
            Turn engineering scenarios into interactive diagnostic twins.
          </h1>

          <p className="mt-5 max-w-2xl text-lg text-neutral-400">
            Describe a mechanical fault scenario. ScenarioTwin extracts
            operating conditions, runs a simplified physical model, diagnoses
            the response, and recommends safer alternatives.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-6">
            <label className="text-sm text-neutral-300">
              Engineering scenario
            </label>

            <textarea
              className="mt-3 h-44 w-full resize-none rounded-2xl border border-neutral-700 bg-neutral-950 p-4 text-neutral-100 outline-none focus:border-cyan-400"
              value={scenario}
              onChange={(event) => setScenario(event.target.value)}
            />

            <div className="mt-6 grid gap-5">
              <div>
                <label className="text-sm text-neutral-300">
                  Mass: {mass} kg
                </label>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={mass}
                  onChange={(event) => setMass(Number(event.target.value))}
                  className="mt-3 w-full"
                />
              </div>

              <div>
                <label className="text-sm text-neutral-300">
                  Mount stiffness: {stiffness.toLocaleString()} N/m
                </label>
                <input
                  type="range"
                  min="10000"
                  max="150000"
                  step="5000"
                  value={stiffness}
                  onChange={(event) => setStiffness(Number(event.target.value))}
                  className="mt-3 w-full"
                />
              </div>

              <div>
                <label className="text-sm text-neutral-300">
                  Damping: {damping} Ns/m
                </label>
                <input
                  type="range"
                  min="0"
                  max="1000"
                  step="20"
                  value={damping}
                  onChange={(event) => setDamping(Number(event.target.value))}
                  className="mt-3 w-full"
                />
              </div>

              <div>
                <label className="text-sm text-neutral-300">
                  Excitation force: {force} N
                </label>
                <input
                  type="range"
                  min="10"
                  max="500"
                  step="10"
                  value={force}
                  onChange={(event) => setForce(Number(event.target.value))}
                  className="mt-3 w-full"
                />
              </div>

              <div>
                <label className="text-sm text-neutral-300">
                  Operating speed: {rpm} RPM
                </label>
                <input
                  type="range"
                  min="200"
                  max="1000"
                  step="10"
                  value={rpm}
                  onChange={(event) => setRpm(Number(event.target.value))}
                  className="mt-3 w-full"
                />
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={generateTwin}
                disabled={loading}
                className="rounded-2xl bg-cyan-400 px-5 py-3 font-medium text-neutral-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Running..." : "Generate from scenario"}
              </button>

              <button
                onClick={runCurrentControls}
                disabled={loading}
                className="rounded-2xl border border-neutral-700 px-5 py-3 font-medium text-neutral-200 hover:border-cyan-400 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Run current controls
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-6">
            <h2 className="text-xl font-semibold">Agent workflow</h2>

            <div className="mt-6 space-y-4 text-sm text-neutral-300">
              <p>✓ Scenario received</p>
              <p>
                {interpretation
                  ? `✓ Solver family: ${interpretation.solver_family}`
                  : "○ Solver family: waiting"}
              </p>
              <p>
                {interpretation
                  ? `✓ Model: ${interpretation.model}`
                  : "○ Model: waiting"}
              </p>
              <p>✓ Backend simulation: ready</p>
              <p className={result ? "text-cyan-400" : "text-neutral-500"}>
                {result ? "✓ Diagnostic twin generated" : "○ Waiting for run"}
              </p>
            </div>

            {interpretation && (
              <div className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
                <h3 className="mb-4 text-lg font-semibold">
                  Current model parameters
                </h3>

                <div className="grid grid-cols-2 gap-3 text-sm text-neutral-300">
                  <p>RPM: {interpretation.parameters.rpm}</p>
                  <p>Mass: {interpretation.parameters.mass_kg} kg</p>
                  <p>
                    Stiffness:{" "}
                    {interpretation.parameters.stiffness_N_m.toLocaleString()}{" "}
                    N/m
                  </p>
                  <p>Damping: {interpretation.parameters.damping_Ns_m} Ns/m</p>
                  <p>Force: {interpretation.parameters.force_N} N</p>
                </div>
              </div>
            )}

            {result && (
              <div
                className={`mt-6 rounded-2xl border ${riskBorder} bg-neutral-950 p-5`}
              >
                <h3 className="mb-4 text-lg font-semibold">
                  Engineering diagnosis
                </h3>

                <p className="text-sm leading-6 text-neutral-300">
                  The system is being excited at{" "}
                  <span className="text-white">
                    {result.forcing_frequency_hz.toFixed(2)} Hz
                  </span>{" "}
                  while its natural frequency is{" "}
                  <span className="text-white">
                    {result.natural_frequency_hz.toFixed(2)} Hz
                  </span>
                  . A frequency ratio near 1 indicates resonance risk.
                </p>

                <p className="mt-4 text-sm leading-6 text-neutral-300">
                  {recommendation}
                </p>
              </div>
            )}
          </div>
        </div>

        {result && (
          <div className="mt-6 rounded-3xl border border-neutral-800 bg-neutral-900/70 p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold">
                  Resonance diagnostic cockpit
                </h3>
                <p className="mt-1 text-sm text-neutral-400">
                  Key indicators from the simplified vibration model.
                </p>
              </div>

              <div className={`text-2xl font-bold ${riskColor}`}>
                {result.resonance_risk.toUpperCase()} RISK
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-xs uppercase tracking-widest text-neutral-500">
                  Natural frequency
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {result.natural_frequency_hz.toFixed(2)} Hz
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-xs uppercase tracking-widest text-neutral-500">
                  Forcing frequency
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {result.forcing_frequency_hz.toFixed(2)} Hz
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-xs uppercase tracking-widest text-neutral-500">
                  Frequency ratio
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {result.frequency_ratio.toFixed(2)}
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-xs uppercase tracking-widest text-neutral-500">
                  Peak displacement
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {peakDisplacementMm.toFixed(2)} mm
                </p>
              </div>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-3">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">Frequency proximity</p>
                  <p className={riskColor}>{result.frequency_ratio.toFixed(2)}</p>
                </div>

                <div className="relative mt-5 h-3 rounded-full bg-neutral-800">
                  <div className="absolute left-1/2 top-[-6px] h-6 w-[2px] bg-red-400" />
                  <div
                    className="absolute top-[-4px] h-5 w-5 rounded-full bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.6)]"
                    style={{ left: `calc(${ratioPosition}% - 10px)` }}
                  />
                </div>

                <div className="mt-3 flex justify-between text-xs text-neutral-500">
                  <span>0</span>
                  <span>resonance zone</span>
                  <span>2+</span>
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">Amplitude severity</p>
                  <p>{peakDisplacementMm.toFixed(2)} mm</p>
                </div>

                <div className="mt-5 h-3 overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="h-full rounded-full bg-cyan-400"
                    style={{ width: `${amplitudeSeverity}%` }}
                  />
                </div>

                <p className="mt-3 text-xs text-neutral-500">
                  Scaled against a 20 mm warning threshold.
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">Damping margin</p>
                  <p>{result.damping_ratio.toFixed(3)}</p>
                </div>

                <div className="mt-5 h-3 overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="h-full rounded-full bg-cyan-400"
                    style={{ width: `${dampingSeverity}%` }}
                  />
                </div>

                <p className="mt-3 text-xs text-neutral-500">
                  Higher damping reduces resonance amplification.
                </p>
              </div>
            </div>

            {optimization && (
              <div className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
                <h4 className="text-lg font-semibold">
                  Optimization recommendations
                </h4>

                <p className="mt-1 text-sm text-neutral-500">
                  Ranked by lowest simulated peak displacement.
                </p>

                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  {optimization.best_options.slice(0, 3).map((option, index) => {
                    const baselineMm =
                      optimization.baseline.peak_displacement_m * 1000;
                    const optionMm = option.peak_displacement_m * 1000;
                    const reduction =
                      baselineMm > 0
                        ? ((baselineMm - optionMm) / baselineMm) * 100
                        : 0;

                    return (
                      <div
                        key={`${option.strategy}-${index}`}
                        className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
                      >
                        <p className="text-xs uppercase tracking-widest text-neutral-500">
                          Option {index + 1}
                        </p>

                        <h5 className="mt-2 font-semibold capitalize">
                          {option.strategy}
                        </h5>

                        <p className="mt-3 text-sm leading-6 text-neutral-300">
                          {option.description}
                        </p>

                        <div className="mt-4 space-y-2 text-sm text-neutral-400">
                          <p>
                            Peak displacement:{" "}
                            <span className="text-white">
                              {optionMm.toFixed(2)} mm
                            </span>
                          </p>

                          <p>
                            Reduction:{" "}
                            <span className="text-white">
                              {reduction.toFixed(1)}%
                            </span>
                          </p>

                          <p>
                            New risk:{" "}
                            <span className={riskTextColor(option.resonance_risk)}>
                              {option.resonance_risk.toUpperCase()}
                            </span>
                          </p>
                        </div>

                        <button
                          onClick={() => applyOptimizationOption(option)}
                          disabled={loading}
                          className="mt-5 w-full rounded-xl border border-cyan-400/40 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-400 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Apply option
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="mt-6 rounded-3xl border border-neutral-800 bg-neutral-900/70 p-6">
            <h3 className="mb-4 text-xl font-semibold">
              Displacement response
            </h3>

            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis
                    dataKey="time"
                    stroke="#a3a3a3"
                    label={{
                      value: "Time (s)",
                      position: "insideBottom",
                      offset: -5,
                      fill: "#a3a3a3",
                    }}
                  />
                  <YAxis
                    stroke="#a3a3a3"
                    label={{
                      value: "Displacement (mm)",
                      angle: -90,
                      position: "insideLeft",
                      fill: "#a3a3a3",
                    }}
                  />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="displacement_mm"
                    stroke="#22d3ee"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}