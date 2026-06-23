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
    name: "Near-resonance machine",
    description: "A rotating machine operating close to its natural frequency.",
    scenario:
      "A rotating machine vibrates heavily at 480 RPM. The mount feels unstable and the vibration increases near operating speed.",
  },
  {
    name: "Stiffer mounting system",
    description: "Higher support stiffness shifts the natural frequency.",
    scenario:
      "A pump with mass 20 kg operates at 480 RPM. The mount stiffness is 125000 N/m, damping is 120 Ns/m, and excitation force is 100 N.",
  },
  {
    name: "Low damping support",
    description: "Weak damping increases vibration amplification.",
    scenario:
      "A fan with mass 20 kg vibrates at 480 RPM. The mount stiffness is 50000 N/m, damping is 20 Ns/m, and excitation force is 100 N.",
  },
  {
    name: "Heavy pump assembly",
    description: "Increased machine mass changes the resonance condition.",
    scenario:
      "A pump with mass 60 kg vibrates at 480 RPM. The mount stiffness is 50000 N/m, damping is 120 Ns/m, and excitation force is 100 N.",
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatNumber(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

function riskStatus(risk: string) {
  if (risk === "high") {
    return {
      label: "Critical",
      className: "border-red-200 bg-red-50 text-red-700",
      dot: "bg-red-500",
      decision:
        "Do not accept continuous operation without mitigation. The forcing frequency is too close to the natural frequency.",
    };
  }

  if (risk === "moderate") {
    return {
      label: "Warning",
      className: "border-amber-200 bg-amber-50 text-amber-700",
      dot: "bg-amber-500",
      decision:
        "Review the mounting, damping, and operating speed. The system is close enough to resonance to justify intervention.",
    };
  }

  return {
    label: "Acceptable",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
    decision:
      "The operating point is away from the resonance zone under the current assumptions.",
  };
}

function strategyLabel(strategy: string) {
  if (strategy === "change mount stiffness") return "Mount stiffness";
  if (strategy === "increase damping") return "Damping";
  if (strategy === "shift operating speed") return "Operating speed";
  return strategy;
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

  const frequencySeparation =
    result && result.natural_frequency_hz > 0
      ? Math.abs(result.forcing_frequency_hz - result.natural_frequency_hz)
      : 0;

  const ratioPosition = result
    ? clamp((result.frequency_ratio / 2) * 100, 0, 100)
    : 0;

  const amplitudeSeverity = result
    ? clamp((peakDisplacementMm / 20) * 100, 0, 100)
    : 0;

  const dampingSeverity = result
    ? clamp((result.damping_ratio / 0.3) * 100, 0, 100)
    : 0;

  const status = result ? riskStatus(result.resonance_risk) : null;

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

  const reportText =
    result && interpretation
      ? [
          "ScenarioTwin AI Engineering Screening Report",
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
          `- Frequency separation: ${frequencySeparation.toFixed(2)} Hz`,
          `- Damping ratio: ${result.damping_ratio.toFixed(3)}`,
          `- Peak displacement: ${peakDisplacementMm.toFixed(2)} mm`,
          `- Resonance risk: ${result.resonance_risk.toUpperCase()}`,
          "",
          "Decision:",
          status?.decision ?? "No decision available.",
          "",
          bestOption
            ? [
                "Recommended mitigation:",
                `- Strategy: ${strategyLabel(bestOption.strategy)}`,
                `- Action: ${bestOption.description}`,
                `- New peak displacement: ${bestOptionDisplacementMm.toFixed(
                  2
                )} mm`,
                `- Estimated displacement reduction: ${bestReduction.toFixed(
                  1
                )}%`,
                `- New risk level: ${bestOption.resonance_risk.toUpperCase()}`,
              ].join("\n")
            : "Recommended mitigation: No optimization result available.",
          "",
          "Assumptions:",
          ...interpretation.assumptions.map((assumption) => `- ${assumption}`),
          "",
          "Note: This is a screening model for early-stage engineering assessment, not a replacement for measured vibration testing or detailed finite element analysis.",
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
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              ScenarioTwin AI
            </h1>
            <p className="text-sm text-slate-500">
              Rotating machinery vibration screening
            </p>
          </div>

          <div className="hidden items-center gap-2 text-sm md:flex">
            <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
              Next.js
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
              FastAPI
            </span>
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
              Live
            </span>
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">
                Engineering decision-support tool
              </p>

              <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                Screen resonance risk before changing operating speed, damping,
                or mount stiffness.
              </h2>

              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
                Enter a rotating-machine fault scenario. The app extracts model
                parameters, runs a forced vibration simulation, ranks mitigation
                options, and produces a concise technical report.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <SummaryItem
                label="Use case"
                value="Early vibration risk screening"
              />
              <SummaryItem
                label="Model"
                value="Single-degree-of-freedom vibration"
              />
              <SummaryItem
                label="Decision output"
                value="Acceptable / Warning / Critical"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[390px_1fr]">
          <aside className="space-y-6">
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold">Scenario</h3>
                <span className="text-xs text-slate-500">Plain English</span>
              </div>

              <textarea
                value={scenario}
                onChange={(event) => setScenario(event.target.value)}
                className="h-40 w-full resize-none rounded-lg border border-slate-300 bg-white p-3 text-sm leading-6 outline-none focus:border-slate-500"
              />

              <div className="mt-4 space-y-2">
                {scenarioPresets.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => setScenario(preset.scenario)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-slate-400 hover:bg-white"
                  >
                    <p className="text-sm font-medium text-slate-900">
                      {preset.name}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {preset.description}
                    </p>
                  </button>
                ))}
              </div>

              <div className="mt-5 grid gap-3">
                <button
                  onClick={generateTwin}
                  disabled={loading}
                  className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Running..." : "Generate screening result"}
                </button>

                <button
                  onClick={runCurrentControls}
                  disabled={loading}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Run current parameters
                </button>
              </div>

              {error && (
                <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-base font-semibold">Model parameters</h3>

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

            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold">
                      Displacement response
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Simulated response over a five-second operating window.
                    </p>
                  </div>

                  {status && (
                    <span
                      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1 text-sm font-medium ${status.className}`}
                    >
                      <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                      {status.label}
                    </span>
                  )}
                </div>

                <div className="h-[360px] rounded-lg border border-slate-200 bg-slate-50 p-3">
                  {result ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#dbe2ea" />
                        <XAxis
                          dataKey="time"
                          stroke="#64748b"
                          tick={{ fill: "#475569", fontSize: 12 }}
                        />
                        <YAxis
                          stroke="#64748b"
                          tick={{ fill: "#475569", fontSize: 12 }}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#ffffff",
                            border: "1px solid #cbd5e1",
                            borderRadius: "8px",
                            color: "#0f172a",
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="displacement_mm"
                          stroke="#1d4ed8"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      Run a scenario to generate the response curve.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="text-base font-semibold">Decision panel</h3>

                {result && status ? (
                  <div className="mt-4 space-y-4">
                    <div className={`rounded-lg border p-4 ${status.className}`}>
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${status.dot}`} />
                        <p className="font-semibold">{status.label}</p>
                      </div>

                      <p className="mt-3 text-sm leading-6">{status.decision}</p>
                    </div>

                    <AssessmentBar
                      label="Frequency ratio"
                      value={result.frequency_ratio.toFixed(2)}
                      percentage={ratioPosition}
                    />

                    <AssessmentBar
                      label="Amplitude"
                      value={`${peakDisplacementMm.toFixed(2)} mm`}
                      percentage={amplitudeSeverity}
                    />

                    <AssessmentBar
                      label="Damping ratio"
                      value={result.damping_ratio.toFixed(3)}
                      percentage={dampingSeverity}
                    />

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-medium text-slate-900">
                        Frequency separation
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-slate-950">
                        {frequencySeparation.toFixed(2)} Hz
                      </p>
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        Smaller separation means the operating point is closer
                        to resonance.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-6 text-slate-500">
                    The decision panel appears after the first simulation run.
                  </p>
                )}
              </section>
            </div>

            {optimization && (
              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold">
                      Mitigation options
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Ranked by lowest simulated peak displacement.
                    </p>
                  </div>

                  {bestOption && (
                    <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                      Best reduction: {bestReduction.toFixed(1)}%
                    </span>
                  )}
                </div>

                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Rank</th>
                        <th className="px-4 py-3">Strategy</th>
                        <th className="px-4 py-3">Action</th>
                        <th className="px-4 py-3">Peak</th>
                        <th className="px-4 py-3">Reduction</th>
                        <th className="px-4 py-3">Risk</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-200">
                      {optimization.best_options.slice(0, 5).map((option, index) => {
                        const baselineMm =
                          optimization.baseline.peak_displacement_m * 1000;
                        const optionMm = option.peak_displacement_m * 1000;
                        const reduction =
                          baselineMm > 0
                            ? ((baselineMm - optionMm) / baselineMm) * 100
                            : 0;

                        const optionStatus = riskStatus(option.resonance_risk);

                        return (
                          <tr key={`${option.strategy}-${index}`} className="bg-white">
                            <td className="px-4 py-3 font-medium text-slate-900">
                              {index + 1}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {strategyLabel(option.strategy)}
                            </td>
                            <td className="max-w-[360px] px-4 py-3 text-slate-600">
                              {option.description}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {optionMm.toFixed(2)} mm
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {reduction.toFixed(1)}%
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`rounded-md border px-2 py-1 text-xs font-medium ${optionStatus.className}`}
                              >
                                {optionStatus.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => applyOptimizationOption(option)}
                                disabled={loading}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Apply
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {interpretation && (
              <section className="grid gap-6 lg:grid-cols-[360px_1fr]">
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <h3 className="text-base font-semibold">Extracted model</h3>

                  <div className="mt-4 space-y-2">
                    <ModelRow
                      label="Solver"
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
                  <div className="rounded-xl border border-slate-200 bg-white p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-semibold">
                          Engineering report
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Copyable screening summary for documentation.
                        </p>
                      </div>

                      <button
                        onClick={copyReport}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-500 hover:bg-slate-50"
                      >
                        {copied ? "Copied" : "Copy report"}
                      </button>
                    </div>

                    <pre className="max-h-[340px] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-700">
                      {reportText}
                    </pre>
                  </div>
                )}
              </section>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
    </div>
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
        <label className="text-sm font-medium text-slate-700">{label}</label>
        <span className="text-sm text-slate-500">
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
        className="w-full accent-slate-900"
      />
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
    </div>
  );
}

function AssessmentBar({
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
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="text-sm text-slate-500">{value}</p>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-slate-900"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function ModelRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-medium text-slate-800">
        {value}
      </span>
    </div>
  );
}