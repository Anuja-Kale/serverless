require('dotenv').config(); // This will load the environment variables from the .env file

const AWS = require('aws-sdk');
const fetch = require('node-fetch');
const { Storage } = require('@google-cloud/storage');
const Mailgun = require('mailgun-js');

// Initialize AWS SDK services
const DynamoDB = new AWS.DynamoDB.DocumentClient();

// Initialize Google Cloud Storage
const storage = new Storage({ keyFilename: process.env.GCS_KEYFILE });
const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);

// Initialize Mailgun with environment variables
const mailgun = Mailgun({
  apiKey: process.env.MAILGUN_API_KEY, // Mailgun API key stored in Lambda environment variable
  domain: process.env.MAILGUN_DOMAIN   // Mailgun domain stored in Lambda environment variable
});

// Lambda handler
exports.handler = async (event) => {
  const snsMessage = JSON.parse(event.Records[0].Sns.Message);

  // URL of the GitHub release
  const githubReleaseUrl = 'https://github.com/tparikh/myrepo/archive/refs/tags/v1.0.0.zip';

  try {
    // Download the file from GitHub
    const response = await fetch(githubReleaseUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${githubReleaseUrl}: ${response.statusText}`);
    }
    const buffer = await response.buffer();

    // Upload to Google Cloud Storage
    const gcsFileName = 'myrepo-v1.0.0.zip';
    const file = bucket.file(gcsFileName);
    await file.save(buffer);

    // Send email notification
    const emailData = {
      from: `Your Name <${process.env.EMAIL_FROM}>`, // Sender's email
      to: process.env.EMAIL_TO,                      // Recipient's email
      subject: 'Download Status',
      text: `Your download of ${gcsFileName} is completed and stored in Google Cloud Storage.`
    };

    await mailgun.messages().send(emailData);

    // Track email in DynamoDB
    const emailRecord = {
      TableName: process.env.DYNAMODB_TABLE,         // DynamoDB table name from environment variable
      Item: {
        id: `email-${Date.now()}`,                   // Unique ID for the email record
        to: emailData.to,
        from: emailData.from,
        subject: emailData.subject,
        timestamp: new Date().toISOString()
      }
    };

    await DynamoDB.put(emailRecord).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Download and email notification complete' }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'An error occurred', error: error.message }),
    };
  }
};
