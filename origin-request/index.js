
///////// SAMPLE CODE ONLY /////////

'use strict'

//---- ENVIRONMENT VARIABLES ----//

/// AWS Region in which supporting DynamoDB table exists (e.g. us-east-1, us-west-2)
const TABLE_REGION = (process.env.AWS_SAM_LOCAL) ? 'us-east-1' : process.env.TABLE_REGION
/// Name of the DynamoDB table
const TABLE_NAME = (process.env.AWS_SAM_LOCAL) ? 'edge-blocking' : process.env.TABLE_NAME
/// Name of the cookie that identifies the session ID
const SESSION_ID_COOKIE_NAME = process.env.SESSION_ID_COOKIE_NAME
/// Name of the cookie that indicates a client is over rate limit
const OVER_LIMIT_COOKIE_NAME = process.env.OVER_LIMIT_COOKIE_NAME
/// Maximum number of requests allows per minute
const MAX_REQUESTS_PER_MINUTE = Number(process.env.MAX_REQUESTS_PER_MINUTE)
/// Time (in milliseconds) before refill of tokens in bucket
const REFILL_TIME = Number(process.env.REFILL_PERIOD_IN_SECONDS) * 1000
/// Amount of refill per period defined by REFILL_TIME
const REFILL_AMOUNT = Number(process.env.REFILL_AMOUNT)

//---- DEPENDENCIES ----//

// const util = require('util')
const AWS = require('aws-sdk')
AWS.config.update({ region: TABLE_REGION })
const ddb = new AWS.DynamoDB.DocumentClient()

//---- UTILITY ----//

function OverLimitError() {}
OverLimitError.prototype = Object.create(Error.prototype)
OverLimitError.constructor = OverLimitError

/// Response to indicate over limit
const rateLimitResponse = {
  status: '429',
  statusDescription: 'Too Many Requests',
  headers: {
    'set-cookie': [{
      'key': 'Set-Cookie',
      'value': `${OVER_LIMIT_COOKIE_NAME}=true; secure; path=/; max-age=${REFILL_TIME/1000}`
    }]
  },
  body: ''
}


//---- FUNCTIONS ----//

/**
 * Retrieves the session id (as identified by SESSION_ID_COOKIE_NAME)
 * value from cookies in the request
 * @param  {[type]} request incoming http request
 * @return {[type]}         session id or null if not found
 */
function sessionIdFrom (request) {
  let sessionId = null
  
  if (request.headers['session-id'] && request.headers['session-id'].length > 0) {
    sessionId = request.headers['session-id'][0].value
  }

  return sessionId
}

/**
 * Standard key for records that combines the session id and request uri.
 * @param  {[type]} request http request
 * @return {[type]}         client key
 */
function clientKeyFor (request) {
  let sessionId = sessionIdFrom(request)

  if (sessionId) {
    return `${sessionId}++${request.uri}`
  } else {
    return null
  }
}

/**
 * Calculates the number of periods since last bucket update.
 * @param  {[type]} bucket bucket under operation
 * @return {[type]}        number of periods (int)
 */
function _refillCount (bucket) {
  let timeSince = Date.now() - bucket.lastUpdate
  console.log(`Time since last request: ${Math.floor(timeSince / 1000)} seconds`)
  return Math.floor(timeSince / REFILL_TIME)
}

/**
 * Update the bucket record in DynamoDB with passed data.
 * @param  {[type]} bucket new bucket record data
 * @return {[type]}        Promise of DDB put action
 */
function _updateBucket (bucket) {
  let params = {
    TableName: TABLE_NAME,
    Item: {
      clientKey: bucket.clientKey,
      value: bucket.value,
      lastUpdate: bucket.lastUpdate,
      expiresAt: bucket.lastUpdate + (60 * 60 * 24 * 1000) // in 24 hours
    }
  }

  return ddb.put(params).promise()
}

/**
 * Decrements the number of tokens in the passed bucket by the number of
 * tokens passed as a parameter. Updates the bucket's record in DynamoDB.
 * @param  {[type]} bucket bucket under operation
 * @param  {[type]} tokens number of tokens to decrement
 * @return {[type]}        Promise of result
 */
function reduce (bucket, tokens) {
  let refillCount = _refillCount(bucket)
  bucket.value += refillCount * REFILL_AMOUNT
  bucket.lastUpdate += refillCount * REFILL_TIME

  console.log(`Adding ${refillCount * REFILL_AMOUNT} tokens to the bucket`)

  if (bucket.value >= MAX_REQUESTS_PER_MINUTE) {
    // reset the bucket
    bucket.value = MAX_REQUESTS_PER_MINUTE
    bucket.lastUpdate = Date.now()
  }
  if (tokens > bucket.value) {
    console.log('Not enough tokens remaining in bucket for this request!!')
    return _updateBucket(bucket).then(() => {
      throw new OverLimitError()
    })
  }

  console.log(`Deducting ${tokens} tokens from the bucket - ${bucket.value-1} tokens remaining`)
  bucket.value -= tokens
  return _updateBucket(bucket)
}

/**
 * Loads the bucket indicated by the passed key from DynamoDB or creates
 * a new bucket for use.
 * @param  {[type]} key identified for the client
 * @return {[type]}     Promise of result
 */
function loadBucket (key) {
  let params = {
    TableName: TABLE_NAME,
    Key: { clientKey: key }
  }

  return ddb.get(params).promise()
    .then((data) => {
      if (data.Item) return data.Item

      return {
        clientKey: key,
        value: MAX_REQUESTS_PER_MINUTE,
        lastUpdate: Date.now()
      }
    })
}

/**
 * Main handler. Acts as a rate limiter for a given client identified by a
 * unique session id contained in a cookie (available in header of event).
 * Rate limiting is based on a token bucket model that starts full and then
 * is decremented on each call from the client. The bucket begins to fill
 * again with new tokens being added to the bucket in configured increments
 * per configured time period.
 *
 * For example, the bucket may start with 10 tokens. Each request will decrement
 * 1 token from the bucket. Once empty, a rate limit response (429 HTTP code)
 * is returned. If we refill the bucket with 1 token every 60 seconds (or 1 
 * minute), the bucket will refill when the client is not active.
 *
 * For higher thresholds, we can modify the configuration to enlarge the initial
 * bucket (i.e. the number of requests we are willing to tolerate before blocking),
 * decrease the refill period or the number of tokens per period.
 * 
 * @param  event
 * @param  context
 * @param  callback
 */
exports.handler = (event, context, callback) => {
  // console.log(util.inspect(event, { depth: 10 }))

  let request = event.Records[0].cf.request
  const key = clientKeyFor(request)

  // if there is no session id, just return request and move on...
  if (!key) {
    callback(null, request)
  }
  
  loadBucket(key)
    .then((bucket) => {
      return reduce(bucket, 1)
    })
    .then(() => callback(null, request))
    .catch((error) => {
      if (error instanceof OverLimitError) {
        callback(null, rateLimitResponse)
      } else {
        callback(error)
      }
    })
}
