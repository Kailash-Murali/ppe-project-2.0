# Functional Specification: Bray PPE Monitor (PoC v1)

The **Bray PPE Monitor** is a real-time compliance tracking system designed to monitor personnel safety equipment inside industrial sites, laboratories, or construction zones. Using a webcam feed or stationary IP cameras, it automatically detects whether active workers are wearing required Personal Protective Equipment (PPE) and flags violations instantly.

---

## 1. Core Purpose

Industrial safety protocols dictate strict compliance rules regarding protective gear. The Bray PPE Monitor serves as an automated safety watchdog to:
1. **Reduce Violations**: Eliminate human monitoring oversights by automatically flagging personnel missing safety equipment.
2. **Prevent Injuries**: Proactively alert safety coordinators or workers through real-time notifications before they enter high-risk environments.
3. **Simplify Audits**: Collect statistical insights regarding site compliance levels.

---

## 2. Monitored PPE Categories

The system classifies and monitors four essential types of PPE, distinguishing between compliant use and violation states:

| PPE Category | Compliant State | Violation State | UI Display Label |
| :--- | :--- | :--- | :--- |
| **Safety Helmet** | `helmet` | `no helmet` | Safety Helmet |
| **Safety Gloves** | `gloves` | `no gloves` | Safety Gloves |
| **Safety Glasses** | `glasses` | `no glasses` | Safety Glasses |
| **Safety Boots** | `boots` | `no boots` | Safety Boots |

---

## 3. Key Features

### 3.1 Real-Time Video Overlays
* **Live Webcam Feed**: Connects to the user's local web camera or integrated device stream.
* **Annotated Bounding Boxes**: Bounding boxes are dynamically drawn on top of the video feed.
  * **Green Bounding Boxes**: Represent compliant PPE items detected on screen (e.g., a helmet).
  * **Red Bounding Boxes**: Represent explicit violations detected on screen (e.g., hands without gloves).
* **Person detection**: The system detects the presence of a person in the frame but does not draw a bounding box around them. Person detection is used purely to gate the alert system — no alert fires unless a person is in the scene.

### 3.2 Dynamic Configuration (PPE Controls)
* **Custom Category Toggles**: Safety managers can toggle compliance monitoring for specific PPE items depending on the workspace. For example, if safety boots are not required in a lab area, monitoring for `boots` can be deactivated. Unmonitored items are skipped in compliance evaluation.

### 3.3 Compliance Monitor Panel
* **Live Sidebar Status**: Displays a checklist of active PPE classes with visual indicators:
  * **Green Status Dot**: Item is compliant (present).
  * **Red Status Dot**: Item is violating safety protocol (absent or missing).
* **Missing PPE Banner**: If any active class is marked non-compliant, a prominent warning badge is displayed at the bottom of the sidebar.

### 3.4 Voice Safety Alert
* **Voice Announcement**: When a PPE violation is detected and a person is present in the frame, the system announces the missing items aloud using the browser's built-in speech synthesis engine (e.g., *"Safety violation: Safety Helmet missing, Safety Gloves missing"*).
* **One-Shot Per Session**: The announcement plays **once** at the start of each violation session. It does not repeat while the same person stands in front of the camera. A new announcement triggers only when the alarm is stopped and a new violation is detected.
* **Person-Gated**: The alert is completely suppressed if no person is detected in the frame — prevents false alerts when the camera is empty or obstructed.
* **Alert Controls**:
  * **Voice Alert ON/OFF**: Enables or disables the voice alert entirely. Button label and colour update to reflect state (red when actively sounding, primary when enabled and silent).
  * **Acknowledge**: Stops the active alert and logs the acknowledgement timestamp to the backend.
* **Accessibility**: An `aria-live="assertive"` region announces the alert state to screen readers (VoiceOver, NVDA) without requiring keyboard focus.

---

## 4. Compliance and Violation Logic

For each actively monitored PPE category (e.g., Helmet):
1. **Compliance** is achieved only if:
   * The positive class is detected (`helmet` is present).
   * **AND** the negative class is NOT detected (`no helmet` is absent).
2. **Non-compliance (Violation)** is flagged if:
   * The negative class is detected (`no helmet` is present).
   * **OR** the positive class is missing entirely.
3. **Person gate**: Compliance evaluation only runs if at least one `person` is detected in the current frame. If no person is present, all existing alerts are silenced and the compliance panel is not updated.

If any monitored category is flagged as non-compliant while a person is in the frame, the system announces the violation by voice.

---

## 5. Responsive Design

The dashboard is fully responsive across device sizes:

| Device | Behaviour |
|:---|:---|
| **Mobile** (< 600 px) | Single-column layout. Sidebar stacks above camera. Camera uses 16:9 aspect ratio. Padding is compact (12 px). |
| **Tablet** (600–900 px) | Single-column with standard padding (16 px). Sidebar scales to full width. |
| **Desktop** (≥ 900 px) | Two-column layout: `clamp(260px, 28vw, 340px)` sidebar + flexible camera panel. Camera uses 4:3 aspect ratio. Padding 24 px. |

The top AppBar collapses navigation links into a hamburger menu on mobile/tablet viewports.
