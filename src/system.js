// Deterministic system generator.
// From a seed (derived from a star's spatial hash), generate:
//  - Star: spectral class, name, designation, temperature, mass, etc.
//  - Planets: name, type, orbit radius, angular position, properties
//  - Lore flavor: colonization status, survey date, habitability
//
// Golden-age colonization feel — designations like "ICS-4417 Tellus",
// "Corvus Archaeonaut Relay", "Chart VII survey".

import { makeRng } from './rng.js';

// Name fragments — evocative but original. Mix Latin, Greek, classical,
// cartographer's lexicon, colonist-era poetics.
const STAR_PREFIXES = [
  'ICS', 'HCS', 'CCS', 'HS', 'BR', 'TH', 'XR', 'MR', 'ORS', 'CVN',
];

const STAR_NAMES = [
  'Vesperan', 'Aurelian', 'Saelith', 'Ordinal', 'Kephrion',
  'Tabris', 'Mael', 'Quintus', 'Arcus', 'Vorix',
  'Helion', 'Thale', 'Solen', 'Nyxara', 'Orpheion',
  'Caelix', 'Umbriel', 'Valden', 'Sabine', 'Corvine',
  'Meredon', 'Halix', 'Ysgrim', 'Calibar', 'Terox',
  'Lathe', 'Phoros', 'Erithane', 'Marden', 'Volanx',
  'Seren', 'Aurigin', 'Kestra', 'Doran', 'Thyrne',
];

const PLANET_SUFFIXES = [
  'Prime', 'Secundus', 'Tertius', 'Quarta', 'Quinta', 'Sexta', 'Septima', 'Octava',
];

// Spectral class, weighted realistically-ish
// [prob, class, color, temperatureRange, relativeRadius]
const SPECTRAL = [
  { p: 0.02, cls: 'O', color: '#a8c8ff', temp: [30000, 50000], radius: [1.8, 2.4], lum: 2.8 },
  { p: 0.05, cls: 'B', color: '#b8d0ff', temp: [10000, 30000], radius: [1.4, 1.9], lum: 2.2 },
  { p: 0.08, cls: 'A', color: '#ffffff', temp: [7500, 10000], radius: [1.2, 1.5], lum: 1.6 },
  { p: 0.15, cls: 'F', color: '#fff4d8', temp: [6000, 7500], radius: [1.0, 1.3], lum: 1.2 },
  { p: 0.20, cls: 'G', color: '#ffe8a8', temp: [5200, 6000], radius: [0.9, 1.1], lum: 1.0 },
  { p: 0.25, cls: 'K', color: '#ffb070', temp: [3700, 5200], radius: [0.7, 0.9], lum: 0.7 },
  { p: 0.25, cls: 'M', color: '#ff7458', temp: [2400, 3700], radius: [0.4, 0.7], lum: 0.4 },
];

function pickSpectral(rng) {
  const r = rng();
  let acc = 0;
  for (const s of SPECTRAL) {
    acc += s.p;
    if (r < acc) return s;
  }
  return SPECTRAL[SPECTRAL.length - 1];
}

// Planet types
const PLANET_TYPES = [
  { key: 'rock',     label: 'ROCKY',           color: '#8a7a6a', prob: 0.20 },
  { key: 'desert',   label: 'DESERT',          color: '#c89058', prob: 0.12 },
  { key: 'terra',    label: 'TERRAN',          color: '#6aa878', prob: 0.10 },
  { key: 'ocean',    label: 'PELAGIC',         color: '#5a9ab0', prob: 0.08 },
  { key: 'ice',      label: 'GLACIAL',         color: '#c8e0e8', prob: 0.12 },
  { key: 'lava',     label: 'CHTHONIC',        color: '#d06040', prob: 0.05 },
  { key: 'toxic',    label: 'TOXIC',           color: '#9aa840', prob: 0.05 },
  { key: 'gas',      label: 'JOVIAN',          color: '#b0886a', prob: 0.16 },
  { key: 'icegiant', label: 'NEPTUNIAN',       color: '#6aa0c8', prob: 0.08 },
  { key: 'barren',   label: 'BARREN',          color: '#5a5a5a', prob: 0.04 },
];

function pickPlanetType(rng) {
  const r = rng();
  let acc = 0;
  for (const t of PLANET_TYPES) {
    acc += t.prob;
    if (r < acc) return t;
  }
  return PLANET_TYPES[0];
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function padInt(n, len) {
  return String(n).padStart(len, '0');
}

function formatCoord(h) {
  // Fake galactic coords — looks like "34°17'22" / +08°41'55""
  const deg = Math.floor(h * 360);
  const min = Math.floor(((h * 360) % 1) * 60);
  const sec = Math.floor(((h * 360 * 60) % 1) * 60);
  return `${padInt(deg, 3)}°${padInt(min, 2)}'${padInt(sec, 2)}"`;
}

export function generateSystem(seed) {
  const rng = makeRng(seed);
  const spec = pickSpectral(rng);

  const prefix = pick(rng, STAR_PREFIXES);
  const name = pick(rng, STAR_NAMES);
  const catalogId = Math.floor(rng() * 9000 + 1000);

  const temperature = Math.floor(spec.temp[0] + rng() * (spec.temp[1] - spec.temp[0]));
  const starRadius = +(spec.radius[0] + rng() * (spec.radius[1] - spec.radius[0])).toFixed(2);
  const mass = +(0.8 * starRadius + rng() * 0.3).toFixed(2);

  // Planet count: 2..8
  const planetCount = 2 + Math.floor(rng() * 7);
  const planets = [];
  let lastOrbit = 0.6 + rng() * 0.3;
  for (let i = 0; i < planetCount; i++) {
    const type = pickPlanetType(rng);
    const orbit = lastOrbit + 0.25 + rng() * 0.55;
    lastOrbit = orbit;

    const radius = 0.3 + rng() * (type.key.includes('gas') || type.key === 'icegiant' ? 3.5 : 1.2);
    const angle = rng() * Math.PI * 2;
    const ecc = rng() * 0.15; // eccentricity (small, roughly circular)

    // Name: <StarName>-<Roman suffix> for the first 3, then numeric for outer
    let planetName;
    if (i < PLANET_SUFFIXES.length) {
      planetName = `${name} ${PLANET_SUFFIXES[i]}`;
    } else {
      planetName = `${name} ${i + 1}`;
    }

    // Moons: small chance, more for gas giants
    let moons = 0;
    if (type.key === 'gas' || type.key === 'icegiant') moons = Math.floor(rng() * 12) + 3;
    else if (rng() < 0.35) moons = Math.floor(rng() * 3) + 1;

    planets.push({
      name: planetName,
      designation: `${prefix}-${catalogId}/${i + 1}`,
      type: type.key,
      typeLabel: type.label,
      color: type.color,
      orbit,         // AU-ish
      radius,        // Earth-radii-ish
      angle,
      ecc,
      moons,
      hasRings: (type.key === 'gas' || type.key === 'icegiant') && rng() < 0.45,
      survey: rng() < 0.4 ? 'CHARTED' : (rng() < 0.5 ? 'PRELIMINARY' : 'UNSURVEYED'),
      habitability: +(rng()).toFixed(2),
    });
  }

  // Coords (deterministic from seed)
  const longH = (seed * 0.00017) % 1;
  const latH  = ((seed >>> 7) * 0.00029) % 1;
  const galCoord = `${formatCoord(longH)} / ${(latH > 0.5 ? '+' : '-')}${formatCoord(Math.abs(latH - 0.5) * 2)}`;

  // Colonization status — golden-age flavor
  const statusRoll = rng();
  let status, surveyYear;
  if (statusRoll < 0.15) {
    status = 'CORE';
    surveyYear = 2287 + Math.floor(rng() * 40);
  } else if (statusRoll < 0.45) {
    status = 'SETTLED';
    surveyYear = 2330 + Math.floor(rng() * 80);
  } else if (statusRoll < 0.70) {
    status = 'FRONTIER';
    surveyYear = 2410 + Math.floor(rng() * 90);
  } else if (statusRoll < 0.90) {
    status = 'SURVEY';
    surveyYear = 2500 + Math.floor(rng() * 40);
  } else {
    status = 'UNCHARTED';
    surveyYear = null;
  }

  return {
    seed,
    designation: `${prefix}-${catalogId}`,
    name,
    fullName: `${prefix}-${catalogId} ${name}`,
    spectral: spec,
    spectralClass: spec.cls,
    starColor: spec.color,
    temperature,
    starRadius,
    mass,
    luminosity: +(spec.lum * Math.pow(starRadius / 1.0, 2)).toFixed(2),
    planets,
    galCoord,
    status,
    surveyYear,
    charterNumber: `CHT.${Math.floor(rng() * 9000 + 1000)}`,
    // Drift numbers for decoration
    proper: `${(rng() * 40).toFixed(2)} km/s`,
    distance: `${(rng() * 4800 + 200).toFixed(0)} ly`,
  };
}
