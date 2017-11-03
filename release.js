const shell = require('shelljs');

// Is the repos all checked-in?
const isClean = exec('git status --porcelain');
if (isClean.stdout || isClean.stderr) {
    console.error('Git working directory is not clean.');
    console.error(isClean.stdout, isClean.stderr);
    process.exit(2);
}

// Get major/minor/patch from the command line
const versionIncrement = process.argv[process.argv.length - 1];

if (versionIncrement != 'major' && versionIncrement != 'minor' && versionIncrement != 'patch') {
    console.error('Usage: node release.js major|minor|patch');
    process.exit(1);
}

// Increment the version in package.json
exec('npm version ' + versionIncrement);

// Run tests and deploy to npm.
exec('npm test');
exec('git push');
exec('git push --tags');
exec('npm publish --access public');

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
