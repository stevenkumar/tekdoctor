const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'frontend', 'src');

function walk(dir, callback) {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            walk(fullPath, callback);
        } else {
            callback(fullPath);
        }
    });
}

const targetExtensions = ['.ts', '.tsx'];
let filesUpdated = 0;
let totalReplacements = 0;

console.log(`Starting replacement of cyan classes in ${srcDir}...`);

walk(srcDir, (filePath) => {
    const ext = path.extname(filePath);
    if (!targetExtensions.includes(ext)) {
        return;
    }

    // Ignore page_old.tsx just in case
    if (filePath.endsWith('page_old.tsx')) {
        return;
    }

    const content = fs.readFileSync(filePath, 'utf8');

    // Replace cyan-300, cyan-400, cyan-500, cyan-600 with neon-cyan
    const regex = /\bcyan-(300|400|500|600)\b/g;

    let matchCount = 0;
    const newContent = content.replace(regex, (match) => {
        matchCount++;
        return 'neon-cyan';
    });

    if (matchCount > 0) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        filesUpdated++;
        totalReplacements += matchCount;
        console.log(`Updated ${filePath}: ${matchCount} replacements.`);
    }
});

console.log(`Replacement complete! Updated ${filesUpdated} files with ${totalReplacements} total replacements.`);
