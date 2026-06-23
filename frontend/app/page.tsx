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

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

const scenarioPresets = [
  {
    name: "High resonance",
    tag: "Critical",
    scenario:
      "A rotating machine vibrates heavily at 480 RPM. The mount feels unstable and the vibration increases near operating speed.",
  },
  {
    name: "Safe stiff mount",
    tag: "Stable",
    scenario:
      "A pump with mass 20 kg operates at 480 RPM. The mount stiffness is 125000 N/m, damping is 120 Ns/m, and excitation force is 100 N.",
  },
  {
    name: "Low damping",
    tag: "Amplified",
    scenario:
      "A fan with mass 20 kg vibrates at 480 RPM. The mount stiffness is 50000 N/m, damping is 20 Ns/m, and excitation force is 100 N.",
  },
  {
    name: "Heavy pump",
    tag: "Shifted mode",
    scenario:
      "A pump with mass 60 kg vibrates at 480 RPM. The mount stiffness is 50000 N/m, damping is 120 Ns/m, and excitation force is 100 N.",
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function riskLabelColor(risk: string) {
  if (risk === "high") return "text-red-300 border-red-400/40 bg-red-500/10";
  if (risk === "moderate")
    return "text-amber-300 border-amber-400/40 bg-amber-500/10";
  return "text-emerald-300 border-emerald-400/40 bg-emerald-500/10";
}

function riskDotColor(risk: string) {
  if (risk === "high") return "bg-red-400";
  if (risk === "moderate") return "bg-amber-400";
  return "bg-emerald-400";
}

function formatNumber(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

export default function Home() {
  const [scenario, setScenario] = useState(scenarioPresets[0].scenario);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [interpretation, setInterpretation] =
    useState<ScenarioInterpretation | null>(null);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(
    null
  );

  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

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
      rpm,
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
      `${API_BASE_URL}/simulate/vibration`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!simulationResponse.ok) {
      throw new Error("Simulation request failed.");
    }

    const optimizationResponse = await fetch(
      `${API_BASE_URL}/optimize/vibration`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!optimizationResponse.ok) {
      throw new Error("Optimization request failed.");
    }

    const simulationData = await simulationResponse.json();
    const optimizationData = await optimizationResponse.json();

    setResult(simulationData);
    setOptimization(optimizationData);
  }

  async function generateTwin() {
    try {
      setLoading(true);
      setError("");
      setResult(null);
      setOptimization(null);

      const interpretResponse = await fetch(
        `${API_BASE_URL}/interpret/scenario`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            scenario,
          }),
        }
      );

      if (!interpretResponse.ok) {
        throw new Error("Scenario interpretation failed.");
      }

      const interpreted: ScenarioInterpretation = await interpretResponse.json();
      setInterpretation(interpreted);

      await runModel(interpreted.parameters);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  async function runCurrentControls() {
    try {
      setLoading(true);
      setError("");

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
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  async function applyOptimizationOption(option: OptimizationCase) {
    try {
      setLoading(true);
      setError("");

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
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  const chartData =
    result?.time_series.map((point) => ({
      time: Number(point.t.toFixed(2)),
      displacement_mm: Number((point.displacement * 1000).toFixed(3)),
    })) ?? [];

  const peakDisplacementMm = result ? result.peak_displacement_m * 1000 : 0;

  const ratioPosition = result
    ? clamp((result.frequency_ratio / 2) * 100, 0, 100)
    : 0;

  const amplitudeSeverity = result
    ? clamp((peakDisplacementMm / 20) * 100, 0, 100)
    : 0;

  const dampingSeverity = result
    ? clamp((result.damping_ratio / 0.3) * 100, 0, 100)
    : 0;

  const bestOption = optimization?.best_options[0] ?? null;

  const baselineDisplacementMm = optimization
    ? optimization.baseline.peak_displacement_m * 1000
    : peakDisplacementMm;

  const bestOptionDisplacementMm = bestOption
    ? bestOption.peak_displacement_m * 1000
    : 0;

  const bestReduction =
    bestOption && baselineDisplacementMm > 0
      ? ((baselineDisplacementMm - bestOptionDisplacementMm) /
          baselineDisplacementMm) *
        100
      : 0;

  const recommendation =
    result?.resonance_risk === "high"
      ? "The operating speed is close to the system natural frequency. Shift speed, increase damping, or change mount stiffness before continuous operation."
      : result?.resonance_risk === "moderate"
      ? "The system is close enough to resonance to justify monitoring and design review. Small parameter changes may reduce amplitude."
      : "The system is currently away from the resonance zone. Maintain monitoring and verify assumptions against measured vibration data.";

  const reportText =
    result && interpretation
      ? [
          "ScenarioTwin AI Engineering Report",
          "",
          `Scenario: ${scenario}`,
          "",
          "Model setup:",
          `- Solver family: ${interpretation.solver_family}`,
          `- Model: ${interpretation.model}`,
          `- Mass: ${interpretation.parameters.mass_kg} kg`,
          `- Mount stiffness: ${interpretation.parameters.stiffness_N_m.toLocaleString()} N/m`,
          `- Damping: ${interpretation.parameters.damping_Ns_m} Ns/m`,
          `- Excitation force: ${interpretation.parameters.force_N} N`,
          `- Operating speed: ${interpretation.parameters.rpm} RPM`,
          "",
          "Baseline simulation:",
          `- Natural frequency: ${result.natural_frequency_hz.toFixed(2)} Hz`,
          `- Forcing frequency: ${result.forcing_frequency_hz.toFixed(2)} Hz`,
          `- Frequency ratio: ${result.frequency_ratio.toFixed(2)}`,
          `- Damping ratio: ${result.damping_ratio.toFixed(3)}`,
          `- Peak displacement: ${peakDisplacementMm.toFixed(2)} mm`,
          `- Resonance risk: ${result.resonance_risk.toUpperCase()}`,
          "",
          "Engineering diagnosis:",
          recommendation,
          "",
          bestOption
            ? [
                "Recommended optimization:",
                `- Strategy: ${bestOption.strategy}`,
                `- Action: ${bestOption.description}`,
                `- New peak displacement: ${bestOptionDisplacementMm.toFixed(
                  2
                )} mm`,
                `- Estimated displacement reduction: ${bestReduction.toFixed(
                  1
                )}%`,
                `- New risk level: ${bestOption.resonance_risk.toUpperCase()}`,
              ].join("\n")
            : "Recommended optimization: No optimization result available.",
          "",
          "Assumptions:",
          ...interpretation.assumptions.map((assumption) => `- ${assumption}`),
        ].join("\n")
      : "";

  async function copyReport() {
    if (!reportText) return;

    await navigator.clipboard.writeText(reportText);
    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 1500);
  }

  return (
    <main className="min-h-screen bg-[#070A0F] text-neutral-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.18),transparent_35%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.14),transparent_30%)]" />

      <section className="relative mx-auto max-w-7xl px-6 py-6">
        <nav className="mb-8 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 backdrop-blur">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">
              ScenarioTwin AI
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              Mechanical diagnostics platform
            </p>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">
              Live API
            </span>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-neutral-400">
              FastAPI + Next.js
            </span>
          </div>
        </nav>

        <header className="mb-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/30">
            <p className="mb-4 text-sm uppercase tracking-[0.25em] text-cyan-300">
              Engineering simulation agent
            </p>

            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
              Diagnose rotating-machine resonance from a plain-English fault
              scenario.
            </h1>

            <p className="mt-5 max-w-3xl text-base leading-7 text-neutral-400 md:text-lg">
              ScenarioTwin AI extracts operating parameters, runs a
              mass-spring-damper vibration model, ranks mitigation options, and
              generates an engineering report.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-widest text-neutral-500">
                  Solver
                </p>
                <p className="mt-2 font-medium text-white">Vibration SDOF</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-widest text-neutral-500">
                  Output
                </p>
                <p className="mt-2 font-medium text-white">Risk + response</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-widest text-neutral-500">
                  Actions
                </p>
                <p className="mt-2 font-medium text-white">Optimize design</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-neutral-950/70 p-6">
            <p className="text-sm font-medium text-neutral-300">
              System status
            </p>

            <div className="mt-5 space-y-4">
              {[
                "Scenario parser",
                "Physics solver",
                "Optimization engine",
                "Report generator",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <span className="text-sm text-neutral-300">{item}</span>
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.9)]" />
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
              <p className="text-sm leading-6 text-cyan-100">
                Current model: linear forced vibration with viscous damping.
                Best used for early-stage screening, not final certification.
              </p>
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <aside className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">
                  Scenario input
                </h2>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-neutral-400">
                  Natural language
                </span>
              </div>

              <textarea
                className="h-44 w-full resize-none rounded-2xl border border-white/10 bg-[#05070B] p-4 text-sm leading-6 text-neutral-100 outline-none transition focus:border-cyan-300/60"
                value={scenario}
                onChange={(event) => setScenario(event.target.value)}
              />

              <div className="mt-4 grid grid-cols-2 gap-3">
                {scenarioPresets.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => setScenario(preset.scenario)}
                    className="rounded-2xl border border-white/10 bg-black/20 p-3 text-left transition hover:border-cyan-300/50 hover:bg-cyan-300/10"
                  >
                    <p className="text-sm font-medium text-white">
                      {preset.name}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {preset.tag}
                    </p>
                  </button>
                ))}
              </div>

              <div className="mt-5 grid gap-3">
                <button
                  onClick={generateTwin}
                  disabled={loading}
                  className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Running diagnostic..." : "Generate diagnostic twin"}
                </button>

                <button
                  onClick={runCurrentControls}
                  disabled={loading}
                  className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-neutral-200 transition hover:border-cyan-300/50 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Run current parameters
                </button>
              </div>

              {error && (
                <p className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
                  {error}
                </p>
              )}
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <h2 className="text-lg font-semibold text-white">
                Model controls
              </h2>

              <div className="mt-5 space-y-5">
                <ControlSlider
                  label="Machine mass"
                  value={mass}
                  suffix="kg"
                  min={5}
                  max={100}
                  step={5}
                  onChange={setMass}
                />

                <ControlSlider
                  label="Mount stiffness"
                  value={stiffness}
                  suffix="N/m"
                  min={10000}
                  max={150000}
                  step={5000}
                  onChange={setStiffness}
                  formatValue={formatNumber}
                />

                <ControlSlider
                  label="Damping"
                  value={damping}
                  suffix="Ns/m"
                  min={0}
                  max={1000}
                  step={20}
                  onChange={setDamping}
                />

                <ControlSlider
                  label="Excitation force"
                  value={force}
                  suffix="N"
                  min={10}
                  max={500}
                  step={10}
                  onChange={setForce}
                />

                <ControlSlider
                  label="Operating speed"
                  value={rpm}
                  suffix="RPM"
                  min={200}
                  max={1000}
                  step={10}
                  onChange={setRpm}
                />
              </div>
            </section>
          </aside>

          <section className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <MetricCard
                label="Natural frequency"
                value={
                  result ? `${result.natural_frequency_hz.toFixed(2)} Hz` : "—"
                }
              />
              <MetricCard
                label="Forcing frequency"
                value={
                  result ? `${result.forcing_frequency_hz.toFixed(2)} Hz` : "—"
                }
              />
              <MetricCard
                label="Frequency ratio"
                value={result ? result.frequency_ratio.toFixed(2) : "—"}
              />
              <MetricCard
                label="Peak displacement"
                value={result ? `${peakDisplacementMm.toFixed(2)} mm` : "—"}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
              <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      Displacement response
                    </h2>
                    <p className="mt-1 text-sm text-neutral-500">
                      Simulated transient response over five seconds.
                    </p>
                  </div>

                  {result && (
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${riskLabelColor(
                        result.resonance_risk
                      )}`}
                    >
                      {result.resonance_risk.toUpperCase()} RISK
                    </span>
                  )}
                </div>

                <div className="h-[360px] rounded-2xl border border-white/10 bg-[#05070B] p-4">
                  {result ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis
                          dataKey="time"
                          stroke="#737373"
                          tick={{ fill: "#a3a3a3", fontSize: 12 }}
                        />
                        <YAxis
                          stroke="#737373"
                          tick={{ fill: "#a3a3a3", fontSize: 12 }}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#080B12",
                            border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: "14px",
                            color: "#f5f5f5",
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="displacement_mm"
                          stroke="#67e8f9"
                          strokeWidth={2.5}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                      Run a scenario to generate the response curve.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <h2 className="text-lg font-semibold text-white">
                  Diagnostic summary
                </h2>

                {result ? (
                  <div className="mt-5 space-y-5">
                    <div
                      className={`rounded-2xl border p-4 ${riskLabelColor(
                        result.resonance_risk
                      )}`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`h-3 w-3 rounded-full ${riskDotColor(
                            result.resonance_risk
                          )}`}
                        />
                        <p className="font-semibold">
                          {result.resonance_risk.toUpperCase()} RISK
                        </p>
                      </div>

                      <p className="mt-3 text-sm leading-6 text-neutral-300">
                        {recommendation}
                      </p>
                    </div>

                    <Indicator
                      label="Frequency proximity"
                      value={result.frequency_ratio.toFixed(2)}
                      percentage={ratioPosition}
                    />

                    <Indicator
                      label="Amplitude severity"
                      value={`${peakDisplacementMm.toFixed(2)} mm`}
                      percentage={amplitudeSeverity}
                    />

                    <Indicator
                      label="Damping level"
                      value={result.damping_ratio.toFixed(3)}
                      percentage={dampingSeverity}
                    />
                  </div>
                ) : (
                  <p className="mt-5 text-sm leading-6 text-neutral-500">
                    The diagnosis will appear after the first simulation run.
                  </p>
                )}
              </section>
            </div>

            {optimization && (
              <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      Ranked mitigation options
                    </h2>
                    <p className="mt-1 text-sm text-neutral-500">
                      Options are ranked by lowest simulated peak displacement.
                    </p>
                  </div>

                  {bestOption && (
                    <span className="hidden rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300 md:inline">
                      Best reduction: {bestReduction.toFixed(1)}%
                    </span>
                  )}
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
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
                        className="rounded-2xl border border-white/10 bg-[#05070B] p-4"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs uppercase tracking-widest text-neutral-500">
                            Option {index + 1}
                          </p>

                          <span
                            className={`rounded-full border px-2 py-1 text-[11px] ${riskLabelColor(
                              option.resonance_risk
                            )}`}
                          >
                            {option.resonance_risk}
                          </span>
                        </div>

                        <h3 className="mt-4 text-base font-semibold capitalize text-white">
                          {option.strategy}
                        </h3>

                        <p className="mt-3 min-h-12 text-sm leading-6 text-neutral-400">
                          {option.description}
                        </p>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <MiniStat
                            label="Peak"
                            value={`${optionMm.toFixed(2)} mm`}
                          />
                          <MiniStat
                            label="Reduction"
                            value={`${reduction.toFixed(1)}%`}
                          />
                        </div>

                        <button
                          onClick={() => applyOptimizationOption(option)}
                          disabled={loading}
                          className="mt-4 w-full rounded-xl border border-cyan-300/30 px-4 py-2 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-300 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Apply option
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {interpretation && (
              <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      Extracted model
                    </h2>

                    <div className="mt-5 space-y-3 text-sm">
                      <ModelRow
                        label="Solver family"
                        value={interpretation.solver_family}
                      />
                      <ModelRow label="Model" value={interpretation.model} />
                      <ModelRow
                        label="Mass"
                        value={`${interpretation.parameters.mass_kg} kg`}
                      />
                      <ModelRow
                        label="Stiffness"
                        value={`${formatNumber(
                          interpretation.parameters.stiffness_N_m
                        )} N/m`}
                      />
                      <ModelRow
                        label="Damping"
                        value={`${interpretation.parameters.damping_Ns_m} Ns/m`}
                      />
                      <ModelRow
                        label="Speed"
                        value={`${interpretation.parameters.rpm} RPM`}
                      />
                    </div>
                  </div>

                  {reportText && (
                    <div>
                      <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-white">
                          Engineering report
                        </h2>

                        <button
                          onClick={copyReport}
                          className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-neutral-200 transition hover:border-cyan-300/40 hover:text-cyan-200"
                        >
                          {copied ? "Copied" : "Copy report"}
                        </button>
                      </div>

                      <pre className="max-h-[320px] overflow-auto rounded-2xl border border-white/10 bg-[#05070B] p-4 text-xs leading-6 text-neutral-400">
                        {reportText}
                      </pre>
                    </div>
                  )}
                </div>
              </section>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function ControlSlider({
  label,
  value,
  suffix,
  min,
  max,
  step,
  onChange,
  formatValue,
}: {
  label: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-sm text-neutral-300">{label}</label>
        <span className="text-sm font-medium text-white">
          {formatValue ? formatValue(value) : value} {suffix}
        </span>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-cyan-300"
      />
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <p className="text-xs uppercase tracking-widest text-neutral-500">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function Indicator({
  label,
  value,
  percentage,
}: {
  label: string;
  value: string;
  percentage: number;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm text-neutral-300">{label}</p>
        <p className="text-sm font-medium text-white">{value}</p>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-cyan-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[11px] uppercase tracking-widest text-neutral-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function ModelRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#05070B] px-4 py-3">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right text-neutral-200">{value}</span>
    </div>
  );
}