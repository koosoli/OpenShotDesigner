# Lighting modifiers and photometrics

Select a light and open **Modifiers & Accessories** in the Inspector. Add the
accessories in physical order and disable or remove anything not currently
fitted. Every enabled modifier uses the shared Asset Library symbol on the plan,
in PNG output and in printed floor plans. Enabled accessories also appear in the
derived equipment manifest.

An effective beam angle and transmission are optional facts, not presets. Leave
either field blank when it is not known. A gel colour changes the drawn beam;
soft, hard and omnidirectional modifiers change its visual treatment. Exact cone
geometry changes only when an effective angle is entered.

## Photometric reference

Open **Photometric Calculator** and enter:

- the reference output in lux or foot-candles;
- the distance at which it applies;
- the dimmer percentage used for that reading;
- whether the reading includes the current modifier stack;
- its source type and, where available, a source label or URL.

The project stores illuminance in lux and distance in millimetres. The Inspector
converts to the current plan unit at the display boundary. If the reference is
for the bare fixture, every enabled modifier needs an explicit transmission
percentage before a final result is shown. Unknown transmission never silently
becomes 100%.

**Show photometric labels in light cone** is an additional per-fixture opt-in.
It starts off, and the normal Light beams display option must also be enabled.
Metric plans label lux at metre intervals; imperial plans label foot-candles at
foot intervals. The same labels can be included in floor-plan printing.

Photometric output is a planning estimate using inverse-square falloff and a
linear dimmer approximation. Beam optics, field angle, atmosphere, fixture
calibration and LED dimming curves can produce different real readings. Verify
critical values with current manufacturer data and an on-set light meter.
