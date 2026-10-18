const data = require('../../client/src/data/indiaStatesDistricts.json');
const serverData = require('../data/indiaStatesDistricts.json');
const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.resolve(__dirname, '../../client/src/config/constants.ts'), 'utf8');
const match = content.match(/export const INDIAN_STATES = \[\s*([\s\S]*?)\] as const;/);
const states = match[1].split('\n').map(s => s.replace(/['",]/g, '').trim()).filter(Boolean);

console.log('States from constants.ts:', states.length);
console.log('States in client JSON:', Object.keys(data).length);
console.log('States in server JSON:', Object.keys(serverData).length);

const missing = states.filter(s => !data[s]);
const extra = Object.keys(data).filter(s => !states.includes(s));
console.log('Missing in JSON:', missing);
console.log('Extra in JSON:', extra);

let totalDistricts = 0;
let errors = 0;
for (const [state, districts] of Object.entries(data)) {
  if (!Array.isArray(districts) || districts.length === 0) {
    console.error(`ERROR: ${state} has empty districts list!`);
    errors++;
  }
  const duplicates = districts.filter((d, i) => districts.indexOf(d) !== i);
  if (duplicates.length > 0) {
    console.error(`ERROR: ${state} has duplicates:`, duplicates);
    errors++;
  }
  totalDistricts += districts.length;
}

console.log(`Total districts across India: ${totalDistricts}`);
console.log(`Uttar Pradesh districts: ${data['Uttar Pradesh'].length}`);
console.log(`Maharashtra districts: ${data['Maharashtra'].length}`);
console.log(`Total errors: ${errors}`);

// Compare client JSON and server JSON
const clientJsonStr = JSON.stringify(data);
const serverJsonStr = JSON.stringify(serverData);
console.log('Client and Server datasets identical:', clientJsonStr === serverJsonStr);
