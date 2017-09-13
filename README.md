# aws-edge-blocking

Sample project demonstrating how to leverage AWS Lambda@Edge to block high rate requests based on a unique session id stored in client cookie. This project utilizes a two step process, one function at the `viewer-request` event and a second at `origin-request`, tracking the number of requests per client in DynamoDB. There are other methods to implement similar functionality (e.g. AWS WAF, log parsing); however, timeliness was a key consideration here.

## Getting Started


## Prerequisites


## Deployment


## Testing


## License

This project is licensed under the Apache 2.0 License, see [License.md](License.md) for details

## Author

* jkahn@ - initial work