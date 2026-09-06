// NOAA solar position algorithm — computes official sunrise/sunset
// (zenith 90.833°) for a given latitude/longitude and date.
//
// Returns UTC Date objects, or null at extreme latitudes during
// polar day/night.
//
// Used by the HonorPole AUTO Schedule Status display.

const RAD = Math.PI / 180;

function julian(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

function geomMeanAnomaly(t: number): number {
  const m = (357.529 + 35999.05 * t) % 360;
  return ((m % 360) + 360) % 360;
}

function geomMeanLongitude(t: number): number {
  const l =
    (280.46646 + 36000.76983 * t) % 360;

  return ((l % 360) + 360) % 360;
}

function eccentricity(t: number): number {
  return (
    0.016708634 -
    0.000042037 * t
  );
}

function sunEqOfCenter(
  t: number,
  m: number
): number {
  const mr = m * RAD;

  return (
    Math.sin(mr) *
      (
        1.914602 -
        0.004817 * t -
        0.000014 * t * t
      ) +
    Math.sin(2 * mr) *
      (
        0.019996 -
        0.000101 * t
      ) +
    Math.sin(3 * mr) *
      0.000289
  );
}

function sunTrueLongitude(
  t: number,
  m: number
): number {
  return (
    geomMeanLongitude(t) +
    sunEqOfCenter(t, m)
  );
}

function sunApparentLongitude(
  t: number,
  m: number
): number {
  const omega =
    (125.04 - 1934.136 * t) *
    RAD;

  return (
    sunTrueLongitude(t, m) -
    0.00569 -
    0.00478 * Math.sin(omega)
  );
}

function meanObliquityOfEcliptic(
  t: number
): number {
  const seconds =
    21.448 -
    t *
      (
        46.815 +
        t *
          (
            0.00059 -
            t * 0.001813
          )
      );

  return (
    23.0 +
    (
      26.0 +
      seconds / 60
    ) /
      60
  );
}

function obliquityCorrection(
  t: number
): number {
  const e0 =
    meanObliquityOfEcliptic(t);

  const omega =
    (125.04 - 1934.136 * t) *
    RAD;

  return (
    e0 +
    0.00256 *
      Math.cos(omega)
  );
}

function sunDeclination(
  t: number,
  m: number
): number {
  const ob =
    obliquityCorrection(t) *
    RAD;

  const lambda =
    sunApparentLongitude(
      t,
      m
    ) * RAD;

  return (
    Math.asin(
      Math.sin(ob) *
        Math.sin(lambda)
    ) / RAD
  );
}

function equationOfTime(
  t: number,
  m: number
): number {
  const epsilon =
    obliquityCorrection(t) *
    RAD;

  const l0 =
    geomMeanLongitude(t) *
    RAD;

  const e =
    eccentricity(t);

  const mr =
    m * RAD;

  let y =
    Math.tan(epsilon / 2);

  y = y * y;

  const sin2l0 =
    Math.sin(2 * l0);

  const cos2l0 =
    Math.cos(2 * l0);

  const sin4l0 =
    Math.sin(4 * l0);

  const sinm =
    Math.sin(mr);

  const sin2m =
    Math.sin(2 * mr);

  const Etime =
    y * sin2l0 -
    2 * e * sinm +
    4 *
      e *
      y *
      sinm *
      cos2l0 -
    0.5 *
      y *
      y *
      sin4l0 -
    1.25 *
      e *
      e *
      sin2m;

  return (
    Etime / RAD
  ) * 4;
}

function hourAngle(
  lat: number,
  decl: number,
  zenithDeg: number
): number | null {
  const latR =
    lat * RAD;

  const declR =
    decl * RAD;

  const z =
    zenithDeg * RAD;

  const cosH =
    (
      Math.cos(z) -
      Math.sin(latR) *
        Math.sin(declR)
    ) /
    (
      Math.cos(latR) *
      Math.cos(declR)
    );

  if (
    cosH > 1 ||
    cosH < -1
  ) {
    return null;
  }

  return (
    Math.acos(cosH) /
    RAD
  );
}

const ZENITH = 90.833;

export interface SunriseSunset {
  sunrise: Date | null;
  sunset: Date | null;
}

export function getSunriseSunset(
  lat: number,
  lng: number,
  date: Date
): SunriseSunset {
  const noon =
    new Date(
      Date.UTC(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        12,
        0,
        0
      )
    );

  const t =
    (
      julian(noon) -
      2451545.0
    ) /
    36525;

  const m =
    geomMeanAnomaly(t);

  const decl =
    sunDeclination(t, m);

  const eqTime =
    equationOfTime(t, m);

  const ha =
    hourAngle(
      lat,
      decl,
      ZENITH
    );

  if (ha == null) {
    return {
      sunrise: null,
      sunset: null,
    };
  }

  const sunriseMin =
    720 -
    4 * (lng + ha) -
    eqTime;

  const sunsetMin =
    720 -
    4 * (lng - ha) -
    eqTime;

  const dayStart =
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );

  return {
    sunrise:
      new Date(
        dayStart +
          sunriseMin * 60000
      ),

    sunset:
      new Date(
        dayStart +
          sunsetMin * 60000
      ),
  };
}