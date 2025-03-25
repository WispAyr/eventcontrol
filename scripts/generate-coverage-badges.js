const fs = require('fs');
const path = require('path');

// Badge colors based on coverage percentage
function getBadgeColor(coverage) {
    if (coverage >= 90) return 'brightgreen';
    if (coverage >= 80) return 'green';
    if (coverage >= 70) return 'yellowgreen';
    if (coverage >= 60) return 'yellow';
    return 'red';
}

// Generate badge URL for shields.io
function generateBadgeUrl(label, coverage) {
    const color = getBadgeColor(coverage);
    return `https://img.shields.io/badge/${label}-${coverage}%25-${color}`;
}

try {
    // Read coverage summary
    const coveragePath = path.join(__dirname, '../coverage/coverage-summary.json');
    const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
    const total = coverage.total;

    // Generate badges
    const badges = {
        lines: generateBadgeUrl('coverage%20lines', total.lines.pct),
        statements: generateBadgeUrl('coverage%20statements', total.statements.pct),
        branches: generateBadgeUrl('coverage%20branches', total.branches.pct),
        functions: generateBadgeUrl('coverage%20functions', total.functions.pct)
    };

    // Update README.md with badges
    const readmePath = path.join(__dirname, '../README.md');
    let readme = fs.readFileSync(readmePath, 'utf8');

    // Replace or add coverage badges section
    const badgeSection = `## Test Coverage
![Lines](${badges.lines})
![Statements](${badges.statements})
![Branches](${badges.branches})
![Functions](${badges.functions})

Last updated: ${new Date().toISOString()}`;

    const coverageRegex = /## Test Coverage[\s\S]*?(?=\n\n|$)/;
    if (coverageRegex.test(readme)) {
        readme = readme.replace(coverageRegex, badgeSection);
    } else {
        readme += `\n\n${badgeSection}`;
    }

    fs.writeFileSync(readmePath, readme);
    console.log('Coverage badges updated successfully!');

    // Generate detailed HTML report
    const reportPath = path.join(__dirname, '../coverage/index.html');
    if (fs.existsSync(reportPath)) {
        console.log(`Detailed coverage report available at: ${reportPath}`);
    }

} catch (error) {
    console.error('Failed to generate coverage badges:', error);
    process.exit(1);
} 