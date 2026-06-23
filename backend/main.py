import re

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from simulation.vibration_solver import simulate_vibration


app = FastAPI(title="ScenarioTwin AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class VibrationRequest(BaseModel):
    mass_kg: float = Field(..., gt=0)
    stiffness_N_m: float = Field(..., gt=0)
    damping_Ns_m: float = Field(..., ge=0)
    force_N: float = Field(..., gt=0)
    rpm: float = Field(..., gt=0)
    duration_s: float = Field(default=5.0, gt=0)
    time_steps: int = Field(default=500, ge=50)


class ScenarioRequest(BaseModel):
    scenario: str = Field(..., min_length=5)


def parse_number(value: str) -> float:
    cleaned = value.lower().replace(",", "").replace(" ", "")

    if cleaned.endswith("k"):
        return float(cleaned[:-1]) * 1000

    return float(cleaned)


def extract_parameter(text: str, patterns: list[str], default: float) -> float:
    for pattern in patterns:
        match = re.search(pattern, text)

        if match:
            return parse_number(match.group(1))

    return default


def run_case(
    mass_kg: float,
    stiffness_N_m: float,
    damping_Ns_m: float,
    force_N: float,
    rpm: float,
):
    result = simulate_vibration(
        mass_kg=mass_kg,
        stiffness_N_m=stiffness_N_m,
        damping_Ns_m=damping_Ns_m,
        force_N=force_N,
        rpm=rpm,
        duration_s=5,
        time_steps=500,
    )

    return {
        "mass_kg": mass_kg,
        "stiffness_N_m": stiffness_N_m,
        "damping_Ns_m": damping_Ns_m,
        "force_N": force_N,
        "rpm": rpm,
        "natural_frequency_hz": result["natural_frequency_hz"],
        "forcing_frequency_hz": result["forcing_frequency_hz"],
        "frequency_ratio": result["frequency_ratio"],
        "peak_displacement_m": result["peak_displacement_m"],
        "resonance_risk": result["resonance_risk"],
    }


@app.get("/")
def health_check():
    return {"status": "ScenarioTwin AI backend running"}


@app.post("/interpret/scenario")
def interpret_scenario(request: ScenarioRequest):
    text = request.scenario.lower()

    rpm = extract_parameter(
        text,
        [
            r"(\d+(?:,\d{3})*(?:\.\d+)?\s*k?)\s*rpm",
            r"speed\s*(?:is|=|of)?\s*(\d+(?:,\d{3})*(?:\.\d+)?\s*k?)",
        ],
        480,
    )

    mass_kg = extract_parameter(
        text,
        [
            r"mass\s*(?:is|=|of)?\s*(\d+(?:,\d{3})*(?:\.\d+)?\s*k?)\s*kg",
            r"(\d+(?:,\d{3})*(?:\.\d+)?\s*k?)\s*kg\s*mass",
        ],
        20,
    )

    stiffness_N_m = extract_parameter(
        text,
        [
            r"stiffness\s*(?:is|=|of)?\s*(\d+(?:,\d{3})*(?:\.\d+)?\s*k?)\s*n\s*/\s*m",
            r"spring\s*(?:stiffness)?\s*(?:is|=|of)?\s*(\d+(?:,\d{3})*(?:\.\d+)?\s*k?)\s*n\s*/\s*m",
            r"mount\s*stiffness\s*(?:is|=|of)?\s*(\d+(?:,\d{3})*(?:\.\d+)?\s*k?)\s*n\s*/\s*m",
            r"(\d+(?:,\d{3})*(?:\.\d+)?\s*k?)\s*n\s*/\s*m",
        ],
        50000,
    )

    damping_Ns_m = extract_parameter(
        text,
        [
            r"damping\s*(?:is|=|of)?\s*(\d+(?:,\d{3})*(?:\.\d+)?\s*k?)\s*n\s*s\s*/\s*m",
            r"damper\s*(?:is|=|of)?\s*(\d+(?:,\d{3})*(?:\.\d+)?\s*k?)\s*n\s*s\s*/\s*m",
            r"(\d+(?:,\d{3})*(?:\.\d+)?\s*k?)\s*n\s*s\s*/\s*m",
        ],
        120,
    )

    force_N = extract_parameter(
        text,
        [
            r"force\s*(?:is|=|of)?\s*(\d+(?:,\d{3})*(?:\.\d+)?\s*k?)\s*n\b",
            r"excitation\s*force\s*(?:is|=|of)?\s*(\d+(?:,\d{3})*(?:\.\d+)?\s*k?)\s*n\b",
            r"load\s*(?:is|=|of)?\s*(\d+(?:,\d{3})*(?:\.\d+)?\s*k?)\s*n\b",
        ],
        100,
    )

    interpreted = {
        "solver_family": "vibration / resonance",
        "model": "forced mass-spring-damper",
        "assumptions": [
            "single-degree-of-freedom vibration model",
            "sinusoidal forcing from rotating machine",
            "linear spring and viscous damper",
            "rigid machine mass",
        ],
        "parameters": {
            "rpm": rpm,
            "mass_kg": mass_kg,
            "stiffness_N_m": stiffness_N_m,
            "damping_Ns_m": damping_Ns_m,
            "force_N": force_N,
        },
    }

    return interpreted


@app.post("/simulate/vibration")
def run_vibration_simulation(request: VibrationRequest):
    try:
        return simulate_vibration(
            mass_kg=request.mass_kg,
            stiffness_N_m=request.stiffness_N_m,
            damping_Ns_m=request.damping_Ns_m,
            force_N=request.force_N,
            rpm=request.rpm,
            duration_s=request.duration_s,
            time_steps=request.time_steps,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@app.post("/optimize/vibration")
def optimize_vibration(request: VibrationRequest):
    try:
        baseline = run_case(
            mass_kg=request.mass_kg,
            stiffness_N_m=request.stiffness_N_m,
            damping_Ns_m=request.damping_Ns_m,
            force_N=request.force_N,
            rpm=request.rpm,
        )

        candidates = []

        stiffness_values = [
            request.stiffness_N_m * 0.6,
            request.stiffness_N_m * 0.8,
            request.stiffness_N_m * 1.2,
            request.stiffness_N_m * 1.5,
            request.stiffness_N_m * 2.0,
        ]

        for stiffness in stiffness_values:
            if stiffness > 0:
                case = run_case(
                    mass_kg=request.mass_kg,
                    stiffness_N_m=stiffness,
                    damping_Ns_m=request.damping_Ns_m,
                    force_N=request.force_N,
                    rpm=request.rpm,
                )

                case["strategy"] = "change mount stiffness"
                case["description"] = (
                    f"Change stiffness from {request.stiffness_N_m:.0f} "
                    f"to {stiffness:.0f} N/m."
                )
                candidates.append(case)

        damping_values = [
            request.damping_Ns_m + 100,
            request.damping_Ns_m + 250,
            request.damping_Ns_m + 500,
            request.damping_Ns_m + 800,
        ]

        for damping in damping_values:
            case = run_case(
                mass_kg=request.mass_kg,
                stiffness_N_m=request.stiffness_N_m,
                damping_Ns_m=damping,
                force_N=request.force_N,
                rpm=request.rpm,
            )

            case["strategy"] = "increase damping"
            case["description"] = (
                f"Increase damping from {request.damping_Ns_m:.0f} "
                f"to {damping:.0f} Ns/m."
            )
            candidates.append(case)

        rpm_values = [250, 350, 450, 600, 750, 900, 1000]

        for rpm in rpm_values:
            case = run_case(
                mass_kg=request.mass_kg,
                stiffness_N_m=request.stiffness_N_m,
                damping_Ns_m=request.damping_Ns_m,
                force_N=request.force_N,
                rpm=rpm,
            )

            case["strategy"] = "shift operating speed"
            case["description"] = (
                f"Shift operating speed from {request.rpm:.0f} "
                f"to {rpm:.0f} RPM."
            )
            candidates.append(case)

        candidates.sort(key=lambda item: item["peak_displacement_m"])

        best_options = candidates[:5]

        return {
            "baseline": baseline,
            "best_options": best_options,
        }

    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))