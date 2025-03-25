module.exports = {
    env: {
        node: true,
        es2021: true,
        jest: true
    },
    extends: [
        'eslint:recommended'
    ],
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
    },
    rules: {
        'indent': ['error', 4],
        'linebreak-style': ['error', 'unix'],
        'quotes': ['error', 'single'],
        'semi': ['error', 'always'],
        'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }],
        'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
        'max-len': ['warn', { 'code': 120 }],
        'prefer-const': 'error',
        'arrow-spacing': 'error',
        'no-var': 'error',
        'object-curly-spacing': ['error', 'always'],
        'array-bracket-spacing': ['error', 'never'],
        'comma-dangle': ['error', 'never'],
        'eol-last': ['error', 'always']
    },
    ignorePatterns: [
        'node_modules/',
        'coverage/',
        'dist/',
        '*.min.js'
    ]
}; 