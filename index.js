const AWS = require('aws-sdk');
const fetch = require('node-fetch');
const { Storage } = require('@google-cloud/storage');
const Mailgun = require('mailgun-js');
const fs = require('fs').promises;

// AWS services initialization
const s3 = new AWS.S3();
const DynamoDB = new AWS.DynamoDB.DocumentClient();

// Mailgun initialization with environment variables
const mailgun = Mailgun({
  apiKey: process.env.MAILGUN_API_KEY,
  domain: process.env.MAILGUN_DOMAIN
});

exports.handler = async (event) => {
  // Parse the SNS message
  const snsMessage = JSON.parse(event.Records[0].Sns.Message);

  // Define the S3 bucket and key name for the Google Cloud key file
  const bucketName = process.env.S3_BUCKET_NAME_FOR_GCS_KEY;
  const keyName = process.env.S3_KEY_NAME_FOR_GCS_KEY;

  // Temporary path for the Google Cloud key file
  const tmpKeyFilePath = `/tmp/${keyName}`;

  try {
    // Check if the key file exists in the /tmp directory, if not, get it from S3
    try {
      await fs.access(tmpKeyFilePath);
    } catch {
      // Key file is not in /tmp, download it from S3
      const data = await s3.getObject({ Bucket: bucketName, Key: keyName }).promise();
      await fs.writeFile(tmpKeyFilePath, data.Body);
    }

    // Initialize Google Cloud Storage with the key file
    const storage = new Storage({ keyFilename: tmpKeyFilePath });
    const gcsBucket = storage.bucket(process.env.GCS_BUCKET_NAME);

    // GitHub release URL
    const githubReleaseUrl = 'https://github.com/tparikh/myrepo/archive/refs/tags/v1.0.0.zip';

    // Download the GitHub release
    const response = await fetch(githubReleaseUrl);
    if (!response.ok) throw new Error(`Failed to fetch ${githubReleaseUrl}: ${response.statusText}`);
    const buffer = await response.buffer();

    // Upload the file to Google Cloud Storage
    const gcsFileName = 'myrepo-v1.0.0.zip';
    const file = gcsBucket.file(gcsFileName);
    await file.save(buffer);

    // Email notification data
    const emailData = {
      from: `Your Name <${process.env.EMAIL_FROM}>`,
      to: process.env.EMAIL_TO,
      subject: 'Download Status',
      text: `The download of ${gcsFileName} is complete and stored in Google Cloud Storage.`
    };

    // Send email notification
    await mailgun.messages().send(emailData);

    // Log the email sent in DynamoDB
    const emailRecord = {
      TableName: process.env.DYNAMODB_TABLE,
      Item: {
        id: `email-${Date.now()}`,
        to: emailData.to,
        from: emailData.from,
        subject: emailData.subject,
        timestamp: new Date().toISOString()
      }
    };

    await DynamoDB.put(emailRecord).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Download and email notification complete.' })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'An error occurred', error: error.message })
    };
  }
};
