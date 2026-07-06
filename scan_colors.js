import fs from 'fs';
import path from 'path';

function getColors() {
  const dir = './src';
  const colors = new Set();
  
  function walk(current) {
    const files = fs.readdirSync(current);
    for (const file of files) {
      const full = path.join(current, file);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
      } else if (full.endsWith('.tsx') || full.endsWith('.ts')) {
        const content = fs.readFileSync(full, 'utf8');
        const matches = content.match(/(bg|text|border|ring|from|to)-[a-z]+-?[0-9]*/g);
        if (matches) {
          matches.forEach(m => colors.add(m));
        }
        const matchesWhite = content.match(/(bg|text|border|ring)-white/g);
        if (matchesWhite) {
          matchesWhite.forEach(m => colors.add(m));
        }
      }
    }
  }
  
  walk(dir);
  console.log(Array.from(colors).sort().join('\n'));
}

getColors();
