const AWS = require('aws-sdk');
const fetch = require('node-fetch');
const { Storage } = require('@google-cloud/storage');
const Mailgun = require('mailgun-js');
const SecretsManager = new AWS.SecretsManager();
const DynamoDB = new AWS.DynamoDB.DocumentClient();

// Fetch secret from AWS Secrets Manager
async function getSecret(secretArn) {
    try {
        const data = await SecretsManager.getSecretValue({ SecretId: secretArn }).promise();
        return data.SecretString ? data.SecretString : Buffer.from(data.SecretBinary, 'base64').toString('ascii');
    } catch (error) {
        console.error('Error fetching secret:', error);
        throw error;
    }
}

// Initialize Mailgun with the Mailgun API Key and domain fetched from Secrets Manager
async function initMailgun() {
    const mailgunApiKey = await getSecret(process.env.MAILGUN_API_KEY_SECRET_ARN);
    const mailgunDomain = await getSecret(process.env.MAILGUN_DOMAIN_SECRET_ARN);
    return Mailgun({ apiKey: mailgunApiKey, domain: mailgunDomain });
}

// Log events to DynamoDB
async function logDynamoDB(requestId, userEmail, status, info, tableName) {
    const item = {
        RequestId: requestId,
        UserEmail: userEmail,
        Status: status,
        Info: info
    };
    return DynamoDB.put({ TableName: tableName, Item: item }).promise();
}

exports.handler = async (event) => {
    // Parse the SNS message
    const snsMessage = JSON.parse(event.Records[0].Sns.Message);

    // Fetch secrets
    const GCS_BUCKET_NAME = JSON.parse(await getSecret(process.env.GCS_BUCKET_SECRET_ARN));
    const DYNAMODB_TABLE = JSON.parse(await getSecret(process.env.DYNAMODB_TABLE_SECRET_ARN));
    const GCP_SERVICE_ACCOUNT_KEY = JSON.parse(await getSecret(process.env.GCP_SERVICE_ACCOUNT_SECRET_ARN));

    // Initialize Google Cloud Storage
    const storage = new Storage({ credentials: GCP_SERVICE_ACCOUNT_KEY });
    const gcsBucket = storage.bucket(GCS_BUCKET_NAME);

    // Initialize Mailgun
    const mailgun = await initMailgun();

    // GitHub release URL
    const githubReleaseUrl = snsMessage.githubReleaseUrl;

    try {
        // Stream the GitHub release to GCS
        const response = await fetch(githubReleaseUrl);
        if (!response.ok) throw new Error(`Failed to fetch ${githubReleaseUrl}: ${response.statusText}`);

        const gcsFileName = `${Date.now()}-release.zip`;
        const file = gcsBucket.file(gcsFileName);
        await file.save(await response.buffer());

        // Construct the submission link for the file in GCS
        const submissionLink = `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${gcsFileName}`;

        // Send Email Notification using Mailgun
        const emailData = {
            from: `Your Name <${process.env.EMAIL_FROM}>`,
            to: process.env.EMAIL_TO,
            subject: 'Download Status',
            text: `The download of the release is complete and stored in Google Cloud Storage. Access it here: ${submissionLink}`
        };
        await mailgun.messages().send(emailData);

        // Log the email sent in DynamoDB
        await logDynamoDB(Date.now().toString(), process.env.EMAIL_TO, 'Success', `File uploaded to GCS. Submission link: ${submissionLink}`, DYNAMODB_TABLE);

        return { statusCode: 200, body: JSON.stringify({ message: 'Download and email notification complete.' }) };
    } catch (error) {
        console.error('Error:', error);
        await logDynamoDB(Date.now().toString(), process.env.EMAIL_TO, 'Error', error.message, DYNAMODB_TABLE);
        return { statusCode: 500, body: JSON.stringify({ message: 'An error occurred', error: error.message }) };
    }
};
