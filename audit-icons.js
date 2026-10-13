const fs = require('fs');
const path = require('path');
const lucide = require('./client/node_modules/lucide-react');

function getAllFiles(dir, exts, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (!['node_modules', 'dist', '.git'].includes(file)) {
        getAllFiles(fullPath, exts, fileList);
      }
    } else if (exts.includes(path.extname(file))) {
      fileList.push(fullPath);
    }
  });
  return fileList;
}

const files = getAllFiles('client/src', ['.ts', '.tsx']);
const missingIcons = [];
const usedIcons = new Set();
const potentialIssues = [];

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  
  // 1. Check imports from lucide-react
  const regex = /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/g;
  let match;
  const fileIcons = new Set();
  
  while ((match = regex.exec(content)) !== null) {
    const importedBlock = match[1];
    const items = importedBlock.split(',').map(s => s.trim()).filter(Boolean);
    items.forEach(rawItem => {
      const clean = rawItem.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').trim();
      if (!clean) return;
      const parts = clean.split(/\s+as\s+/);
      const originalName = parts[0].trim();
      const localName = parts[1] ? parts[1].trim() : originalName;
      if (originalName) {
        usedIcons.add(originalName);
        fileIcons.add(localName);
        if (typeof lucide[originalName] === 'undefined') {
          missingIcons.push({ file, icon: originalName });
        }
      }
    });
  }

  // 2. Check for potentially broken dynamic icon rendering: <Icon ... /> or <item.icon ... />
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    // Check if dynamic icon tag could be null or undefined
    if (/<(item\.)?icon\b/i.test(line) && !/React\.cloneElement/i.test(line)) {
      potentialIssues.push({
        file: path.relative('client/src', file),
        line: idx + 1,
        snippet: line.trim(),
        type: 'Dynamic icon usage'
      });
    }

    // Check for size="0" or w-0 or h-0 on icon tags
    for (const iconName of fileIcons) {
      if (line.includes(`<${iconName}`) && (line.includes('size={0}') || line.includes('w-0') || line.includes('h-0'))) {
        potentialIssues.push({
          file: path.relative('client/src', file),
          line: idx + 1,
          snippet: line.trim(),
          type: 'Potential zero-size icon'
        });
      }
    }
  });
});

console.log('Total unique Lucide icons imported:', usedIcons.size);
console.log('Missing/undefined Lucide icon imports:', JSON.stringify(missingIcons, null, 2));
console.log('Dynamic icon usage / potential issues found:', JSON.stringify(potentialIssues, null, 2));
