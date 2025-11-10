const fetch = require('node-fetch');
require('dotenv').config();

async function testCloudinaryFetch() {
    // Replace this with an actual file URL from your database
    const testUrl = 'YOUR_CLOUDINARY_URL_HERE';

    console.log('Testing Cloudinary file fetch...');
    console.log('URL:', testUrl);

    try {
        const response = await fetch(testUrl);
        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));

        if (!response.ok) {
            const text = await response.text();
            console.log('Error response:', text);
            return;
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        console.log('Success! File size:', buffer.length, 'bytes');
        console.log('First 100 bytes:', buffer.slice(0, 100).toString('hex'));
    } catch (error) {
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

testCloudinaryFetch();
