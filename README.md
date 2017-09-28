# aws-edge-rate-limiting

Sample project demonstrating how to leverage AWS Lambda@Edge to block high rate requests based on a unique session id stored in client cookie. This project utilizes a two step process, one function at the `viewer-request` event and a second at `origin-request`, tracking the number of requests per client in DynamoDB. There are other methods to implement similar functionality (e.g. AWS WAF, log parsing); however, timeliness was a key consideration here.

NOTE: Running these functions with Lambda@Edge will require: (1) they be deployed to us-east-1, (2) versioned and configured with appropriate triggers, and (3) environment variables removed and added as constants in the function.

## Getting Started

To get started, clone this repository locally:

```
$ git clone https://github.com/jkahn117/aws-edge-blocking
```

The repository contains a [CloudFormation](https://aws.amazon.com/cloudformation/) template and source code to deploy and run a complete sample application.


## Prerequisites

To run the aws-edge-rate-limiting sample, you will need to:

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

### CloudFront

In order to ensure all requests are passed to the origin, such that we can monitor using the origin-request event, be sure to set all TTLs (minimum, maximum, and desired) for the Behavior to 0. Ideally, this is only done on a small number of behaviors.

## Lambda@Edge

As mentioned above, before these functions can be used with Lambda@Edge, you will need to remove use of Lambda Environment Variables by modifying the function code. Environment Variables are included here for easy testing (e.g. using SAM Local) before deploying to the Edge.

Once you have modified the function code so as not to use Environment Variables, (1) create a new version of the Lambda function and (2) [configure CloudFront triggers](http://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-create-functions.html). Be sure to tie the appropriate function to the appropriate [CloudFront Event](http://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-cloudfront-trigger-events.html) type (i.e. Origin Request and Viewer Request).

### Rate Limiting Algorithm

The rate limiting algorithm used here is based on a token bucket (or "leaky bucket") as adapted from this [article on smyte.blog](https://medium.com/smyte/rate-limiter-df3408325846). In essence, each client has a bucket that starts full and is decremented one token on each request from that client. After a period of time (the refill period), the bucket is refilled with a given number of tokens. The bucket can never exceed a maximum amount (of fullness).

For example:

> Each client is allowed 10 requests per minute, refilling with one token request per minute.

This approach is quite flexible as we can configure: (1) maximum requests per period, (2) refill period, and (3) refill amount per period. Clients that exceed the desired rate limit will quickly find requests rejected while allowing properly behaved clients to continue as is. Misbehaved clients will build up tokens as they back off and can begin to behave properly without consequence once they do so.

## Cleaning Up

Finally, we will clean up the AWS environment using CloudFormation:

```
$ aws cloudformation delete-stack --stack-name aws-edge-blocking-sample
```

## License

This project is licensed under the Apache 2.0 License, see [LICENSE](LICENSE) for details

## Author

* jkahn@ - initial work
