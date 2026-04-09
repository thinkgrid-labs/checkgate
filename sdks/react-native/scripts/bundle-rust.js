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

// Copy core/src and core/Cargo.toml
copyRecursive(path.join(coreDir, 'src'), path.join(destDir, 'src'));
fs.copyFileSync(path.join(coreDir, 'Cargo.toml'), path.join(destDir, 'Cargo.toml'));

// HOT-FIX: Update the SDK's Cargo.toml (in our current directory) 
// to point to the local bundled core for the npm release.
const sdkCargoPath = path.join(sdkDir, 'Cargo.toml');
let sdkCargo = fs.readFileSync(sdkCargoPath, 'utf8');
sdkCargo = sdkCargo.replace(/path\s*=\s*"\.\.\/\.\.\/core"/, 'path = "./rust-core"');
fs.writeFileSync(sdkCargoPath, sdkCargo);

console.log('[Checkgate] Rust core bundled and Cargo.toml patched for React Native SDK.');
