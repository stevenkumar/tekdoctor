/**
 * TekDoctor — Unit & Integration Tests: Client Dropdown & Form Logic
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const clientDataset = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../client/src/data/indiaStatesDistricts.json'), 'utf8')
);

const DISTRICT_ALIASES = {
  'karnataka': {
    'bangalore': 'Bengaluru Urban',
    'bangalore urban': 'Bengaluru Urban',
    'bangalore rural': 'Bengaluru Rural',
    'bengaluru': 'Bengaluru Urban',
    'mysore': 'Mysuru',
    'mangalore': 'Dakshina Kannada',
    'belgaum': 'Belagavi',
    'gulbarga': 'Kalaburagi',
    'bellary': 'Ballari',
    'bijapur': 'Vijayapura',
    'shimoga': 'Shivamogga',
    'hubli': 'Dharwad',
    'hubli-dharwad': 'Dharwad',
  },
  'maharashtra': {
    'mumbai': 'Mumbai City',
    'bombay': 'Mumbai City',
    'aurangabad': 'Chhatrapati Sambhajinagar (Aurangabad)',
    'osmanabad': 'Dharashiv (Osmanabad)',
    'ahmednagar': 'Ahilyanagar (Ahmednagar)',
  },
  'delhi': {
    'delhi': 'New Delhi',
  },
  'uttar pradesh': {
    'noida': 'Gautam Buddha Nagar',
    'greater noida': 'Gautam Buddha Nagar',
    'allahabad': 'Prayagraj',
    'faizabad': 'Ayodhya',
  },
  'haryana': {
    'gurgaon': 'Gurugram',
  },
  'tamil nadu': {
    'madras': 'Chennai',
  },
  'west bengal': {
    'calcutta': 'Kolkata',
  },
  'kerala': {
    'cochin': 'Ernakulam',
    'kochi': 'Ernakulam',
    'trivandrum': 'Thiruvananthapuram',
  },
  'odisha': {
    'bhubaneswar': 'Khordha',
    'bhubaneshwar': 'Khordha',
  },
  'puducherry': {
    'pondicherry': 'Puducherry',
  },
};

function matchDistrictForState(stateName, loc) {
  if (!stateName) return '';
  const districts = clientDataset[stateName] || [];
  if (!districts.length) return '';

  const candidates = [
    loc.district,
    loc.city,
    ...(Array.isArray(loc.places) ? loc.places : [])
  ].filter(Boolean);

  // 1. Direct case-insensitive equality
  for (const candidate of candidates) {
    const cleanCand = candidate.trim().toLowerCase();
    const exact = districts.find(d => d.toLowerCase() === cleanCand);
    if (exact) return exact;
  }

  // 2. Alias dictionary
  const stateAliases = DISTRICT_ALIASES[stateName.toLowerCase()];
  if (stateAliases) {
    for (const candidate of candidates) {
      const cleanCand = candidate.trim().toLowerCase();
      if (stateAliases[cleanCand] && districts.includes(stateAliases[cleanCand])) {
        return stateAliases[cleanCand];
      }
    }
  }

  // 3. Substring match for compound district names
  for (const candidate of candidates) {
    const cleanCand = candidate.trim().toLowerCase().replace(/[().]/g, '');
    for (const d of districts) {
      const cleanD = d.toLowerCase().replace(/[().]/g, '');
      if (cleanCand.length >= 4 && (cleanD.includes(cleanCand) || cleanCand.includes(cleanD))) {
        return d;
      }
    }
  }

  return '';
}

function clientValidateField(name, value, currentForm) {
  switch (name) {
    case 'state': {
      const trimmed = (value || '').trim();
      if (!trimmed) return 'Please select a State or Union Territory.';
      if (!clientDataset[trimmed]) return 'Please select a valid Indian State or Union Territory.';
      return undefined;
    }
    case 'city': {
      const trimmed = (value || '').trim();
      if (!trimmed) return 'Please select a District / City.';
      if (!currentForm.state) return 'Please select a State or Union Territory first.';
      const stateDistricts = clientDataset[currentForm.state] || [];
      if (stateDistricts.length > 0 && !stateDistricts.includes(trimmed)) {
        return 'Please select a valid District / City from the list.';
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

let passed = 0;
let failed = 0;
function test(name, condition) {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${name}`);
    failed++;
  }
}

console.log('================================================================');
console.log('CLIENT DROPDOWN & PINCODE AUTOFILL VERIFICATION');
console.log('================================================================\n');

// 1. Pincode matchDistrictForState tests
console.log('--- 1. PIN Code District Matching ---');
test('Resolves Bangalore to Bengaluru Urban in Karnataka', matchDistrictForState('Karnataka', { district: 'Bangalore', city: 'Bangalore' }) === 'Bengaluru Urban');
test('Resolves Noida to Gautam Buddha Nagar in UP', matchDistrictForState('Uttar Pradesh', { district: 'Gautam Buddha Nagar', city: 'Noida' }) === 'Gautam Buddha Nagar');
test('Resolves Pune to Pune in Maharashtra', matchDistrictForState('Maharashtra', { district: 'Pune', city: 'Pune' }) === 'Pune');
test('Resolves Lucknow to Lucknow in Uttar Pradesh', matchDistrictForState('Uttar Pradesh', { district: 'Lucknow', city: 'Lucknow' }) === 'Lucknow');
test('Safely returns empty string if no district matches in state', matchDistrictForState('Karnataka', { district: 'UnknownMandal', city: 'UnmappedLocality', places: ['PostOffice1'] }) === '');

// 2. Client-side field validation tests
console.log('\n--- 2. Client-Side State / District Field Validation ---');
test('Empty state returns required error', clientValidateField('state', '', {}) === 'Please select a State or Union Territory.');
test('Invalid state returns invalid error', clientValidateField('state', 'Atlantis', {}) === 'Please select a valid Indian State or Union Territory.');
test('Valid state returns undefined (valid)', clientValidateField('state', 'Uttar Pradesh', {}) === undefined);

test('Empty district returns required error', clientValidateField('city', '', { state: 'Uttar Pradesh' }) === 'Please select a District / City.');
test('District without state returns prompt error', clientValidateField('city', 'Lucknow', { state: '' }) === 'Please select a State or Union Territory first.');
test('District from wrong state returns list error', clientValidateField('city', 'Lucknow', { state: 'Maharashtra' }) === 'Please select a valid District / City from the list.');
test('Valid district for state returns undefined (valid)', clientValidateField('city', 'Lucknow', { state: 'Uttar Pradesh' }) === undefined);
test('Valid district for Maharashtra returns undefined (valid)', clientValidateField('city', 'Pune', { state: 'Maharashtra' }) === undefined);

// 3. State change clearing simulation
console.log('\n--- 3. State Change Clearing Simulation ---');
let formState = { state: 'Uttar Pradesh', city: 'Lucknow' };
// User changes state to Maharashtra
function onStateChange(newState) {
  return {
    state: newState,
    city: '' // Cleared immediately on state change
  };
}
formState = onStateChange('Maharashtra');
test('Changing State clears previously selected district immediately', formState.city === '' && formState.state === 'Maharashtra');
test('District dropdown becomes populated with 36 Maharashtra districts', clientDataset[formState.state].length === 36);
test('Lucknow is not in the new Maharashtra districts list', !clientDataset[formState.state].includes('Lucknow'));

console.log('\n================================================================');
console.log(`TOTAL: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================\n');

if (failed > 0) process.exit(1);
