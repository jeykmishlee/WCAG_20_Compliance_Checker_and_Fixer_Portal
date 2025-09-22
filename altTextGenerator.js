const { ImageAnnotatorClient } = require('@google-cloud/vision');
const axios = require('axios');
const config = require('./config');

const client = new ImageAnnotatorClient({
    keyFilename: config.googleCloudCredentials
});

// Get fallback if ever generateAltText fails
function getFallbackAltText(imageUrl) {
    try {
        const parsedUrl = new URL(imageUrl);
        const pathParts = parsedUrl.pathname.split('/').filter(p => p);
        const fileName = pathParts.pop() || 'image';
        const cleanName = fileName
            .replace(/\.[^/.]+$/, '') 
            .replace(/[_-]/g, ' ')  
            .replace(/\d+/g, '')      
            .trim();

            if (cleanName.length > 1) {
                return `Image related to: ${cleanName.split(/(?=[A-Z])/).join(' ')}`;
            } else {
                return 'Website image';
            }
    } catch {
        return `Web page content`;
    }
}

// Main function to generate alt text using Google Vision API
async function generateAltText(imageUrl)  {
    if (imageUrl.toLowerCase().endsWith('.gif')) {
        return 'Animated GIF';
    }

    try {
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 10000
        });

        const [result] = await client.annotateImage({
            image: { content: response.data.toString('base64') },
            features: [
                { type: 'LABEL_DETECTION', maxResults: 6 },
                { type: 'OBJECT_LOCALIZATION', maxResults: 4 },
                { type: 'IMAGE_PROPERTIES' },
                { type: 'TEXT_DETECTION' }
            ]
        });

        const labels = result.labelAnnotations?.map((label) => label.description).filter(Boolean) || [];
        const objects = result.localizedObjectAnnotations?.map((obj) => obj.name).filter(Boolean) || [];
        const descriptions = [...labels, ...objects];

        return descriptions.length > 0 
            ? descriptions.slice(0, 7).join(', ')
            : getFallbackAltText(imageUrl) || 'Descriptive image';

    } catch (error) {
        console.log('Vision analysis failed, using fallback:', error.message);
        return getFallbackAltText(imageUrl) || 'Descriptive image';
    }
};

module.exports = {
    getFallbackAltText,
    generateAltText
};