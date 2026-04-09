const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../../..');
const sdkDir = path.resolve(__dirname, '..');
const coreDir = path.join(rootDir, 'core');
const destDir = path.join(sdkDir, 'rust-core');

console.log(`[Checkgate] Bundling Rust core from ${coreDir}...`);

if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
}

function copyRecursive(src, dest) {
    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest);
        fs.readdirSync(src).forEach(child => {
            copyRecursive(path.join(src, child), path.join(dest, child));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

copyRecursive(path.join(coreDir, 'src'), path.join(destDir, 'src'));
fs.copyFileSync(path.join(coreDir, 'Cargo.toml'), path.join(destDir, 'Cargo.toml'));

console.log('[Checkgate] Rust core bundled for Flutter SDK.');
