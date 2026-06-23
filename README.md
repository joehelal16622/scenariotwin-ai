# ScenarioTwin AI

ScenarioTwin AI is a full-stack engineering diagnostic platform that converts mechanical fault scenarios into simplified simulation models, runs a physics-based vibration analysis, diagnoses resonance risk, and recommends safer operating alternatives.

The current MVP focuses on rotating-machine vibration using a forced mass-spring-damper model.

## What the app does

Users can describe a mechanical vibration scenario in natural language, for example:

```text
A pump with mass 30 kg vibrates at 700 RPM. The mount stiffness is 80000 N/m, damping is 300 Ns/m, and excitation force is 150 N.
```

ScenarioTwin AI then:

1. Extracts engineering parameters from the scenario text.
2. Builds a simplified vibration model.
3. Runs a backend physics simulation.
4. Calculates resonance indicators.
5. Displays a diagnostic cockpit.
6. Generates optimization recommendations.
7. Allows users to apply recommended changes and rerun the model.
8. Produces an engineering report summary.

## Core features

* Natural-language scenario parsing
* FastAPI backend
* Python physics simulation engine
* Forced vibration model
* Resonance risk classification
* Frequency-ratio analysis
* Peak displacement prediction
* Optimization recommendations
* Apply-option decision loop
* Interactive frontend controls
* Recharts displacement response graph
* Auto-generated engineering report

## Engineering model

The first module uses a single-degree-of-freedom forced vibration model:

* Mass: machine or equipment mass
* Stiffness: mount or support stiffness
* Damping: viscous damping coefficient
* Force: sinusoidal excitation force
* RPM: rotating operating speed

The backend computes:

* Natural frequency
* Forcing frequency
* Damping ratio
* Frequency ratio
* Peak displacement
* Steady-state amplitude
* Resonance risk level

## Tech stack

### Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* Recharts

### Backend

* FastAPI
* Python
* SciPy
* NumPy
* Pydantic

## Project structure

```text
scenariotwin-ai/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── simulation/
│       └── vibration_solver.py
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── package.json
│   └── tsconfig.json
│
├── .gitignore
└── README.md
```

## Running locally

### 1. Start the backend

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn main:app --reload
```

The backend runs at:

```text
http://127.0.0.1:8000
```

API documentation:

```text
http://127.0.0.1:8000/docs
```

### 2. Start the frontend

```powershell
cd frontend
npm.cmd run dev
```

The frontend runs at:

```text
http://localhost:3000
```

## Main API endpoints

### Health check

```text
GET /
```

Returns backend status.

### Interpret scenario

```text
POST /interpret/scenario
```

Extracts model parameters from natural-language scenario text.

### Run vibration simulation

```text
POST /simulate/vibration
```

Runs the forced vibration model.

### Optimize vibration setup

```text
POST /optimize/vibration
```

Tests alternative stiffness, damping, and operating-speed settings, then ranks options by lowest simulated peak displacement.

## Example workflow

1. Enter an engineering scenario.
2. Click **Generate from scenario**.
3. Review extracted model parameters.
4. Inspect resonance risk and displacement response.
5. Review optimization recommendations.
6. Click **Apply option** to test a safer alternative.
7. Copy the generated engineering report.

## Current MVP status

Implemented:

* Full-stack frontend/backend architecture
* Local physics simulation engine
* Natural-language parameter extraction
* Interactive sliders
* Independent control runs
* Resonance diagnostic cockpit
* Optimization recommendations
* Apply-option rerun workflow
* Engineering report output
* Git version control checkpointing

Planned improvements:

* More robust AI-based scenario interpretation
* Additional solver modules
* PDF report export
* Better optimization constraints
* Deployment
* Architecture diagram
* Demo screenshots and video
* More detailed validation examples

## Disclaimer

This project is an educational engineering simulation tool. The current model is intentionally simplified and should not be used for real-world safety-critical design decisions without professional validation.
