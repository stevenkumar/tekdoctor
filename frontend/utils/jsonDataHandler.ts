import fs from 'fs';

import path from 'path';

const dataFilePath = path.join(process.cwd(), 'data', 'repairs.json'); // Ensure 'data' directory exists

// Helper to ensure the data directory and file exist
const ensureDataFile = () => {
  const dataDir = path.dirname(dataFilePath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(dataFilePath)) {
    fs.writeFileSync(dataFilePath, JSON.stringify([], null, 2));
  }
};

export const readRepairData = async () => {
  ensureDataFile();
  try {
    const fileContent = await fs.promises.readFile(dataFilePath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error('Error reading repair data:', error);
    return [];
  }
};

export const writeRepairData = async (data: any[]) => {
  ensureDataFile();
  try {
    await fs.promises.writeFile(dataFilePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing repair data:', error);
  }
};
