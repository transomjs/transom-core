const shell = require('shelljs');

// // Is the repos all checked-in?
const isClean = exec('git status --porcelain');
if (isClean.stdout || isClean.stderr) {
    console.error('Git working directory is not clean.');
    console.error(isClean.stdout, isClean.stderr);
    process.exit(2);
}

// Get major/minor/patch from the command line
let versionIncrement;
if (process.argv.length > 2) {
    versionIncrement = process.argv[2];
}
const validVersions = ['major', 'minor', 'patch'];
if (validVersions.indexOf(versionIncrement) === -1) {
    console.error(`Usage: node release.js ${validVersions.join('|')} [beta]`);
    process.exit(1);
}

let isBeta = false;
if (process.argv.length > 3) {
    isBeta = (process.argv[3] === 'beta');
}

if (isBeta) {
    // Increment the version in package.json & create a new tag in git.
    exec(`npm version pre${versionIncrement} --message "Beta version, ${versionIncrement} %s"`);

    // Run tests and deploy to npm.
    exec('npm test');
    exec('git push');
    exec('git push --tags');
    exec('npm publish --access public --tag beta');
} else {
    // Increment the version in package.json & create a new tag in git.
    exec(`npm version ${versionIncrement}`);

    // Run tests and deploy to npm.
    exec('npm test');
    exec('git push');
    exec('git push --tags');
    exec('npm publish --access public');
}

// Run commands quietly, log output and exit only on errors.
function exec(cmd) {
    const ret = shell.exec(cmd, {
        silent: true
    });

    if (ret.code != 0) {
        console.error("Error:", ret.stdout, ret.stderr);
        process.exit(1);
    }
    return ret;
}
