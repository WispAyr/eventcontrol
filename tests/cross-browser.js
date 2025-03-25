require('total.js').test(true);
const LOGGER = require('total.js/utils/logger');

// Test configuration using Total.js config
CONF['browser-test-timeout'] = 30000;
CONF['browser-test-retries'] = 2;
CONF['browser-test-screenshot-dir'] = 'screenshots';
CONF['browser-test-useragent'] = 'Total.js Test Runner';

// Test data using Total.js schema and validation
const testUser = NEWSCHEMA('user').make({
    username: 'browser_test_user',
    email: 'browser@test.com',
    password: 'BrowserTest123!',
    firstName: 'Browser',
    lastName: 'Tester',
    role: 'user'
});

// Test scenarios using Total.js routing patterns and schema validation
const scenarios = [
    {
        name: 'Authentication Flow',
        tests: [
            {
                name: 'User Registration',
                route: F.route('/api/auth/register'),
                schema: GETSCHEMA('user'),
                actions: async (page) => {
                    const form = GETSCHEMA('userform').make();
                    form.username = testUser.username;
                    form.email = testUser.email;
                    form.password = testUser.password;
                    form.firstName = testUser.firstName;
                    form.lastName = testUser.lastName;

                    const err = form.$validate();
                    if (err)
                        throw err;

                    await page.fill('[name="username"]', form.username);
                    await page.fill('[name="email"]', form.email);
                    await page.fill('[name="password"]', form.password);
                    await page.fill('[name="firstName"]', form.firstName);
                    await page.fill('[name="lastName"]', form.lastName);
                    await page.click('button[type="submit"]');
                    await page.waitForResponse(response => {
                        const url = response.url();
                        return F.is.url(url) && url.includes(F.route('/api/auth/register')) && response.status() === 200;
                    });
                }
            },
            {
                name: 'User Login',
                route: F.route('/api/auth/login'),
                schema: GETSCHEMA('login'),
                actions: async (page) => {
                    const form = GETSCHEMA('loginform').make();
                    form.username = testUser.username;
                    form.password = testUser.password;

                    const err = form.$validate();
                    if (err)
                        throw err;

                    await page.fill('[name="username"]', form.username);
                    await page.fill('[name="password"]', form.password);
                    await page.click('button[type="submit"]');
                    await page.waitForResponse(response => {
                        const url = response.url();
                        return F.is.url(url) && url.includes(F.route('/api/auth/login')) && response.status() === 200;
                    });
                }
            }
        ]
    },
    {
        name: 'Event Management',
        requiresAuth: true,
        tests: [
            {
                name: 'Create Event',
                route: F.route('/api/events'),
                schema: GETSCHEMA('event'),
                actions: async (page) => {
                    const eventData = GETSCHEMA('event').make({
                        name: 'Cross-browser Test Event',
                        description: 'Testing event creation',
                        venue: 'Test Venue',
                        type: 'PLANNED',
                        priority: 'HIGH',
                        startDate: NOW.add('1 day'),
                        endDate: NOW.add('2 days')
                    });

                    const err = eventData.$validate();
                    if (err)
                        throw err;

                    await page.fill('[name="name"]', eventData.name);
                    await page.fill('[name="description"]', eventData.description);
                    await page.fill('[name="venue"]', eventData.venue);
                    await page.selectOption('[name="type"]', eventData.type);
                    await page.selectOption('[name="priority"]', eventData.priority);
                    await page.fill('[name="startDate"]', eventData.startDate.format('yyyy-MM-dd'));
                    await page.fill('[name="endDate"]', eventData.endDate.format('yyyy-MM-dd'));
                    await page.click('button[type="submit"]');
                    await page.waitForResponse(response => {
                        const url = response.url();
                        return F.is.url(url) && url.includes(F.route('/api/events')) && response.status() === 201;
                    });
                }
            },
            {
                name: 'Event List',
                route: F.route('/api/events'),
                schema: GETSCHEMA('events'),
                actions: async (page) => {
                    const builder = NEWQUERY('events');
                    builder.where('type', 'PLANNED');
                    builder.take(10);
                    builder.skip(0);
                    builder.sort('createdAt', 'desc');

                    await page.selectOption('#type-filter', 'PLANNED');
                    await page.waitForResponse(response => {
                        const url = response.url();
                        return F.is.url(url) && url.includes(builder.toString());
                    });
                    
                    const searchQuery = U.encode('Test Event');
                    await page.fill('#search', 'Test Event');
                    await page.waitForResponse(response => {
                        const url = response.url();
                        return F.is.url(url) && url.includes(searchQuery);
                    });
                }
            }
        ]
    }
];

// Browser configurations with Total.js environment checks
const browsers = [
    { name: 'Chromium', engine: require('playwright').chromium, enabled: true },
    { name: 'Firefox', engine: require('playwright').firefox, enabled: !CONF.test },
    { name: 'WebKit', engine: require('playwright').webkit, enabled: !CONF.test }
];

// Helper functions using Total.js features
async function registerUser(userData) {
    const user = GETSCHEMA('user').make(userData);
    const err = user.$validate();
    if (err)
        throw err;

    const res = await TEST.request(F.route('/api/auth/register'))
        .post(user.$clean())
        .json();
    
    TEST.value(res.success, true, res.error || 'User registration failed');
    return res.value;
}

async function loginUser(username, password) {
    const login = GETSCHEMA('login').make({ username, password });
    const err = login.$validate();
    if (err)
        throw err;

    const res = await TEST.request(F.route('/api/auth/login'))
        .post(login.$clean())
        .json();
    
    TEST.value(res.success, true, res.error || 'User login failed');
    return res.value.token;
}

async function cleanup() {
    await TABLE('users').remove().where('username', testUser.username);
    await TABLE('events').remove().where('createdBy', testUser.username);
}

// Test runner using Total.js async test framework
ASYNC('Cross-browser Tests', function*() {
    let userToken;
    const results = {};

    try {
        yield cleanup();

        const userData = yield registerUser(testUser);
        userToken = yield loginUser(testUser.username, testUser.password);

        for (const { name: browserName, engine, enabled } of browsers) {
            if (!enabled) {
                LOGGER.info('browser-tests', `Skipping ${browserName} in ${F.environment}`);
                continue;
            }

            const browser = yield engine.launch({
                headless: !DEBUG,
                args: ['--no-sandbox']
            });

            const context = yield browser.newContext({
                viewport: { width: 1280, height: 720 },
                userAgent: CONF['browser-test-useragent']
            });

            results[browserName] = {
                passed: 0,
                failed: 0,
                total: 0,
                errors: []
            };

            for (let retry = 0; retry <= CONF['browser-test-retries']; retry++) {
                LOGGER.info('browser-tests', `Starting tests for ${browserName} (Attempt ${retry + 1})`);

                for (const scenario of scenarios) {
                    TEST(`${browserName} - ${scenario.name}`, function*() {
                        const page = yield context.newPage();
                        
                        if (scenario.requiresAuth && userToken) {
                            yield page.setExtraHTTPHeaders({
                                'X-Token': userToken,
                                'X-Test': F.environment
                            });
                        }

                        for (const test of scenario.tests) {
                            try {
                                results[browserName].total++;

                                yield page.goto(test.route, { 
                                    waitUntil: 'networkidle',
                                    timeout: CONF['browser-test-timeout']
                                });

                                yield test.actions(page);
                                results[browserName].passed++;

                            } catch (error) {
                                results[browserName].failed++;
                                results[browserName].errors.push({
                                    test: test.name,
                                    error: error.message,
                                    attempt: retry + 1
                                });

                                const screenshotPath = PATH.public(
                                    CONF['browser-test-screenshot-dir'] + '/' +
                                    `${browserName}-${test.name}-attempt${retry + 1}.png`
                                );
                                
                                yield page.screenshot({ path: screenshotPath, fullPage: true });
                                
                                F.error(error, 'browser-tests', {
                                    browser: browserName,
                                    test: test.name,
                                    attempt: retry + 1,
                                    screenshot: screenshotPath
                                });

                                if (retry < CONF['browser-test-retries'])
                                    continue;
                            }
                        }

                        yield page.close();
                    });
                }

                if (results[browserName].failed === 0)
                    break;
            }

            yield browser.close();
        }

        const report = {
            timestamp: NOW,
            environment: F.environment,
            version: CONF.version,
            node: process.version,
            uptime: F.uptime,
            memoryUsage: F.usage(),
            summary: Object.values(results).reduce((sum, r) => ({
                total: sum.total + r.total,
                passed: sum.passed + r.passed,
                failed: sum.failed + r.failed
            }), { total: 0, passed: 0, failed: 0 }),
            details: results
        };

        F.Fs.mkdir('reports', { recursive: true });
        
        const reportPath = PATH.join(PATH.root(), 'reports', 
            `cross-browser-${NOW.format('yyyy-MM-dd-HH-mm')}.json`);
            
        F.Fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        
        F.success('browser-tests', `Report generated at ${reportPath}`);

        Object.entries(results).forEach(([browser, result]) => {
            TEST.value(result.failed, 0, `${browser} had ${result.failed} failed tests`);
        });

    } catch (error) {
        F.error(error, 'browser-tests');
        throw error;
    } finally {
        yield cleanup();
    }
}); 