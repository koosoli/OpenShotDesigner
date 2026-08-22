/**
 * Solar position and daylight times (plan §37).
 *
 * Where the sun is, for a location pin and a moment. Exteriors are scheduled
 * around this: which way the light comes from at the call time, when the
 * backlight arrives, how long the golden hour lasts, and whether a scene is
 * still shootable at 18:40 in October.
 *
 * Implements the NOAA solar position algorithm. Accuracy is around a tenth of a
 * degree for dates near the present, which is far finer than a floor plan needs.
 * Atmospheric refraction is applied to the apparent elevation, because that is
 * what decides when the sun looks like it has set.
 *
 * Conventions (AGENTS.md): angles in degrees, azimuth clockwise from true north
 * (0 = N, 90 = E, 180 = S, 270 = W), elevation positive above the horizon.
 * Planning aid only — not a substitute for a site recce (rule 15).
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export interface SunPosition {
  /** Clockwise from true north, 0–360. */
  azimuthDeg: number;
  /** Above the horizon, negative when the sun is down. Refraction applied. */
  elevationDeg: number;
  /** Where a shadow points: the azimuth opposite the sun. */
  shadowAzimuthDeg: number;
  /**
   * Shadow length as a multiple of object height, or null when the sun is at
   * or below the horizon (the shadow is unbounded, not "very long").
   */
  shadowLengthRatio: number | null;
}

/** Days since the J2000.0 epoch, including the fraction of a day. */
const julianDay = (date: Date): number => date.getTime() / 86400000 + 2440587.5;

/** Astronomical century since J2000.0. */
const julianCentury = (jd: number): number => (jd - 2451545) / 36525;

const geomMeanLongSun = (t: number): number => {
  const value = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  return value < 0 ? value + 360 : value;
};

const geomMeanAnomalySun = (t: number): number => 357.52911 + t * (35999.05029 - 0.0001537 * t);

const eccentricityEarthOrbit = (t: number): number =>
  0.016708634 - t * (0.000042037 + 0.0000001267 * t);

const sunEqOfCenter = (t: number): number => {
  const m = geomMeanAnomalySun(t) * DEG;
  return (
    Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m) * 0.000289
  );
};

const sunApparentLong = (t: number): number => {
  const trueLong = geomMeanLongSun(t) + sunEqOfCenter(t);
  const omega = 125.04 - 1934.136 * t;
  return trueLong - 0.00569 - 0.00478 * Math.sin(omega * DEG);
};

const meanObliquityOfEcliptic = (t: number): number =>
  23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;

const obliquityCorrection = (t: number): number =>
  meanObliquityOfEcliptic(t) + 0.00256 * Math.cos((125.04 - 1934.136 * t) * DEG);

/** Declination of the sun in degrees. */
export const solarDeclination = (t: number): number => {
  const e = obliquityCorrection(t) * DEG;
  const lambda = sunApparentLong(t) * DEG;
  return Math.asin(Math.sin(e) * Math.sin(lambda)) * RAD;
};

/** Equation of time in minutes: apparent solar time minus mean solar time. */
export const equationOfTime = (t: number): number => {
  const epsilon = obliquityCorrection(t) * DEG;
  const l0 = geomMeanLongSun(t) * DEG;
  const e = eccentricityEarthOrbit(t);
  const m = geomMeanAnomalySun(t) * DEG;

  const y = Math.tan(epsilon / 2) ** 2;
  const eTime =
    y * Math.sin(2 * l0) -
    2 * e * Math.sin(m) +
    4 * e * y * Math.sin(m) * Math.cos(2 * l0) -
    0.5 * y * y * Math.sin(4 * l0) -
    1.25 * e * e * Math.sin(2 * m);
  return eTime * 4 * RAD;
};

/**
 * Atmospheric refraction in degrees for a true elevation. Near the horizon the
 * sun appears about half a degree higher than it geometrically is, which is why
 * it is still visible after it has technically set.
 */
const refraction = (elevationDeg: number): number => {
  if (elevationDeg > 85) return 0;
  const te = Math.tan(elevationDeg * DEG);
  if (elevationDeg > 5) {
    return (58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5) / 3600;
  }
  if (elevationDeg > -0.575) {
    return (
      (1735 +
        elevationDeg * (-518.2 + elevationDeg * (103.4 + elevationDeg * (-12.79 + elevationDeg * 0.711)))) /
      3600
    );
  }
  return (-20.772 / te) / 3600;
};

export interface SunInput {
  /** Degrees north, -90..90. */
  lat: number;
  /** Degrees east, -180..180. */
  lng: number;
  /** The instant to compute for. */
  date: Date;
}

/** Where the sun is for a place and a moment. */
export const sunPosition = ({ lat, lng, date }: SunInput): SunPosition => {
  const jd = julianDay(date);
  const t = julianCentury(jd);
  const declination = solarDeclination(t);
  const eqTime = equationOfTime(t);

  // Minutes past midnight UTC.
  const utcMinutes =
    date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;

  // True solar time, then the hour angle: 0 at local solar noon, +15°/hour after.
  const trueSolarTime = (utcMinutes + eqTime + 4 * lng + 1440) % 1440;
  const hourAngle = trueSolarTime / 4 < 0 ? trueSolarTime / 4 + 180 : trueSolarTime / 4 - 180;

  const latRad = lat * DEG;
  const decRad = declination * DEG;
  const haRad = hourAngle * DEG;

  const cosZenith =
    Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);
  const zenith = Math.acos(Math.max(-1, Math.min(1, cosZenith))) * RAD;
  const trueElevation = 90 - zenith;
  const elevationDeg = trueElevation + refraction(trueElevation);

  let azimuthDeg: number;
  const denominator = Math.cos(latRad) * Math.sin(zenith * DEG);
  if (Math.abs(denominator) > 1e-9) {
    const cosAz = (Math.sin(latRad) * Math.cos(zenith * DEG) - Math.sin(decRad)) / denominator;
    const azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz))) * RAD;
    azimuthDeg = hourAngle > 0 ? (azimuth + 180) % 360 : (540 - azimuth) % 360;
  } else {
    // Straight overhead or at a pole: azimuth is undefined, so pick south/north.
    azimuthDeg = lat > 0 ? 180 : 0;
  }

  return {
    azimuthDeg,
    elevationDeg,
    shadowAzimuthDeg: (azimuthDeg + 180) % 360,
    shadowLengthRatio: elevationDeg > 0 ? 1 / Math.tan(elevationDeg * DEG) : null,
  };
};

export interface SunTimes {
  /** Local Date of each event, or null when it does not occur that day. */
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date;
  /** Sun between -6° and 0°: the blue hour. */
  civilDawn: Date | null;
  civilDusk: Date | null;
  /** Sun between 0° and 6°: the golden hour, the one people schedule around. */
  goldenHourMorningEnd: Date | null;
  goldenHourEveningStart: Date | null;
  /** True when the sun never rises (polar night) or never sets (midnight sun). */
  polarNight: boolean;
  midnightSun: boolean;
}

/**
 * Sample the day minute by minute and read the crossings off. Slower than the
 * closed-form hour-angle solution, but it handles the polar cases and the
 * golden/civil thresholds with the same code path instead of four variants that
 * each need their own edge-case handling.
 */
export const sunTimes = ({ lat, lng, date }: SunInput): SunTimes => {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const samples: Array<{ at: Date; elevation: number }> = [];
  for (let minute = 0; minute <= 1440; minute += 1) {
    const at = new Date(startOfDay.getTime() + minute * 60000);
    samples.push({ at, elevation: sunPosition({ lat, lng, date: at }).elevationDeg });
  }

  /** First time the elevation crosses `threshold` in the given direction. */
  const crossing = (threshold: number, rising: boolean): Date | null => {
    for (let i = 1; i < samples.length; i += 1) {
      const previous = samples[i - 1].elevation;
      const current = samples[i].elevation;
      if (rising ? previous < threshold && current >= threshold : previous >= threshold && current < threshold) {
        return samples[i].at;
      }
    }
    return null;
  };

  let solarNoon = samples[0];
  for (const sample of samples) if (sample.elevation > solarNoon.elevation) solarNoon = sample;

  const maxElevation = solarNoon.elevation;
  let minElevation = samples[0].elevation;
  for (const sample of samples) if (sample.elevation < minElevation) minElevation = sample.elevation;

  return {
    sunrise: crossing(0, true),
    sunset: crossing(0, false),
    solarNoon: solarNoon.at,
    civilDawn: crossing(-6, true),
    civilDusk: crossing(-6, false),
    goldenHourMorningEnd: crossing(6, true),
    goldenHourEveningStart: crossing(6, false),
    polarNight: maxElevation < 0,
    midnightSun: minElevation > 0,
  };
};

/** "HH:MM" in local time, or "—" when the event does not occur. */
export const formatSunTime = (value: Date | null): string =>
  value
    ? `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
    : '—';

/** Compass point for an azimuth, for labels that read faster than a number. */
export const compassPoint = (azimuthDeg: number): string => {
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const normalized = ((azimuthDeg % 360) + 360) % 360;
  return points[Math.round(normalized / 22.5) % 16];
};
