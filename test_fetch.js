// Test script to verify fetch works with node-fetch v2
const fetch = globalThis.fetch || require('node-fetch');

async function testFetch() {
    console.log('Testing fetch functionality...');
    console.log('Node version:', process.version);
    console.log('Fetch type:', typeof fetch);

    try {
        // Test with a public URL
        const testUrl = 'https://httpbin.org/status/200';
        console.log('\nTesting fetch with:', testUrl);

        const response = await fetch(testUrl);
        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);

        // Test buffer method (node-fetch v2)
        if (response.buffer) {
            console.log('✓ response.buffer() method available (node-fetch v2)');
        } else {
            console.log('✗ response.buffer() not available');
        }

        console.log('\n✓ Fetch is working correctly!');
    } catch (error) {
        console.error('✗ Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

testFetch();
