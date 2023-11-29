const AWS = require('aws-sdk');
const https = require('https');
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');
const uuidv4 = require('uuid').v4;
const axios = require('axios');
const { createGzip } = require('zlib');
const { pipeline } = require('stream');
const { promisify } = require('util');

const pipe = promisify(pipeline);

const ses = new AWS.SES();
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const decodedPrivateKey = Buffer.from(process.env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY, 'base64').toString('utf-8');
const parsedObject  = JSON.parse(decodedPrivateKey);

const storage = new Storage({
  projectId: process.env.GCP_PROJECT,
  credentials: {
      client_email: parsedObject.client_email,
      private_key: parsedObject.private_key,
  },
});
const bucketName = process.env.GCP_BUCKET_NAME;

// Send email notification
const sendEmail  = async (recipientEmail, subject, body) => {
  console.log('Sending email');
  const mailgunApiKey = process.env.MAILGUN_API_KEY;
  const domain = 'demo.ashutoshraval.com';
  const mailgunUrl = `https://api.mailgun.net/v3/${domain}/messages`;

  const auth = 'Basic ' + Buffer.from(`api:${mailgunApiKey}`).toString('base64');

  const response = await axios.post(
    mailgunUrl,
    new URLSearchParams({
      from: `Your Service <mailgun@${domain}>`,
      to: recipientEmail,
      subject: subject,
      text: body,
    }),
    {
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );

  return response.data;
};

// Record email event in DynamoDB
const recordEmailEvent = async (email, subject) => {
  console.log('Recording email event');
  const params = {
    TableName: 'EmailRecords', // Replace with your DynamoDB table name
    Item: {
      id: uuidv4(),
      email: email,
      subject: subject,
      timestamp: Date.now(),
    },
  };
  return dynamoDB.put(params).promise();
};

exports.handler = async (event) => {
  const recipientEmail = 'kale.an@northeastern.edu'; // Updated recipient email

  try {
    const releaseUrl = 'https://github.com/tparikh/myrepo/archive/refs/tags/v1.0.0.zip';
    const tempFilePath = '/tmp/release.zip';

    const writer = fs.createWriteStream(tempFilePath);
    const response = await axios.get(releaseUrl, { responseType: 'stream' });

    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    console.log('Release downloaded successfully.');

    const fileName = `release-${uuidv4()}.zip`; // Updated file naming convention
    await storage.bucket(bucketName).upload(tempFilePath, {
      destination: fileName,
    });
    const gcsFilePath = `gs://${bucketName}/${fileName}`;
    console.log(`Release uploaded to Google Cloud Storage at: ${gcsFilePath}`);

    // Send email notification
    const emailSubject = 'Download Complete';
    const emailBody = `Your file has been downloaded and uploaded to: ${gcsFilePath}`;
    await sendEmail(recipientEmail, emailSubject, emailBody);

    // Record the email event in DynamoDB
    await recordEmailEvent(recipientEmail, emailSubject);

    return { statusCode: 200, body: 'Success' };
  } catch (error) {
    console.error('Error:', error);

    // Send email notification about the failure
    await sendEmail(recipientEmail, 'Download Failed', `An error occurred while processing your file. ${error}`);

    // Record the failed email event in DynamoDB
    await recordEmailEvent(recipientEmail, 'Download Failed');

    return { statusCode: 500, body: 'Error during download and upload' };
  }
};
