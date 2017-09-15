# aws-edge-blocking

Sample project demonstrating how to leverage AWS Lambda@Edge to block high rate requests based on a unique session id stored in client cookie. This project utilizes a two step process, one function at the `viewer-request` event and a second at `origin-request`, tracking the number of requests per client in DynamoDB. There are other methods to implement similar functionality (e.g. AWS WAF, log parsing); however, timeliness was a key consideration here.

NOTE: Running these functions with Lambda@Edge will require: (1) they be deployed to us-east-1, (2) versioned and configured with appropriate triggers, and (3) environment variables replaced.

## Getting Started

To get started, clone this repository locally:

```
$ git clone https://github.com/jkahn117/aws-edge-blocking
```

The repository contains a [CloudFormation](https://aws.amazon.com/cloudformation/) template and source code to deploy and run a complete sample application.


## Prerequisites

To run the aws-edge-blocking sample, you will need to:

1. Select an AWS Region into which you will deploy services. Be sure that all required services (AWS Lambda and Amazon API Gateway) are available in the Region you select.
2. Confirm your [installation of the latest AWS CLI](http://docs.aws.amazon.com/cli/latest/userguide/installing.html) (at least version 1.11.21).
3. Confirm the [AWS CLI is properly configured](http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html#cli-quick-configuration) with credentials that have administrator access to your AWS account.

## Deployment

AWS resources are managed by the [Serverless Application Model](https://github.com/awslabs/serverless-application-model), which is an extension of CloudFormation.

1. Create a new S3 bucket from which to deploy our source code (for Lambda@Edge, must use us-east-1):

    ```
    $ aws s3 mb s3://<MY_BUCKET_NAME>
    ```

2. Using the SAM, package your source code and serverless stack:

    ```
    $ aws cloudformation package --template-file template.yaml --s3-bucket <MY_BUCKET_NAME> --output-template-file packaged.yaml
    ```

3. Once packaging is complete, deploy the stack:

    ```
    $ aws cloudformation deploy --template-file packaged.yaml --stack-name aws-edge-blocking-sample --capabilities CAPABILITY_IAM
    ```

## Configuring Lambda@Edge Triggers

As mentioned above, before these functions can be used with Lambda@Edge, you will need to remove use of Lambda Environment Variables by modifying the source code. I have included here to demonstrate that these can be changed and for ease of testing outside of the Edge environment.

The guide [Creating Lambda Functions and Adding Triggers](http://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-create-functions.html) describes how to configure CloudFront triggers for Lambda. It is extremely important that the functions be tied to appropriate [CloudFront Event](http://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-cloudfront-trigger-events.html) (i.e. viewer-request and origin-request).


## Cleaning Up

Finally, we will clean up the AWS environment using CloudFormation:

```
$ aws cloudformation delete-stack --stack-name aws-edge-blocking-sample
```

## Additional Work

The monitoring algorithm requires further evolution, intention here was to provide a barebones mechanism to block by rate and remove that block once a time threshold was surpassed.


## License

This project is licensed under the Apache 2.0 License, see [LICENSE](LICENSE) for details

## Author

* jkahn@ - initial work
