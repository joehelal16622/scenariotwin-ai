import math
from scipy.integrate import solve_ivp


def simulate_vibration(
    mass_kg: float,
    stiffness_N_m: float,
    damping_Ns_m: float,
    force_N: float,
    rpm: float,
    duration_s: float = 5.0,
    time_steps: int = 500,
):
    if mass_kg <= 0:
        raise ValueError("mass_kg must be positive")
    if stiffness_N_m <= 0:
        raise ValueError("stiffness_N_m must be positive")
    if damping_Ns_m < 0:
        raise ValueError("damping_Ns_m cannot be negative")
    if force_N <= 0:
        raise ValueError("force_N must be positive")
    if rpm <= 0:
        raise ValueError("rpm must be positive")
    if duration_s <= 0:
        raise ValueError("duration_s must be positive")
    if time_steps < 50:
        raise ValueError("time_steps must be at least 50")

    m = mass_kg
    k = stiffness_N_m
    c = damping_Ns_m
    F0 = force_N

    omega_n = math.sqrt(k / m)
    natural_frequency_hz = omega_n / (2 * math.pi)

    forcing_frequency_hz = rpm / 60
    omega = 2 * math.pi * forcing_frequency_hz

    damping_ratio = c / (2 * math.sqrt(k * m))
    frequency_ratio = omega / omega_n

    denominator = math.sqrt(
        (1 - frequency_ratio**2) ** 2
        + (2 * damping_ratio * frequency_ratio) ** 2
    )

    steady_state_amplitude_m = (F0 / k) / denominator

    def equation(t, y):
        displacement = y[0]
        velocity = y[1]

        acceleration = (
            F0 * math.sin(omega * t)
            - c * velocity
            - k * displacement
        ) / m

        return [velocity, acceleration]

    t_eval = [
        i * duration_s / (time_steps - 1)
        for i in range(time_steps)
    ]

    solution = solve_ivp(
        equation,
        t_span=(0, duration_s),
        y0=[0, 0],
        t_eval=t_eval,
        method="RK45",
    )

    displacements = solution.y[0]
    velocities = solution.y[1]

    peak_displacement_m = max(abs(x) for x in displacements)

    if 0.85 <= frequency_ratio <= 1.15 and damping_ratio < 0.15:
        resonance_risk = "high"
    elif 0.7 <= frequency_ratio <= 1.3:
        resonance_risk = "moderate"
    else:
        resonance_risk = "low"

    time_series = [
        {
            "t": float(t),
            "displacement": float(x),
            "velocity": float(v),
        }
        for t, x, v in zip(solution.t, displacements, velocities)
    ]

    return {
        "natural_frequency_hz": natural_frequency_hz,
        "forcing_frequency_hz": forcing_frequency_hz,
        "damping_ratio": damping_ratio,
        "frequency_ratio": frequency_ratio,
        "peak_displacement_m": peak_displacement_m,
        "steady_state_amplitude_m": steady_state_amplitude_m,
        "resonance_risk": resonance_risk,
        "time_series": time_series,
    }