# Serverless Infrastructure and Web Application

This repository is designed to manage and implement a serverless infrastructure for a web application using AWS Lambda, Amazon Simple Notification Service (SNS), and Google Cloud Storage (GCS), all configured with Pulumi as the infrastructure as code (IaC) tool.

## Features

### Amazon Simple Notification Service Configuration

- **Pulumi**: Used to create an Amazon SNS topic for handling event notifications.

### Web Application Updates

- **API Spec**: Refer to the detailed API specifications [here](https://app.swaggerhub.com/apis-docs/csye6225-webapp/cloud-native-webapp/fall2023-a9).
- POST requests for assignment submissions are supported with retry logic.
- Submissions are time-bound and rejected past their due dates.
- SNS topics receive submission data and user information.

### Lambda Function Implementation

- Triggered by SNS notifications.
- Downloads releases from the GitHub repository.
- Stores downloads in Google Cloud Storage Buckets.
- Sends download status emails to users.
- Records email transactions in DynamoDB.

### Google Cloud Setup

- Create `dev` and `demo` projects via the Google Cloud Console.
- Enable the required Google Cloud services.
- Authenticate local gcloud CLI for project management.

### Infrastructure as Code Updates with Pulumi

- Creation of GCS buckets and Google Service Accounts.
- Configuration of Lambda Functions with access keys and bucket names.
- Setup of email server configurations for Lambda Functions.
- Creation of a DynamoDB instance for logging purposes.
- Establishment of necessary IAM roles and policies for Lambda execution.

## Getting Started

1. Clone the repository to your local machine:
git clone [repository-url]

2. Install the required dependencies:
npm install

3. Deploy the infrastructure using Pulumi:
pulumi up


## Prerequisites

- AWS CLI, configured for access to your AWS account.
- Google Cloud CLI, authenticated for your Google Cloud projects.
- Pulumi CLI, installed and configured.


## Acknowledgments

- Thanks to AWS for Lambda and SNS services.
- Gratitude towards Google Cloud for their storage solutions.
- Appreciation for Pulumi for their IaC support.

