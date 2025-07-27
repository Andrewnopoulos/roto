// Examining project structure for Rota platform
const fs = require('fs');
const path = require('path');

function exploreDirectory(dirPath) {
    try {
        const items = fs.readdirSync(dirPath);
        console.log(`Contents of ${dirPath}:`);
        items.forEach(item => {
            const itemPath = path.join(dirPath, item);
            const stats = fs.statSync(itemPath);
            console.log(`${stats.isDirectory() ? 'DIR' : 'FILE'}: ${item}`);
        });
    } catch (error) {
        console.error('Error reading directory:', error.message);
    }
}

exploreDirectory('.');